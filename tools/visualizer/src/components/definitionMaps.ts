import type { Definition } from '../types/ast'
import type { DefinitionContext } from './WorkflowCanvas'

// definitionMaps indexes definitions by name, per kind. A name declared twice
// (a DUPLICATE_* resolve error) is its first declaration's, as the resolver
// keeps it.
export function definitionMaps(definitions: Definition[]): DefinitionContext {
  const maps: DefinitionContext = {
    workflows: new Map(),
    activities: new Map(),
    workers: new Map(),
    nexusServices: new Map(),
    namespaces: new Map(),
  }
  const keepFirst = <T extends { name: string }>(m: Map<string, T>, def: T) => {
    if (!m.has(def.name)) m.set(def.name, def)
  }
  for (const def of definitions) {
    if (def.type === 'workflowDef') {
      keepFirst(maps.workflows, def)
    } else if (def.type === 'activityDef') {
      keepFirst(maps.activities, def)
    } else if (def.type === 'workerDef') {
      keepFirst(maps.workers, def)
    } else if (def.type === 'nexusServiceDef') {
      keepFirst(maps.nexusServices, def)
    } else if (def.type === 'namespaceDef') {
      keepFirst(maps.namespaces, def)
    }
  }
  return maps
}
