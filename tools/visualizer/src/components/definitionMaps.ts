import type { Definition, WorkflowDef } from '../types/ast'
import { qualifiedNameOf } from '../types/ast'
import type { DefinitionContext, HandlerContext } from './WorkflowCanvas'

// setFirst sets key to value unless key is already set: a name declared twice
// (a DUPLICATE_* resolve error) is its first declaration's, as the resolver
// keeps it.
export function setFirst<K, V>(m: Map<K, V>, key: K, value: V) {
  if (!m.has(key)) m.set(key, value)
}

const keepFirst = <T extends { name: string }>(m: Map<string, T>, def: T) => setFirst(m, def.name, def)

// firstByName returns decls without any whose name an earlier one declares.
export function firstByName<T extends { name: string }>(decls: T[] | undefined): T[] {
  const m = new Map<string, T>()
  for (const d of decls ?? []) keepFirst(m, d)
  return [...m.values()]
}

// keptDefinitions returns definitions without any whose kind and qualified
// name an earlier one declares: the declarations the resolver keeps.
export function keptDefinitions(definitions: Definition[]): Definition[] {
  const m = new Map<string, Definition>()
  for (const def of definitions) setFirst(m, `${def.type}:${qualifiedNameOf(def)}`, def)
  return [...m.values()]
}

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

// handlersOf indexes a workflow's handlers by name, per kind. A handler declared
// twice in the workflow (a DUPLICATE_* resolve error) is its first, as the
// resolver keeps it.
export function handlersOf(def: WorkflowDef): HandlerContext {
  const byName = <T extends { name: string }>(decls: T[] | undefined) => {
    const m = new Map<string, T>()
    for (const d of decls ?? []) keepFirst(m, d)
    return m
  }
  return { signals: byName(def.signals), queries: byName(def.queries), updates: byName(def.updates) }
}
