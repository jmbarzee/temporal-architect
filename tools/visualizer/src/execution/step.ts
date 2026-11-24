// A step as a target: the event an execution's views select, show in one another
// and link to. Its identity is the event's key, as `Event.Key` in Go has it; the
// rules are spec/VIEW_FRAMEWORK.md § Steps.

import type { Execution, ExecutionEvent } from '@temporal-architect/wire-types'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import type { TreeFocus } from '../components/TreeView'
import { segments } from '../tree/identity'
import type { Definition } from '../types/ast'
import { qualifiedNameOf } from '../types/ast'

/** An event's identity across executions, as Event.Key in Go. */
export const eventKey = (e: ExecutionEvent) => JSON.stringify([e.lane, e.stmt ?? '', (e.visit ?? []).join('.'), e.kind, e.attempt ?? 0])

/** The event a step names. */
export const eventOf = ({ events }: Execution, step: string) => events.find(e => eventKey(e) === step)

/** The events of one visit to one statement: its reach, each attempt's start and end. */
export function familyOf({ events }: Execution, step: string): ExecutionEvent[] {
  const at = events.find(e => eventKey(e) === step)
  const same = (e: ExecutionEvent) => e.lane === at?.lane && e.stmt === at.stmt && (e.visit ?? []).join('.') === (at.visit ?? []).join('.')
  return at ? events.filter(same) : []
}

const DEFINITION: Record<string, string> = { workflow: 'workflowDef', activity: 'activityDef', worker: 'workerDef', nexusOperation: 'nexusServiceDef' }

/**
 * The focus a step is: its lane and itself, and the top-level definition it is in, found by the
 * first segment of its statement's identity, else its lane's (`kind:name`, a lane's name ranked
 * ` @n`). A step in a lane no definition stands behind has none.
 */
export function focusOf(execution: Execution, defs: readonly Definition[], step: string): TreeFocus | undefined {
  const event = eventOf(execution, step)
  if (!event) return undefined
  const [kind, ...rest] = segments(event.stmt ?? event.lane)[0].replace(/ @\d+$/, '').split(':')
  const defType = DEFINITION[kind]
  const name = rest.join(':')
  const operation = kind === 'nexusOperation' ? name.lastIndexOf('.') : -1
  const owner = operation === -1 ? name : name.slice(0, operation)
  const def = defType && defs.find(d => d.type === defType && qualifiedNameOf(d) === owner)
  return {
    name: owner,
    ...(operation !== -1 && { child: name.slice(operation + 1) }),
    lane: event.lane,
    step,
    values: def ? { [DEF_TYPE_DIMENSION]: defType, [SOURCE_FILE_DIMENSION]: def.site.file } : {},
  }
}
