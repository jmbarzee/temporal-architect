// What one execution did to the design, read by statement identity: which blocks
// it reached and the detail each visit left on them. The rules are
// spec/TREE_VIEW.md § Execution path.

import type { Execution, ExecutionEvent } from '@temporal-architect/wire-types'
import { eventKey, eventOf } from '../execution/step'
import { SEPARATOR, segments } from './identity'

const OUTCOME = { failed: 'failed', timedOut: 'timed out', cancelled: 'cancelled' }
const rankless = (head: string) => head.replace(/ @\d+$/, '')
const LOOP = /^for\b/
const HANDLER = /^(?:signal|update|query) \w+$/
const CALL = /^(?:promise \w+ <- |await )?(?:detach )?(?:activity|workflow|nexus) /
/** The segment `back` from the end: 1 is the last. */
const nth = (segs: string[], back: number) => segs[segs.length - back] ?? ''
const times = (n: number) => (n > 1 ? ` ×${n}` : '')
const distinct = (keys: string[]) => new Set(keys).size

/** How many counters of the pass an event under this block carries, down to and including the block: each enclosing loop, and a handler's run. */
function depth(segs: string[]): number {
  return segs.slice(1).filter((s, i) => LOOP.test(s) || (i === 0 && HANDLER.test(rankless(s)))).length
}

/** The visits of an event down to a block's depth, as a key. */
const visitKey = (e: ExecutionEvent, depth: number) => (e.visit ?? []).slice(0, depth).join('.')

export interface Path {
  /** Whether the execution reached the block, or something beneath it. */
  on(id: string): boolean
  /** A step to select the block by: its first event's, else the first beneath it. */
  step(id: string): string | undefined
  /** Whether the step is on the block itself. */
  holds(id: string, step: string): boolean
  /** What the visits left on the block: passes, the branch or case taken, attempts, a handler that ran at it. */
  detail(id: string): string[]
}

export function pathOf({ events }: Execution): Path {
  const own = new Map<string, ExecutionEvent[]>()
  const beneath = new Map<string, ExecutionEvent[]>()
  const push = (m: Map<string, ExecutionEvent[]>, id: string, e: ExecutionEvent) => m.set(id, [...(m.get(id) ?? []), e])
  for (const e of events) {
    if (e.stmt === undefined) continue
    const segs = segments(e.stmt)
    push(own, e.stmt, e)
    for (let n = 1; n < segs.length; n++) push(beneath, segs.slice(0, n).join(SEPARATOR), e)
  }

  // A handler runs at the await its lane next completes.
  const ranAt = new Map<string, string[]>()
  events.forEach((arrival, i) => {
    if (arrival.kind !== 'arrive' || arrival.stmt === undefined) return
    const at = events.slice(i + 1).find(e => e.lane === arrival.lane && e.kind === 'end' && e.stmt !== undefined && !e.stmt.startsWith(arrival.stmt + SEPARATOR))
    if (!at) return
    const segs = segments(at.stmt!)
    if (/^await /.test(rankless(nth(segs, 1))) || /^await (?:one|all)$/.test(rankless(nth(segs, 2)))) {
      ranAt.set(at.stmt!, [...(ranAt.get(at.stmt!) ?? []), nth(segments(arrival.stmt), 1).replace(/^\w+ /, '')])
    }
  })

  const reached = (id: string) => [...(own.get(id) ?? []), ...(beneath.get(id) ?? [])]

  function detail(id: string): string[] {
    const segs = segments(id)
    const last = rankless(nth(segs, 1))
    const parent = rankless(nth(segs, 2))
    const d = depth(segs)
    const out: string[] = []
    const visits = (list: ExecutionEvent[]) => distinct(list.map(e => visitKey(e, d)))

    if (LOOP.test(last)) {
      const passes = Math.max(0, ...reached(id).map(e => e.visit?.[d - 1] ?? 0))
      if (passes > 0) out.push(passes === 1 ? '1 pass' : `${passes} passes`)
    } else if (/^if \(/.test(last)) {
      const under = beneath.get(id) ?? []
      const [otherwise, then] = [under.filter(e => e.stmt!.startsWith(id + SEPARATOR + 'else')), under.filter(e => !e.stmt!.startsWith(id + SEPARATOR + 'else'))]
      if (then.length > 0) out.push(`then${times(visits(then))}`)
      if (otherwise.length > 0) out.push(`else${times(visits(otherwise))}`)
    } else if (parent === 'await one' || /^case /.test(last)) {
      const taken = reached(id)
      if (taken.length > 0) out.push(`${parent === 'await one' ? 'won' : 'taken'}${times(visits(taken))}`)
    } else if (CALL.test(last)) {
      const attempts = new Map<string, Map<number, string>>()
      for (const e of own.get(id) ?? []) {
        if (e.attempt === undefined) continue
        const by = attempts.get(visitKey(e, d)) ?? new Map<number, string>()
        by.set(e.attempt, (e.outcome && OUTCOME[e.outcome as keyof typeof OUTCOME]) || by.get(e.attempt) || 'ok')
        attempts.set(visitKey(e, d), by)
      }
      for (const [visit, by] of attempts) {
        if (by.size === 1 && [...by.values()][0] === 'ok') continue
        const label = [...by.entries()].sort(([a], [b]) => a - b).map(([, outcome]) => outcome).join(', ')
        out.push(`${visit ? `#${visit} ` : ''}${by.size > 1 ? `${by.size} attempts: ` : ''}${label}`)
      }
    }
    const ran = ranAt.get(id) ?? []
    for (const name of new Set(ran)) out.push(`ran handler ${name}${times(ran.filter(n => n === name).length)}`)
    return out
  }

  return {
    on: id => own.has(id) || beneath.has(id),
    step: id => { const first = reached(id)[0]; return first && eventKey(first) },
    holds: (id, step) => (own.get(id) ?? []).some(e => eventKey(e) === step),
    detail,
  }
}

/** The graph node a step is at: what it dispatches to, else its lane's. */
export function nodeOf(execution: Execution, step: string): string | undefined {
  const event = eventOf(execution, step)
  return event && (event.edge?.to ?? execution.lanes.find(l => l.id === event.lane)?.node)
}
