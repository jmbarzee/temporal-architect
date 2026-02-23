// AST → Graph construction pipeline.
// Implements the 6-step build order from GRAPH_VIEW.md § Graph Construction Order.

import type { TWFFile, Definition, Statement, AsyncTarget } from '../types/ast'
import type { Graph, GraphNode, GraphEdge, NodeType } from './model'
import { nodeId } from './model'

export function buildGraph(ast: TWFFile): Graph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  let edgeSeq = 0

  function addNode(node: GraphNode) {
    nodes.set(node.id, node)
  }

  function addEdge(edge: Omit<GraphEdge, 'id'>) {
    edges.push({ ...edge, id: `e${edgeSeq++}` })
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

  // Map L3 name → worker name (for cross-worker edge detection in step 4)
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
        id: nId, level: 3, nodeType: nType, name: ref.name,
        sourceFile: actDef?.sourceFile, parentId: workerId, orphan: false,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 3, targetLevel: 2 })
    }

    for (const ref of def.services || []) {
      const nType: NodeType = 'nexusService'
      const nId = nodeId(nType, ref.name)
      registeredL3.add(`nexusServiceDef:${ref.name}`)
      l3ToWorker.set(nId, def.name)
      const nsDef = defsByType.get(`nexusServiceDef:${ref.name}`)
      addNode({
        id: nId, level: 3, nodeType: nType, name: ref.name,
        sourceFile: nsDef?.sourceFile, parentId: workerId, orphan: false,
      })
      addEdge({ edgeType: 'containment', sourceId: nId, targetId: workerId, sourceLevel: 3, targetLevel: 2 })
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
        id: nodeId('activity', def.name), level: 3, nodeType: 'activity', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
      })
    } else if (def.type === 'nexusServiceDef' && !registeredL3.has(`nexusServiceDef:${def.name}`)) {
      addNode({
        id: nodeId('nexusService', def.name), level: 3, nodeType: 'nexusService', name: def.name,
        sourceFile: def.sourceFile, orphan: true,
      })
    }
  }

  // --- Step 4: Cross-worker dependency edges ---
  // Pre-index nexus service operations for tracing nexus calls to backing workflows
  const nexusOpToWorkflow = new Map<string, string>() // "service:operation" → workflowName
  for (const def of ast.definitions) {
    if (def.type === 'nexusServiceDef') {
      for (const op of def.operations || []) {
        if (op.opType === 'async' && op.workflowName) {
          nexusOpToWorkflow.set(`${def.name}:${op.name}`, op.workflowName)
        }
      }
    }
  }

  function addDependencyIfCrossWorker(
    sourceNodeId: string, targetNodeId: string,
    nexusMeta?: { endpoint: string; service: string; operation: string }
  ) {
    const sourceWorker = l3ToWorker.get(sourceNodeId)
    const targetWorker = l3ToWorker.get(targetNodeId)
    // Only include cross-worker edges (same-worker is implicit in containment)
    // Also include edges where either side is orphan (no worker)
    if (sourceWorker && targetWorker && sourceWorker === targetWorker) return
    // Skip if target node doesn't exist in graph
    if (!nodes.has(targetNodeId)) return

    addEdge({
      edgeType: nexusMeta ? 'nexusDependency' : 'dependency',
      sourceId: sourceNodeId,
      targetId: targetNodeId,
      sourceLevel: 3,
      targetLevel: 3,
      ...(nexusMeta && {
        nexusEndpoint: nexusMeta.endpoint,
        nexusService: nexusMeta.service,
        nexusOperation: nexusMeta.operation,
      }),
    })
  }

  function walkTarget(target: AsyncTarget, callerNodeId: string) {
    if (target.activity) {
      addDependencyIfCrossWorker(callerNodeId, nodeId('activity', target.activity.name))
    }
    if (target.workflow) {
      addDependencyIfCrossWorker(callerNodeId, nodeId('workflow', target.workflow.name))
    }
    if (target.nexus) {
      const backingWf = nexusOpToWorkflow.get(`${target.nexus.service}:${target.nexus.operation}`)
      if (backingWf) {
        addDependencyIfCrossWorker(callerNodeId, nodeId('workflow', backingWf), {
          endpoint: target.nexus.endpoint,
          service: target.nexus.service,
          operation: target.nexus.operation,
        })
      }
    }
  }

  function walkStmts(stmts: Statement[], callerNodeId: string) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case 'activityCall':
          addDependencyIfCrossWorker(callerNodeId, nodeId('activity', stmt.name))
          break
        case 'workflowCall':
          addDependencyIfCrossWorker(callerNodeId, nodeId('workflow', stmt.name))
          break
        case 'nexusCall': {
          const backingWf = nexusOpToWorkflow.get(`${stmt.service}:${stmt.operation}`)
          if (backingWf) {
            addDependencyIfCrossWorker(callerNodeId, nodeId('workflow', backingWf), {
              endpoint: stmt.endpoint, service: stmt.service, operation: stmt.operation,
            })
          }
          break
        }
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

  // Walk all workflow and activity bodies for dependency edges
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
    }
  }

  // --- Step 5: Project L3 dependencies up to Worker→Worker; discard self-loops ---
  const workerDeps = new Set<string>() // "sourceWorker→targetWorker"
  for (const edge of edges) {
    if (edge.edgeType !== 'containment' && edge.sourceLevel === 3 && edge.targetLevel === 3) {
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
