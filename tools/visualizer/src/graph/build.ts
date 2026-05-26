// AST → Graph construction pipeline.
// Implements the 6-step build order from GRAPH_VIEW.md § Graph Construction Order.
//
// Note on per-worker duplication: an activity, workflow, or nexus service
// that is registered on N workers is rendered as N distinct nodes — one
// per registration — so the "this thing has multiple homes" fact is
// visible directly in the canvas instead of collapsing into a single
// node with one (last-wins) parent. The duplicates share a stable
// `definitionKey`, and `Graph.duplicateGroups` lets the view keep
// sister copies undimmed during hover/select interactions.

import type { TWFFile, Definition, Statement, AsyncTarget } from '../types/ast'
import type { Graph, GraphNode, GraphEdge, NodeType } from './model'
import { nodeId, workerScopedNodeId, definitionKey, nexusOperationName } from './model'

// IDs are always "${nodeType}:${name}[@worker]" — split on the first colon
// so names with embedded colons survive the round-trip.
function nodeTypeFromId(id: string): NodeType {
  const i = id.indexOf(':')
  return (i < 0 ? id : id.slice(0, i)) as NodeType
}

export function buildGraph(ast: TWFFile): Graph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let edgeSeq = 0

  function addNode(node: GraphNode) {
    nodes.set(node.id, node)
  }

  function addEdge(edge: Omit<GraphEdge, 'id' | 'sourceNodeType' | 'targetNodeType'>) {
    edges.push({
      ...edge,
      id: `e${edgeSeq++}`,
      sourceNodeType: nodeTypeFromId(edge.sourceId),
      targetNodeType: nodeTypeFromId(edge.targetId),
    })
  }

  // Pre-index definitions by type+name for lookups
  const defsByType = new Map<string, Definition>()
  for (const def of ast.definitions) {
    defsByType.set(`${def.type}:${def.name}`, def)
  }

  // --- Step 1: Namespace nodes ---
  for (const def of ast.definitions) {
    if (def.type === 'namespaceDef') {
      const id = nodeId('namespace', def.name)
      addNode({
        id,
        level: 1,
        nodeType: 'namespace',
        name: def.name,
        sourceFile: def.sourceFile,
        orphan: false, // namespaces are top-level, never orphans
        definitionKey: definitionKey('namespace', def.name),
      })
    }
  }

  // --- Step 2: Worker nodes; attach to parent namespace ---
  // Build reverse map: workerName → namespaceName
  const workerToNamespace = new Map<string, string>()
  for (const def of ast.definitions) {
    if (def.type === 'namespaceDef') {
      for (const w of def.workers || []) {
        workerToNamespace.set(w.workerName, def.name)
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.type === 'workerDef') {
      const nsName = workerToNamespace.get(def.name)
      const parentNsId = nsName ? nodeId('namespace', nsName) : undefined
      const id = nodeId('worker', def.name)
      addNode({
        id,
        level: 2,
        nodeType: 'worker',
        name: def.name,
        sourceFile: def.sourceFile,
        parentId: parentNsId,
        orphan: !parentNsId,
        definitionKey: definitionKey('worker', def.name),
      })
      if (parentNsId) {
        addEdge({
          edgeType: 'containment',
          sourceId: id,
          targetId: parentNsId,
          sourceLevel: 2,
          targetLevel: 1,
        })
      }
    }
  }

  // --- Step 3: L3 nodes from worker registrations; orphan detection ---
  //
  // Per the duplication note at the top of this file, each worker
  // registration of a definition yields its own node with a worker-scoped
  // id. We track which underlying definitions saw at least one
  // registration so the orphan pass below doesn't redundantly add an
  // unscoped node for the same name.
  const registeredDefs = new Set<string>()

  // node id → worker name (1:1 now that nodes are worker-scoped). Used by
  // step 5 to project L3 dependency edges up to the worker tier.
  const nodeToWorker = new Map<string, string>()

  // definition key → ordered list of node ids that represent it. Walking
  // the worker registrations in document order means the list ordering
  // is stable across runs, which keeps the duplicate-group display
  // predictable.
  const copiesByDefKey = new Map<string, string[]>()

  function recordCopy(defKey: string, nId: string) {
    const list = copiesByDefKey.get(defKey) ?? []
    list.push(nId)
    copiesByDefKey.set(defKey, list)
  }

  for (const def of ast.definitions) {
    if (def.type !== 'workerDef') continue
    const workerId = nodeId('worker', def.name)

    for (const ref of def.workflows || []) {
      const nType: NodeType = 'workflow'
      const defKey = definitionKey(nType, ref.name)
      const nId = workerScopedNodeId(nType, ref.name, def.name)
      // Defensive: the same worker shouldn't list the same workflow
      // twice, but if a malformed AST does, drop the duplicate so we
      // don't emit a second containment edge pointing to the same
      // worker.
      if (nodes.has(nId)) continue
      registeredDefs.add(defKey)
      nodeToWorker.set(nId, def.name)
      recordCopy(defKey, nId)
      const wfDef = defsByType.get(`workflowDef:${ref.name}`)
      addNode({
        id: nId, level: 3, nodeType: nType, name: ref.name,
        sourceFile: wfDef?.sourceFile, parentId: workerId, orphan: false,
        definitionKey: defKey,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 3, targetLevel: 2 })
    }

    for (const ref of def.activities || []) {
      const nType: NodeType = 'activity'
      const defKey = definitionKey(nType, ref.name)
      const nId = workerScopedNodeId(nType, ref.name, def.name)
      if (nodes.has(nId)) continue
      registeredDefs.add(defKey)
      nodeToWorker.set(nId, def.name)
      recordCopy(defKey, nId)
      const actDef = defsByType.get(`activityDef:${ref.name}`)
      addNode({
        id: nId, level: 4, nodeType: nType, name: ref.name,
        sourceFile: actDef?.sourceFile, parentId: workerId, orphan: false,
        definitionKey: defKey,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 4, targetLevel: 2 })
    }

    for (const ref of def.services || []) {
      const nType: NodeType = 'nexusService'
      const defKey = definitionKey(nType, ref.name)
      const nId = workerScopedNodeId(nType, ref.name, def.name)
      if (nodes.has(nId)) continue
      registeredDefs.add(defKey)
      nodeToWorker.set(nId, def.name)
      recordCopy(defKey, nId)
      const nsDef = defsByType.get(`nexusServiceDef:${ref.name}`)
      // Nexus services live at the hosting tier (L2) alongside workers — a
      // service is a callable API surface registered on a worker, peer to
      // the worker rather than nested below it. The containment edge is
      // intra-L2 (service → worker) marking that hosting relationship.
      addNode({
        id: nId, level: 2, nodeType: nType, name: ref.name,
        sourceFile: nsDef?.sourceFile, parentId: workerId, orphan: false,
        definitionKey: defKey,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 2, targetLevel: 2 })
    }
  }

  // Add orphan L3 nodes (definitions not registered on any worker).
  // Orphans get a single unscoped node — there's no worker to scope
  // against — and form a duplicate group of size 1.
  for (const def of ast.definitions) {
    if (def.type === 'workflowDef') {
      const defKey = definitionKey('workflow', def.name)
      if (registeredDefs.has(defKey)) continue
      const id = workerScopedNodeId('workflow', def.name)
      recordCopy(defKey, id)
      addNode({
        id, level: 3, nodeType: 'workflow', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
        definitionKey: defKey,
      })
    } else if (def.type === 'activityDef') {
      const defKey = definitionKey('activity', def.name)
      if (registeredDefs.has(defKey)) continue
      const id = workerScopedNodeId('activity', def.name)
      recordCopy(defKey, id)
      addNode({
        id, level: 4, nodeType: 'activity', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
        definitionKey: defKey,
      })
    } else if (def.type === 'nexusServiceDef') {
      const defKey = definitionKey('nexusService', def.name)
      if (registeredDefs.has(defKey)) continue
      const id = workerScopedNodeId('nexusService', def.name)
      recordCopy(defKey, id)
      addNode({
        id, level: 2, nodeType: 'nexusService', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
        definitionKey: defKey,
      })
    }
  }

  // --- Step 3b: NexusOperation nodes from nexus service definitions ---
  //
  // Each operation under a nexusServiceDef becomes its own L3 node,
  // parented to its service via a containment edge. When the service is
  // duplicated across N workers we duplicate every operation N times
  // too — each operation copy parents to one service copy, so the call
  // chain `caller → operation → backing` stays per-worker-coherent.
  // Orphan services produce a single unscoped operation node.
  function operationNodeId(serviceName: string, opName: string, workerName?: string): string {
    return workerScopedNodeId('nexusOperation', nexusOperationName(serviceName, opName), workerName)
  }

  for (const def of ast.definitions) {
    if (def.type !== 'nexusServiceDef') continue
    const serviceDefKey = definitionKey('nexusService', def.name)
    const serviceCopies = copiesByDefKey.get(serviceDefKey) ?? []
    if (serviceCopies.length === 0) continue // no node was added for this service

    for (const op of def.operations || []) {
      const opDefKey = definitionKey('nexusOperation', nexusOperationName(def.name, op.name))
      for (const serviceId of serviceCopies) {
        const ownerWorker = nodeToWorker.get(serviceId)
        const opId = operationNodeId(def.name, op.name, ownerWorker)
        if (nodes.has(opId)) continue
        addNode({
          id: opId,
          level: 3,
          nodeType: 'nexusOperation',
          name: op.name,
          sourceFile: def.sourceFile,
          parentId: serviceId,
          orphan: !ownerWorker,
          definitionKey: opDefKey,
        })
        recordCopy(opDefKey, opId)
        addEdge({ edgeType: 'containment', sourceId: opId, targetId: serviceId, sourceLevel: 3, targetLevel: 2 })
        if (ownerWorker) {
          nodeToWorker.set(opId, ownerWorker)
        }
      }
    }
  }

  // --- Step 4: L3 dependency edges (workflow / activity / operation → callee) ---
  //
  // With per-worker duplication, every call site fans out across copies:
  // if a caller has C copies and a callee has T copies, we emit C × T
  // edges (one per worker pairing). The dedup key below absorbs
  // structural repetition — a workflow that calls the same activity from
  // multiple branches still yields one edge per (caller copy, callee
  // copy) pair, not one per call site.
  //
  // Nexus calls dedupe per (caller, operation) pair regardless of
  // endpoint — the graph answers "does X reach Y?" not "via how many
  // endpoints". The endpoint of a representative call site is preserved
  // as hover metadata on the surviving edge.
  const depKeys = new Set<string>()

  function addCallDependency(
    sourceNodeId: string, targetNodeId: string,
    endpoint?: string,
  ) {
    if (!nodes.has(targetNodeId)) return
    if (sourceNodeId === targetNodeId) return

    const key = `${sourceNodeId}→${targetNodeId}`
    if (depKeys.has(key)) return
    depKeys.add(key)

    const src = nodes.get(sourceNodeId)
    const tgt = nodes.get(targetNodeId)
    addEdge({
      edgeType: 'dependency',
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      sourceLevel: src?.level ?? 3,
      targetLevel: tgt?.level ?? 3,
      ...(endpoint && { nexusEndpoint: endpoint }),
    })
  }

  function copiesOf(defKey: string): string[] {
    return copiesByDefKey.get(defKey) ?? []
  }

  // Fan out a call to every copy of the callee. With one copy this is the
  // old 1:1 behaviour; with N copies the caller depends on all of them
  // (Temporal task-queue dispatch reaches whichever worker hosts the
  // callee — there's no "primary" copy to single out).
  function emitCall(sourceNodeId: string, calleeDefKey: string, endpoint?: string) {
    for (const targetId of copiesOf(calleeDefKey)) {
      addCallDependency(sourceNodeId, targetId, endpoint)
    }
  }

  // Async operation → backing workflow ("operation is implemented by …").
  // Each operation copy connects to every copy of the backing workflow;
  // step 5's worker projection drops the same-worker pairings into
  // self-loops and the dedup pass keeps the cross-worker pairings.
  for (const def of ast.definitions) {
    if (def.type !== 'nexusServiceDef') continue
    for (const op of def.operations || []) {
      if (op.opType !== 'async' || !op.workflowName) continue
      const opDefKey = definitionKey('nexusOperation', nexusOperationName(def.name, op.name))
      const backingDefKey = definitionKey('workflow', op.workflowName)
      for (const opId of copiesOf(opDefKey)) {
        emitCall(opId, backingDefKey)
      }
    }
  }

  function walkTarget(target: AsyncTarget, callerNodeId: string) {
    if (target.activity) {
      emitCall(callerNodeId, definitionKey('activity', target.activity.name))
    }
    if (target.workflow) {
      emitCall(callerNodeId, definitionKey('workflow', target.workflow.name))
    }
    if (target.nexus) {
      emitCall(
        callerNodeId,
        definitionKey('nexusOperation', nexusOperationName(target.nexus.service, target.nexus.operation)),
        target.nexus.endpoint,
      )
    }
  }

  function walkStmts(stmts: Statement[], callerNodeId: string) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case 'activityCall':
          emitCall(callerNodeId, definitionKey('activity', stmt.name))
          break
        case 'workflowCall':
          emitCall(callerNodeId, definitionKey('workflow', stmt.name))
          break
        case 'nexusCall':
          emitCall(
            callerNodeId,
            definitionKey('nexusOperation', nexusOperationName(stmt.service, stmt.operation)),
            stmt.endpoint,
          )
          break
        case 'await':
          walkTarget(stmt.target, callerNodeId)
          break
        case 'promise':
          walkTarget(stmt.target, callerNodeId)
          break
        case 'awaitAll':
          walkStmts(stmt.body || [], callerNodeId)
          break
        case 'awaitOne':
          for (const c of stmt.cases || []) {
            if (c.target) walkTarget(c.target, callerNodeId)
            if (c.awaitAll) walkStmts(c.awaitAll.body || [], callerNodeId)
            walkStmts(c.body || [], callerNodeId)
          }
          break
        case 'if':
          walkStmts(stmt.body || [], callerNodeId)
          walkStmts(stmt.elseBody || [], callerNodeId)
          break
        case 'for':
          walkStmts(stmt.body || [], callerNodeId)
          break
        case 'switch':
          for (const c of stmt.cases || []) walkStmts(c.body || [], callerNodeId)
          if (stmt.default) walkStmts(stmt.default, callerNodeId)
          break
      }
    }
  }

  // Walk all workflow and sync nexus operation bodies for dependency edges.
  // Activities are intentionally excluded: activities cannot call other
  // activities or workflows (Temporal does not support this), so no outgoing
  // dependency edges originate from activity nodes.
  //
  // Each caller copy gets its own walk — copies of the same definition share
  // a body but each ends up with its own outgoing edge set in the graph,
  // which is what makes the duplication legible in the dependency view.
  for (const def of ast.definitions) {
    if (def.type === 'workflowDef') {
      const callerDefKey = definitionKey('workflow', def.name)
      for (const callerNodeId of copiesOf(callerDefKey)) {
        walkStmts(def.body || [], callerNodeId)
        for (const s of def.signals || []) walkStmts(s.body || [], callerNodeId)
        for (const q of def.queries || []) walkStmts(q.body || [], callerNodeId)
        for (const u of def.updates || []) walkStmts(u.body || [], callerNodeId)
      }
    } else if (def.type === 'nexusServiceDef') {
      for (const op of def.operations || []) {
        if (op.opType !== 'sync' || !op.body) continue
        const opDefKey = definitionKey('nexusOperation', nexusOperationName(def.name, op.name))
        for (const opId of copiesOf(opDefKey)) {
          walkStmts(op.body, opId)
        }
      }
    }
  }

  // --- Step 5: Project L3/L4 dependencies up to Worker→Worker; discard self-loops ---
  const workerDeps = new Set<string>() // "sourceWorker→targetWorker"
  for (const edge of edges) {
    if (edge.edgeType !== 'containment' && edge.sourceLevel >= 3 && edge.targetLevel >= 3) {
      const srcWorker = nodeToWorker.get(edge.sourceId)
      const tgtWorker = nodeToWorker.get(edge.targetId)
      if (srcWorker && tgtWorker && srcWorker !== tgtWorker) {
        const key = `${srcWorker}→${tgtWorker}`
        if (!workerDeps.has(key)) {
          workerDeps.add(key)
          addEdge({
            edgeType: 'dependency',
            sourceId: nodeId('worker', srcWorker),
            targetId: nodeId('worker', tgtWorker),
            sourceLevel: 2,
            targetLevel: 2,
          })
        }
      }
    }
  }

  // --- Step 6: Project Worker dependencies up to Namespace→Namespace; discard self-loops ---
  const nsDeps = new Set<string>() // "sourceNS→targetNS"
  for (const edge of edges) {
    if (edge.edgeType === 'dependency' && edge.sourceLevel === 2 && edge.targetLevel === 2) {
      const srcNode = nodes.get(edge.sourceId)
      const tgtNode = nodes.get(edge.targetId)
      if (srcNode?.parentId && tgtNode?.parentId && srcNode.parentId !== tgtNode.parentId) {
        const key = `${srcNode.parentId}→${tgtNode.parentId}`
        if (!nsDeps.has(key)) {
          nsDeps.add(key)
          addEdge({
            edgeType: 'dependency',
            sourceId: srcNode.parentId,
            targetId: tgtNode.parentId,
            sourceLevel: 1,
            targetLevel: 1,
          })
        }
      }
    }
  }

  // Materialize the duplicate-group index. Stored as Sets so consumers
  // do constant-time membership checks while computing the hover
  // highlight set.
  const duplicateGroups = new Map<string, Set<string>>()
  for (const [defKey, ids] of copiesByDefKey) {
    duplicateGroups.set(defKey, new Set(ids))
  }

  return { nodes, edges, duplicateGroups }
}
