// Diagnostic: run buildGraph against the topic library AST and report node counts
// per (id, level, type) so we can spot any duplicates that the renderer would see.
//
// Usage: node tools/visualizer/diag-build.mjs
// Run from repo root.

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const topicsDir = path.join(repoRoot, 'skills/design/topics')

const twfFiles = readdirSync(topicsDir).filter(f => f.endsWith('.twf')).map(f => path.join(topicsDir, f))

// Build the merged AST exactly the way the extension does: parse each file
// individually with `twf parse <file>`, stamp sourceFile, concatenate.
const allDefinitions = []
for (const file of twfFiles) {
  const stdout = execFileSync('twf', ['parse', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parsed = JSON.parse(stdout)
  if (parsed?.definitions) {
    for (const def of parsed.definitions) {
      def.sourceFile = file
      allDefinitions.push(def)
    }
  }
}

const ast = { definitions: allDefinitions }

// Inline the exact node-creation logic from build.ts — we only need to verify
// the node *set*, not the edges. Anything that produces two distinct GraphNode
// entries with overlapping intent will show up here.

const nodes = new Map()
const nodeId = (t, n) => `${t}:${n}`
const addNode = (n) => {
  if (nodes.has(n.id)) {
    console.error(`COLLISION: ${n.id} already in map. existing=${JSON.stringify(nodes.get(n.id))} new=${JSON.stringify(n)}`)
  }
  nodes.set(n.id, n)
}

// Step 1: namespaces
for (const def of ast.definitions) {
  if (def.type === 'namespaceDef') {
    addNode({ id: nodeId('namespace', def.name), level: 1, nodeType: 'namespace', name: def.name, sourceFile: def.sourceFile })
  }
}

// Step 2: workers
const workerToNamespace = new Map()
for (const def of ast.definitions) {
  if (def.type === 'namespaceDef') {
    for (const w of def.workers || []) workerToNamespace.set(w.workerName, def.name)
  }
}
for (const def of ast.definitions) {
  if (def.type === 'workerDef') {
    addNode({ id: nodeId('worker', def.name), level: 2, nodeType: 'worker', name: def.name, sourceFile: def.sourceFile, parentId: workerToNamespace.has(def.name) ? nodeId('namespace', workerToNamespace.get(def.name)) : undefined })
  }
}

// Step 3: L3 from worker registrations
const registeredL3 = new Set()
for (const def of ast.definitions) {
  if (def.type !== 'workerDef') continue
  for (const r of def.workflows || []) { addNode({ id: nodeId('workflow', r.name), level: 3, nodeType: 'workflow', name: r.name, parentId: nodeId('worker', def.name) }); registeredL3.add(`workflowDef:${r.name}`) }
  for (const r of def.activities || []) { addNode({ id: nodeId('activity', r.name), level: 3, nodeType: 'activity', name: r.name, parentId: nodeId('worker', def.name) }); registeredL3.add(`activityDef:${r.name}`) }
  for (const r of def.services || []) { addNode({ id: nodeId('nexusService', r.name), level: 3, nodeType: 'nexusService', name: r.name, parentId: nodeId('worker', def.name) }); registeredL3.add(`nexusServiceDef:${r.name}`) }
}

// Orphan L3
for (const def of ast.definitions) {
  if (def.type === 'workflowDef' && !registeredL3.has(`workflowDef:${def.name}`)) addNode({ id: nodeId('workflow', def.name), level: 3, nodeType: 'workflow', name: def.name, sourceFile: def.sourceFile, orphan: true })
  if (def.type === 'activityDef' && !registeredL3.has(`activityDef:${def.name}`)) addNode({ id: nodeId('activity', def.name), level: 3, nodeType: 'activity', name: def.name, sourceFile: def.sourceFile, orphan: true })
  if (def.type === 'nexusServiceDef' && !registeredL3.has(`nexusServiceDef:${def.name}`)) addNode({ id: nodeId('nexusService', def.name), level: 3, nodeType: 'nexusService', name: def.name, sourceFile: def.sourceFile, orphan: true })
}

const counts = {}
for (const n of nodes.values()) {
  counts[n.nodeType] = (counts[n.nodeType] || 0) + 1
}
console.log('node counts:', counts)
console.log('total nodes:', nodes.size)
console.log('worker ids:')
for (const n of nodes.values()) {
  if (n.nodeType === 'worker') console.log(' ', n.id, '←', n.parentId)
}
