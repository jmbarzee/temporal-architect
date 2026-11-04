import { describe, expect, it } from 'vitest'
import { definitionMaps, handlersOf } from './definitionMaps'
import type { Definition, WorkflowDef } from '../types/ast'

// A name declared twice (DUPLICATE_*) is its first declaration's, as the
// resolver keeps it, for every kind.
describe('definitionMaps', () => {
  const def = (type: Definition['type'], name: string, line: number) => ({ type, name, line }) as unknown as Definition
  const kinds = [
    ['workflowDef', 'workflows'],
    ['activityDef', 'activities'],
    ['workerDef', 'workers'],
    ['nexusServiceDef', 'nexusServices'],
    ['namespaceDef', 'namespaces'],
  ] as const

  it.each(kinds)('keeps the first %s of a name', (type, map) => {
    const first = def(type, 'X', 1)
    const maps = definitionMaps([first, def(type, 'X', 5), def(type, 'Y', 9)])
    expect(maps[map].get('X')).toBe(first)
    expect([...maps[map].keys()]).toEqual(['X', 'Y'])
  })
})

// A handler declared twice in one workflow (DUPLICATE_SIGNAL, _QUERY, _UPDATE)
// is its first, as the resolver keeps it, for every kind.
describe('handlersOf', () => {
  const decl = (name: string, params: string) => ({ name, params }) as never
  const kinds = ['signals', 'queries', 'updates'] as const

  it.each(kinds)('keeps the first of a name among %s', (kind) => {
    const first = decl('X', 'a: A')
    const handlers = handlersOf({ [kind]: [first, decl('X', 'b: B'), decl('Y', '')] } as unknown as WorkflowDef)
    expect(handlers[kind].get('X')).toBe(first)
    expect([...handlers[kind].keys()]).toEqual(['X', 'Y'])
  })
})
