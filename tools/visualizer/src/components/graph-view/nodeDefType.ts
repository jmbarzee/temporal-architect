// Mapping between graph nodeType and AST defType, derived from the registry and
// built once at module load (all node types are covered by ALL_NODE_TYPES).
// Shared by useVisibleGraph (type-filter test) and GraphView (cross-view focus,
// context menu).

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from '../../graph/node-types'

const NODE_TYPE_TO_DEF_TYPE = Object.fromEntries(
  ALL_NODE_TYPES.map(t => [t, NODE_TYPE_REGISTRY[t].defType]),
) as Record<string, string>

const DEF_TYPE_TO_NODE_TYPE = Object.fromEntries(
  ALL_NODE_TYPES.map(t => [NODE_TYPE_REGISTRY[t].defType, t]),
) as Record<string, string>

export function nodeTypeToDefType(nodeType: string): string {
  return NODE_TYPE_TO_DEF_TYPE[nodeType] ?? 'workflowDef'
}

export function defTypeToNodeType(defType: string): string {
  return DEF_TYPE_TO_NODE_TYPE[defType] ?? 'workflow'
}
