import { describe, expect, it } from 'vitest'
import { definitionMaps } from './definitionMaps'
import type { Definition } from '../types/ast'

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
