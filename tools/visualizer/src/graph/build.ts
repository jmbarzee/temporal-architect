// AST → Graph construction pipeline.
// Implements the 6-step build order from GRAPH_VIEW.md § Graph Construction Order.

import type { TWFFile, Definition, Statement, AsyncTarget } from '../types/ast'
import type { Graph, GraphNode, GraphEdge, NodeType } from './model'
import { nodeId } from './model'

// IDs are always "${nodeType}:${name}" — split on the first colon so names with
// embedded colons (rare but possible) survive the round-trip.
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
      addNode({
        id: nodeId('namespace', def.name),
        level: 1,
        nodeType: 'namespace',
        name: def.name,
        sourceFile: def.sourceFile,
        orphan: false, // namespaces are top-level, never orphans
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
      addNode({
        id: nodeId('worker', def.name),
        level: 2,
        nodeType: 'worker',
        name: def.name,
        sourceFile: def.sourceFile,
        parentId: parentNsId,
        orphan: !parentNsId,
      })
      if (parentNsId) {
        addEdge({
          edgeType: 'containment',
          sourceId: nodeId('worker', def.name),
          targetId: parentNsId,
          sourceLevel: 2,
          targetLevel: 1,
        })
      }
    }
  }

  // --- Step 3: L3 nodes from worker registrations; orphan detection ---
  // Track which L3 definitions are registered on a worker
  const registeredL3 = new Set<string>()

  // Map L3 nodeId → worker name. Used by step 5 to project L3 dependency
  // edges up to worker-level (and discard same-worker self-loops). When an
  // L3 node is registered on multiple workers, last-write-wins matches the
  // node's parentId (also last-write-wins in step 3) so the projection stays
  // consistent with the containment story shown in the canvas.
  const l3ToWorker = new Map<string, string>()

  for (const def of ast.definitions) {
    if (def.type !== 'workerDef') continue
    const workerId = nodeId('worker', def.name)

    for (const ref of def.workflows || []) {
      const nType: NodeType = 'workflow'
      const nId = nodeId(nType, ref.name)
      registeredL3.add(`workflowDef:${ref.name}`)
      l3ToWorker.set(nId, def.name)
      const wfDef = defsByType.get(`workflowDef:${ref.name}`)
      addNode({
        id: nId, level: 3, nodeType: nType, name: ref.name,
        sourceFile: wfDef?.sourceFile, parentId: workerId, orphan: false,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 3, targetLevel: 2 })
    }

    for (const ref of def.activities || []) {
      const nType: NodeType = 'activity'
      const nId = nodeId(nType, ref.name)
      registeredL3.add(`activityDef:${ref.name}`)
      l3ToWorker.set(nId, def.name)
      const actDef = defsByType.get(`activityDef:${ref.name}`)
      addNode({
        id: nId, level: 4, nodeType: nType, name: ref.name,
        sourceFile: actDef?.sourceFile, parentId: workerId, orphan: false,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 4, targetLevel: 2 })
    }

    for (const ref of def.services || []) {
      const nType: NodeType = 'nexusService'
      const nId = nodeId(nType, ref.name)
      registeredL3.add(`nexusServiceDef:${ref.name}`)
      l3ToWorker.set(nId, def.name)
      const nsDef = defsByType.get(`nexusServiceDef:${ref.name}`)
      // Nexus services live at the hosting tier (L2) alongside workers — a
      // service is a callable API surface registered on a worker, peer to
      // the worker rather than nested below it. The containment edge is
      // intra-L2 (service → worker) marking that hosting relationship.
      addNode({
        id: nId, level: 2, nodeType: nType, name: ref.name,
        sourceFile: nsDef?.sourceFile, parentId: workerId, orphan: false,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 2, targetLevel: 2 })
    }
  }

  // Add orphan L3 nodes (definitions not registered on any worker)
  for (const def of ast.definitions) {
    if (def.type === 'workflowDef' && !registeredL3.has(`workflowDef:${def.name}`)) {
      addNode({
        id: nodeId('workflow', def.name), level: 3, nodeType: 'workflow', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
      })
    } else if (def.type === 'activityDef' && !registeredL3.has(`activityDef:${def.name}`)) {
      addNode({
        id: nodeId('activity', def.name), level: 4, nodeType: 'activity', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
      })
    } else if (def.type === 'nexusServiceDef' && !registeredL3.has(`nexusServiceDef:${def.name}`)) {
      addNode({
        id: nodeId('nexusService', def.name), level: 2, nodeType: 'nexusService', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
      })
    }
  }

  // --- Step 3b: NexusOperation nodes from nexus service definitions ---
  //
  // Each operation under a nexusServiceDef becomes its own L3 node, parented
  // to the service via a containment edge. This puts the operation on the
  // call path: caller workflow → operation → backing workflow becomes a
  // three-node chain rather than a single direct "caller → backing" edge
  // with the operation hidden as edge metadata. Sync operations have an
  // inline body whose calls are walked in step 4 with the operation as the
  // caller node.
  function nexusOperationId(serviceName: string, opName: string): string {
    return nodeId('nexusOperation', `${serviceName}.${opName}`)
  }

  for (const def of ast.definitions) {
    if (def.type !== 'nexusServiceDef') continue
    const serviceId = nodeId('nexusService', def.name)
    // The service may be orphan (not registered on any worker) — operations
    // inherit that worker assignment (or lack thereof).
    const ownerWorker = l3ToWorker.get(serviceId)
    for (const op of def.operations || []) {
      const opId = nexusOperationId(def.name, op.name)
      addNode({
        id: opId,
        level: 3,
        nodeType: 'nexusOperation',
        name: op.name,
        sourceFile: def.sourceFile,
        parentId: serviceId,
        orphan: !ownerWorker,
      })
      addEdge({ edgeType: 'containment', sourceId: opId, targetId: serviceId, sourceLevel: 3, targetLevel: 2 })
      if (ownerWorker) {
        l3ToWorker.set(opId, ownerWorker)
      }
    }
  }

  // --- Step 4: L3 dependency edges (workflow / activity / operation → callee) ---
  //
  // Track L3 dependency edges to dedupe (e.g. a workflow that calls the same
  // activity from multiple branches still produces a single edge in the
  // graph). Nexus calls dedupe per (caller, operation) pair regardless of
  // endpoint — the graph answers "does X reach Y?" not "via how many
  // endpoints". The endpoint of a representative call site is preserved as
  // hover metadata on the surviving edge.
  const l3DepKeys = new Set<string>()

  function addCallDependency(
    sourceNodeId: string, targetNodeId: string,
    endpoint?: string,
  ) {
    // Skip if target node doesn't exist in graph (e.g. unresolved reference)
    if (!nodes.has(targetNodeId)) return
    // Skip self-loops (e.g. a workflow that calls itself recursively — covered
    // structurally by the workflow node, not a useful edge to draw)
    if (sourceNodeId === targetNodeId) return

    const key = `${sourceNodeId}→${targetNodeId}`
    if (l3DepKeys.has(key)) return
    l3DepKeys.add(key)

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

  // Async operation → backing workflow ("operation is implemented by …").
  // Done as part of step 4 so it goes through the same dedup / target-exists
  // gate as call-site edges.
  for (const def of ast.definitions) {
    if (def.type !== 'nexusServiceDef') continue
    for (const op of def.operations || []) {
      if (op.opType === 'async' && op.workflowName) {
        addCallDependency(
          nexusOperationId(def.name, op.name),
          nodeId('workflow', op.workflowName),
        )
      }
    }
  }

  function walkTarget(target: AsyncTarget, callerNodeId: string) {
    if (target.activity) {
      addCallDependency(callerNodeId, nodeId('activity', target.activity.name))
    }
    if (target.workflow) {
      addCallDependency(callerNodeId, nodeId('workflow', target.workflow.name))
    }
    if (target.nexus) {
      addCallDependency(
        callerNodeId,
        nexusOperationId(target.nexus.service, target.nexus.operation),
        target.nexus.endpoint,
      )
    }
  }

  function walkStmts(stmts: Statement[], callerNodeId: string) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case 'activityCall':
          addCallDependency(callerNodeId, nodeId('activity', stmt.name))
          break
        case 'workflowCall':
          addCallDependency(callerNodeId, nodeId('workflow', stmt.name))
          break
        case 'nexusCall':
          addCallDependency(
            callerNodeId,
            nexusOperationId(stmt.service, stmt.operation),
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

  // Walk all workflow, activity, and sync nexus operation bodies for
  // dependency edges. The operation itself is the caller node for the calls
  // it makes inside its sync body — this is what makes a sync operation
  // node show outgoing edges to the activities/workflows it dispatches.
  for (const def of ast.definitions) {
    if (def.type === 'workflowDef') {
      const callerNodeId = nodeId('workflow', def.name)
      if (!nodes.has(callerNodeId)) continue
      walkStmts(def.body || [], callerNodeId)
      for (const s of def.signals || []) walkStmts(s.body || [], callerNodeId)
      for (const q of def.queries || []) walkStmts(q.body || [], callerNodeId)
      for (const u of def.updates || []) walkStmts(u.body || [], callerNodeId)
    } else if (def.type === 'activityDef') {
      const callerNodeId = nodeId('activity', def.name)
      if (!nodes.has(callerNodeId)) continue
      walkStmts(def.body || [], callerNodeId)
    } else if (def.type === 'nexusServiceDef') {
      for (const op of def.operations || []) {
        if (op.opType !== 'sync' || !op.body) continue
        const callerNodeId = nexusOperationId(def.name, op.name)
        if (!nodes.has(callerNodeId)) continue
        walkStmts(op.body, callerNodeId)
      }
    }
  }

  // --- Step 5: Project L3/L4 dependencies up to Worker→Worker; discard self-loops ---
  const workerDeps = new Set<string>() // "sourceWorker→targetWorker"
  for (const edge of edges) {
    if (edge.edgeType !== 'containment' && edge.sourceLevel >= 3 && edge.targetLevel >= 3) {
      const srcWorker = l3ToWorker.get(edge.sourceId)
      const tgtWorker = l3ToWorker.get(edge.targetId)
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

  return { nodes, edges }
}
