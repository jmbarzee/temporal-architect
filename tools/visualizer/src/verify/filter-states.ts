// The filter states the visible-subgraph golden is taken at.
//
// The six named type combinations are `spec/GRAPH_VIEW.md` § Edge Graduation's
// own table, used as *inputs*. That table's Nodes/Edges columns are prose
// categories, not expected values — the golden records what the code actually
// resolves. Two more states carry the cases the spec table omits: the empty set
// (which means hide-everything, not show-everything — T7) and the app's own
// default selection.

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from '../graph/node-types'

const defTypeOf = (t: (typeof ALL_NODE_TYPES)[number]) => NODE_TYPE_REGISTRY[t].defType

export interface TypeState {
  name: string
  visibleTypes: string[]
}

const ALL_DEF_TYPES = ALL_NODE_TYPES.map(defTypeOf)

export const TYPE_STATES: TypeState[] = [
  // T7: an empty type set hides everything. The opposite of an empty file set.
  { name: 'types:none', visibleTypes: [] },
  { name: 'types:ns', visibleTypes: ['namespaceDef'] },
  { name: 'types:ns+worker', visibleTypes: ['namespaceDef', 'workerDef'] },
  { name: 'types:ns+wf+act', visibleTypes: ['namespaceDef', 'workflowDef', 'activityDef'] },
  { name: 'types:worker+wf', visibleTypes: ['workerDef', 'workflowDef'] },
  { name: 'types:l3', visibleTypes: ['workflowDef', 'activityDef', 'nexusOperationDef'] },
  { name: 'types:all', visibleTypes: ALL_DEF_TYPES },
  {
    name: 'types:default',
    visibleTypes: ALL_NODE_TYPES.filter(t => NODE_TYPE_REGISTRY[t].defaultVisible).map(defTypeOf),
  },
]

/** The type state the per-file cases are taken at. */
export const ALL_TYPES_STATE = 'types:all'

/**
 * File states for one fixture: no file filter (which means *all* files — the
 * inverse of the type dimension), each file alone, and, when there is more than
 * one, every file at once.
 */
export function fileStates(allFiles: string[]): { name: string; selectedFiles: string[] }[] {
  const states = [{ name: 'files:none', selectedFiles: [] as string[] }]
  for (const f of allFiles) states.push({ name: `files:${f}`, selectedFiles: [f] })
  if (allFiles.length > 1) states.push({ name: 'files:all', selectedFiles: [...allFiles] })
  return states
}
