// Execution → positions. Time runs down in rows; a row is a level of the
// happens-before order. A step sits one row below what precedes it, a message
// puts its send and its receive on one row, and the rest is placement.

import type { Execution, Lane, Step, StepKind } from './execution'

export const PITCH = 34
const STEP_H = 26
const HEADER_H = PITCH
const STEP_W = 264
const GLYPH_W = 7.2
const LANE_W: Record<Lane['kind'], number> = { workflow: 288, external: 264, host: 80 }
const COLUMN_GAP = 48
// MARGIN, OUTBOARD, RUN_SHIFT and TOP are fitted to the two hand drawings, not derived.
const MARGIN = 24
const OUTBOARD = 144
const RUN_SHIFT = 56
const TOP = 123
const BADGE_OFFSET = 36

const VERB: Record<StepKind, string> = {
  send: 'signal', await: 'await signal', handler: 'on signal', activity: 'activity',
  timer: '', detach: 'detach workflow', close: 'close', event: '', note: '',
}
const STATE_SUFFIX = { queued: ' queued', cancelled: ' cancelled', failed: '' }

export interface Rect { x: number; y: number; width: number; height: number }
export interface PlacedStep { step: Step; box: Rect; verb: string; text: string; queueTag?: { key: string; value: string; box: Rect } }
export interface PlacedLane { lane: Lane; x: number; box?: Rect; lifeline: [number, number]; bar?: { y1: number; y2: number; lost: boolean } }
export interface PlacedColumn { title: string; x: number; tag?: { key: string; value: string }; tagBox: Rect }
export interface PlacedArrow { kind: 'signal' | 'call' | 'child' | 'launch'; x1: number; x2: number; y: number; n?: number; badgeX: number }
export interface PlacedInput { outside: string; note?: string; x: number; y: number }
export interface PlacedSpan { label: string; box: Rect }
export interface Layout {
  width: number
  height: number
  rows: ReadonlyMap<string, number>
  columns: PlacedColumn[]
  lanes: PlacedLane[]
  steps: PlacedStep[]
  arrows: PlacedArrow[]
  inputs: PlacedInput[]
  spans: PlacedSpan[]
}

const rowTop = (row: number) => TOP + row * PITCH
const center = (r: Rect) => r.x + r.width / 2

/** Each step's row: the longest path to it, with a message's two ends one row. */
function solveRows({ lanes, steps, messages }: Execution): Map<string, number> {
  const known = new Set(steps.map(s => s.id))
  const check = (id: string) => { if (!known.has(id)) throw new Error(`unknown step ${id}`) }
  const startOf = (laneId: string) => {
    const lane = lanes.find(l => l.id === laneId)
    if (!lane) throw new Error(`unknown lane ${laneId}`)
    return lane.startedBy === undefined ? [] : [lane.startedBy]
  }
  const preds = new Map<string, string[]>()
  const last = new Map<string, string>()
  for (const s of steps) {
    const before = last.get(s.lane)
    const ids = [
      ...(s.after ?? []),
      ...(before === undefined ? startOf(s.lane) : [before]),
    ]
    ids.forEach(check)
    preds.set(s.id, ids)
    last.set(s.lane, s.id)
  }

  const group = new Map<string, Set<string>>(steps.map(s => [s.id, new Set([s.id])]))
  for (const m of messages) {
    check(m.to)
    if (typeof m.from !== 'string') continue
    check(m.from)
    const merged = new Set([...group.get(m.from)!, ...group.get(m.to)!])
    merged.forEach(id => group.set(id, merged))
  }

  const row = new Map(steps.map(s => [s.id, 0]))
  for (let pass = 0; ; pass++) {
    if (pass > steps.length + 1) throw new Error('execution has a cycle')
    let moved = false
    const raise = (id: string, to: number) => {
      if (to > row.get(id)!) { row.set(id, to); moved = true }
    }
    for (const s of steps) {
      raise(s.id, Math.max(0, ...preds.get(s.id)!.map(p => row.get(p)! + 1)) + (s.pause ?? 0))
    }
    for (const ids of group.values()) {
      const level = Math.max(...[...ids].map(id => row.get(id)!))
      ids.forEach(id => raise(id, level))
    }
    if (!moved) return row
  }
}

export function layoutExecution(execution: Execution): Layout {
  const { lanes, steps, messages, spans } = execution
  const rows = solveRows(execution)
  const laneById = new Map(lanes.map(l => [l.id, l]))
  const stepById = new Map(steps.map(s => [s.id, s]))
  const lastRow = (laneId: string) => Math.max(-1, ...steps.filter(s => s.lane === laneId).map(s => rows.get(s.id)!))
  const beginRow = (lane: Lane) => lane.startedBy === undefined ? -1 : rows.get(lane.startedBy)!

  // Columns in order of first lane; each is as wide as its first lane's kind.
  const titles = [...new Set(lanes.map(l => l.title))]
  const members = (title: string) => lanes.filter(l => l.title === title)
  const tagOf = (title: string) => members(title).find(l => l.tag)?.tag
  // The column whose queue runs a step; a queue no column carries is tagged at its step.
  const runnerOf = (queue: string) => titles.find(t => tagOf(t)?.key === 'task_queue' && tagOf(t)?.value === queue)
  const outboard = steps.some(s => s.queue !== undefined && runnerOf(s.queue) === undefined) || messages.some(m => typeof m.from !== 'string')
  const columnX = new Map<string, number>()
  let edge = MARGIN + (outboard ? OUTBOARD : 0)
  for (const title of titles) {
    const half = LANE_W[members(title)[0].kind] / 2
    columnX.set(title, edge + half)
    edge += half * 2 + COLUMN_GAP
  }
  const laneX = (lane: Lane) => columnX.get(lane.title)!

  const columns = titles.map(title => {
    const tag = tagOf(title)
    const w = tag ? Math.max(tag.key.length, tag.value.length) * 6.7 + 16 : 0
    return { title, x: columnX.get(title)!, tag, tagBox: { x: columnX.get(title)! - w / 2, y: 36, width: w, height: 32 } }
  })

  const placedSteps = steps.map<PlacedStep>(step => {
    const lane = laneById.get(step.lane)!
    const verb = step.attempt && step.attempt > 1 ? '' : VERB[step.kind]
    const text = `${step.attempt && step.attempt > 1 ? '↺ ' : ''}${step.label}${step.state ? STATE_SUFFIX[step.state] : ''}`
    const w = Math.max(STEP_W, (verb.length + 1 + text.length) * GLYPH_W + 24)
    const runner = step.queue === undefined ? undefined : runnerOf(step.queue)
    const dx = step.queue === undefined ? 0 : RUN_SHIFT * (runner === undefined || columnX.get(runner)! < laneX(lane) ? -1 : 1)
    const box = { x: laneX(lane) + dx - w / 2, y: rowTop(rows.get(step.id)!), width: w, height: STEP_H }
    const placed: PlacedStep = { step, box, verb, text }
    if (step.queue !== undefined && runner === undefined) {
      const tagW = Math.max('task_queue'.length, step.queue.length) * 6.7 + 12
      placed.queueTag = { key: 'task_queue', value: step.queue, box: { x: box.x - 8 - tagW, y: box.y - 3, width: tagW, height: 32 } }
    }
    return placed
  })
  const boxOf = new Map(placedSteps.map(p => [p.step.id, p.box]))

  const bottom = Math.max(...lanes.filter(l => l.kind === 'workflow').map(l => rowTop(lastRow(l.id)) + STEP_H + 12))
  const placedLanes = lanes.map<PlacedLane>(lane => {
    const x = laneX(lane)
    const top = rowTop(beginRow(lane)) - 4
    if (lane.kind === 'workflow') {
      const end = lastRow(lane.id)
      const box = { x: x - LANE_W.workflow / 2, y: top, width: LANE_W.workflow, height: rowTop(end) + STEP_H + 12 - top }
      return { lane, x, box, lifeline: [top + HEADER_H, rowTop(end) + STEP_H / 2] }
    }
    const mid = (id: string) => rowTop(rows.get(id)!) + STEP_H / 2
    const bar = lane.kind === 'host' ? {
      y1: mid(lane.startedBy!),
      y2: mid(lane.endedAt!),
      lost: stepById.get(lane.endedAt!)!.state === 'failed',
    } : undefined
    return { lane, x, lifeline: [rowTop(-1) - 4, bottom], bar }
  })

  const arrows: PlacedArrow[] = []
  const inputs: PlacedInput[] = []
  // From the edge of one box that faces the other, level with `row`.
  const arrow = (kind: PlacedArrow['kind'], from: Rect, target: Rect, row: number) => {
    const dir = center(target) >= center(from) ? 1 : -1
    const x1 = dir > 0 ? from.x + from.width : from.x
    const x2 = (dir > 0 ? target.x : target.x + target.width) - 2 * dir
    arrows.push({ kind, x1, x2, y: rowTop(row) + STEP_H / 2, badgeX: x1 + dir * BADGE_OFFSET })
  }
  for (const m of messages) {
    const to = boxOf.get(m.to)!
    const row = rows.get(m.to)!
    if (typeof m.from === 'string') {
      arrow(stepById.get(m.from)!.kind === 'activity' ? 'call' : 'signal', boxOf.get(m.from)!, to, row)
      continue
    }
    const lane = laneById.get(stepById.get(m.to)!.lane)!
    const x1 = laneX(lane) - LANE_W[lane.kind] / 2 - BADGE_OFFSET
    const y = rowTop(row) + STEP_H / 2
    arrows.push({ kind: 'signal', x1, x2: to.x - 2, y, badgeX: (x1 + to.x) / 2 })
    inputs.push({ outside: m.from.outside, note: m.from.note, x: x1 - 8, y })
  }
  for (const lane of lanes) {
    if (lane.startedBy === undefined) continue
    const width = lane.kind === 'host' ? 6 : LANE_W[lane.kind]
    const target = { x: laneX(lane) - width / 2, y: 0, width, height: 0 }
    arrow(lane.kind === 'host' ? 'launch' : 'child', boxOf.get(lane.startedBy)!, target, rows.get(lane.startedBy)!)
  }
  arrows.sort((a, b) => a.y - b.y)
  let n = 0
  for (const a of arrows) if (a.kind === 'signal' || a.kind === 'child') a.n = ++n

  const placedSpans = spans.map(s => {
    const lane = placedLanes.find(l => l.lane.id === s.lane)!
    const y = rowTop(rows.get(s.from)!)
    return { label: s.label, box: { x: lane.box!.x + lane.box!.width + 4, y, width: 4, height: rowTop(rows.get(s.to)!) + STEP_H - y } }
  })

  const right = Math.max(edge - COLUMN_GAP, ...placedSteps.map(p => p.box.x + p.box.width)) + MARGIN
  return { width: right, height: bottom + MARGIN, rows, columns, lanes: placedLanes, steps: placedSteps, arrows, inputs, spans: placedSpans }
}
