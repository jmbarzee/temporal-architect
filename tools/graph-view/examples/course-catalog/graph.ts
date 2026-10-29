// The translation step: a catalog in, a `Graph` out. One node per faculty,
// department, course listing and lab; a cross-listed course becomes one node
// per listing, sharing a `definitionKey`.

import { RELATION_DIMENSION } from '@temporal-architect/graph-view'
import type { Graph, GraphEdge, GraphNode } from '@temporal-architect/graph-view'
import type { Catalog, Requirement } from './data'
import { CAMPUS, ENTITY, REQUIREMENT } from './ontology'

const subjectOf = (code: string) => code.split(' ')[0]
/** "MATH 210" → 2; "CHEM 101L" → 1. */
const levelOf = (code: string) => Number(code.split(' ')[1]?.[0] ?? 0)

export function buildGraph(catalog: Catalog): Graph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  /** Catalog code → node id, so requirements can resolve. */
  const byCode = new Map<string, string>()

  // parentId and the containment edge are one fact; both are written here.
  const add = (node: Omit<GraphNode, 'orphan'>, orphan = false) => {
    nodes.set(node.id, { ...node, orphan })
    if (node.parentId) {
      edges.push({
        id: `in:${node.id}`,
        sourceId: node.id,
        targetId: node.parentId,
        dimensions: { [RELATION_DIMENSION]: 'containment' },
      })
    }
  }
  const depends = (from: string, req: Requirement) => {
    const to = byCode.get(req.code)
    if (!to) return // reported as a finding by the host shell
    edges.push({
      id: `${req.kind}:${from}->${to}`,
      sourceId: from,
      targetId: to,
      dimensions: { [RELATION_DIMENSION]: 'dependency', [REQUIREMENT]: req.kind },
    })
  }

  for (const f of catalog.faculties) {
    add({
      id: `faculty:${f.id}`,
      name: f.name,
      definitionKey: `faculty:${f.id}`,
      dimensions: { [ENTITY]: 'faculty' },
      payload: { dean: f.dean },
    })
  }
  for (const d of catalog.departments) {
    add({
      id: `dept:${d.subject}`,
      name: d.name,
      definitionKey: `dept:${d.subject}`,
      parentId: `faculty:${d.faculty}`,
      dimensions: { [ENTITY]: 'department' },
      payload: { code: d.subject },
    })
  }
  for (const c of catalog.courses) {
    for (const code of c.listings) {
      const dept = nodes.has(`dept:${subjectOf(code)}`) ? `dept:${subjectOf(code)}` : undefined
      byCode.set(code, `course:${code}`)
      add({
        id: `course:${code}`,
        name: c.title,
        definitionKey: `course:${c.id}`,
        parentId: dept,
        dimensions: { [ENTITY]: 'course', [CAMPUS]: c.campus },
        payload: {
          code,
          credits: c.credits,
          term: c.term,
          level: levelOf(code),
          courseId: c.id,
        },
      }, dept === undefined)
    }
    // Labs belong to the course, not to a listing: they sit under the first.
    for (const lab of c.labs ?? []) {
      byCode.set(lab.code, `lab:${lab.code}`)
      add({
        id: `lab:${lab.code}`,
        name: lab.title,
        definitionKey: `lab:${lab.code}`,
        parentId: `course:${c.listings[0]}`,
        dimensions: { [ENTITY]: 'lab', [CAMPUS]: c.campus },
        payload: {
          code: lab.code,
          credits: lab.credits,
          term: c.term,
          level: levelOf(lab.code),
        },
      })
    }
  }
  // Requirements last, once every code has a node. Each listing carries its course's.
  for (const c of catalog.courses) {
    for (const code of c.listings) for (const req of c.requires ?? []) depends(`course:${code}`, req)
    for (const lab of c.labs ?? []) for (const req of lab.requires ?? []) depends(`lab:${lab.code}`, req)
  }

  const duplicateGroups = new Map<string, Set<string>>()
  for (const n of nodes.values()) {
    const group = duplicateGroups.get(n.definitionKey) ?? new Set<string>()
    duplicateGroups.set(n.definitionKey, group.add(n.id))
  }
  return { nodes, edges, duplicateGroups }
}
