// Execution → positions, by the rules in spec/SEQUENCE_VIEW.md. Rows and the
// column spacing derive; the constants below are fitted to the two hand drawings.

import type { Execution, Lane, Step, StepKind } from './execution'

export const PITCH = 34
const STEP_H = 26
const HEADER_H = PITCH
const STEP_W = 264
const GLYPH_W = 7.2
const LANE_W: Record<Lane['kind'], number> = { workflow: 288, external: 264, host: 80 }
const COLUMN_GAP = 48
const MARGIN = 24
const RUN_SHIFT = 56
const TOP = 123
const BADGE_OFFSET = 36
const TAG_GLYPH_W = 6.7
const TAG_PAD = 16
const TAG_GAP = 8

const VERB: Record<StepKind, string> = {
  send: 'signal', await: 'await signal', handler: 'on signal', activity: 'activity',
  timer: '', detach: 'detach workflow', close: 'close', event: '', note: '',
}
const STATE_SUFFIX = { queued: ' queued', cancelled: ' cancelled', failed: '' }

export interface Rect { x: number; y: number; width: number; height: number }
export interface PlacedStep { step: Step; box: Rect; verb: string; text: string; queueTag?: Tag & { box: Rect } }
export interface PlacedLane { lane: Lane; x: number; box?: Rect; lifeline: [number, number]; bar?: { y1: number; y2: number; lost: boolean } }
export interface PlacedColumn { title: string; x: number; tag?: Tag; tagBox: Rect }
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

type Tag = { key: string; value: string }
const rowTop = (row: number) => TOP + row * PITCH
const center = (r: Rect) => r.x + r.width / 2
const tagWidth = ({ key, value }: Tag) => Math.max(key.length, value.length) * TAG_GLYPH_W + TAG_PAD
const queueOf = (tag?: Tag) => tag?.key === 'task_queue' ? tag.value : undefined

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
  const { steps, messages, spans } = execution
  const rows = solveRows(execution)
  const stepById = new Map(steps.map(s => [s.id, s]))
  const lastRow = (laneId: string) => Math.max(-1, ...steps.filter(s => s.lane === laneId).map(s => rows.get(s.id)!))
  const beginRow = (lane: Lane) => lane.startedBy === undefined ? -1 : rows.get(lane.startedBy)!
  const endRow = (lane: Lane) => lane.kind === 'workflow' ? lastRow(lane.id) : lane.endedAt === undefined ? Infinity : rows.get(lane.endedAt)!

  // A lane is a column only when something lives on it: a step it owns, or a start.
  const owners = new Set(steps.map(s => s.lane))
  const lanes = execution.lanes.filter(l => owners.has(l.id) || l.startedBy !== undefined)
  const laneById = new Map(lanes.map(l => [l.id, l]))

  // Columns in order of first lane; each is as wide as its first lane's kind.
  const titles = [...new Set(lanes.map(l => l.title))]
  const members = (title: string) => lanes.filter(l => l.title === title)
  const tagOf = (title: string) => members(title).find(l => l.tag)?.tag
  const half = (title: string) => LANE_W[members(title)[0].kind] / 2
  for (const title of titles) {
    const lives = members(title).map(l => ({ id: l.id, from: beginRow(l), to: endRow(l) })).sort((a, b) => a.from - b.from)
    lives.slice(1).forEach((l, i) => {
      if (l.from <= lives[i].to) throw new Error(`lanes ${lives[i].id} and ${l.id} share column ${title} and overlap`)
    })
  }

  // A step run on a queue other than its lane's shifts toward the column that carries that queue,
  // and otherwise toward the left, where the queue is tagged beside it.
  const shapes = steps.map(step => {
    const lane = laneById.get(step.lane)!
    const retry = step.attempt !== undefined && step.attempt > 1
    const verb = retry ? '' : VERB[step.kind]
    const text = `${retry ? '↺ ' : ''}${step.label}${step.state ? STATE_SUFFIX[step.state] : ''}`
    const width = Math.max(STEP_W, (verb.length + 1 + text.length) * GLYPH_W + 24)
    const offset = step.queue !== undefined && step.queue !== queueOf(tagOf(lane.title))
    const runner = !offset ? undefined : titles.find(t => queueOf(tagOf(t)) === step.queue)
    const dx = !offset ? 0 : RUN_SHIFT * (runner === undefined || titles.indexOf(runner) < titles.indexOf(lane.title) ? -1 : 1)
    const tag = offset && runner === undefined ? { key: 'task_queue', value: step.queue! } : undefined
    return { step, lane, verb, text, width, dx, tag }
  })

  // How far what is drawn for a column reaches past its lane box, so columns clear one another.
  // `to` is a distance from the column's centre.
  const reach = new Map(titles.map(t => [t, { left: 0, right: 0 }]))
  const widen = (title: string, side: 'left' | 'right', to: number) => {
    const r = reach.get(title)!
    r[side] = Math.max(r[side], to - half(title))
  }
  for (const { lane, width, dx, tag } of shapes) {
    widen(lane.title, 'left', width / 2 - dx + (tag ? TAG_GAP + tagWidth(tag) : 0))
    widen(lane.title, 'right', width / 2 + dx)
  }
  for (const m of messages) {
    if (typeof m.from === 'string') continue
    const label = Math.max(m.from.outside.length, m.from.note?.length ?? 0) * GLYPH_W
    const { title } = laneById.get(stepById.get(m.to)!.lane)!
    widen(title, 'left', half(title) + BADGE_OFFSET + TAG_GAP + label)
  }

  const columnX = new Map<string, number>()
  let edge = MARGIN
  titles.forEach((title, i) => {
    edge += (i === 0 ? 0 : reach.get(titles[i - 1])!.right + COLUMN_GAP) + reach.get(title)!.left
    columnX.set(title, edge + half(title))
    edge += half(title) * 2
  })
  const laneX = (lane: Lane) => columnX.get(lane.title)!

  const columns = titles.map(title => {
    const tag = tagOf(title)
    const w = tag ? tagWidth(tag) : 0
    return { title, x: columnX.get(title)!, tag, tagBox: { x: columnX.get(title)! - w / 2, y: 36, width: w, height: 32 } }
  })

  const placedSteps = shapes.map<PlacedStep>(({ step, lane, verb, text, width, dx, tag }) => {
    const box = { x: laneX(lane) + dx - width / 2, y: rowTop(rows.get(step.id)!), width, height: STEP_H }
    const placed: PlacedStep = { step, box, verb, text }
    if (tag) {
      const w = tagWidth(tag)
      placed.queueTag = { ...tag, box: { x: box.x - TAG_GAP - w, y: box.y - 3, width: w, height: 32 } }
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
      y1: lane.startedBy === undefined ? rowTop(-1) - 4 : mid(lane.startedBy),
      y2: lane.endedAt === undefined ? bottom : mid(lane.endedAt),
      lost: lane.endedAt !== undefined && stepById.get(lane.endedAt)!.state === 'failed',
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
    const x1 = laneX(lane) - half(lane.title) - BADGE_OFFSET
    const y = rowTop(row) + STEP_H / 2
    arrows.push({ kind: 'signal', x1, x2: to.x - 2, y, badgeX: (x1 + to.x) / 2 })
    inputs.push({ outside: m.from.outside, note: m.from.note, x: x1 - TAG_GAP, y })
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

  const right = edge + reach.get(titles[titles.length - 1])!.right + MARGIN
  return { width: right, height: bottom + MARGIN, rows, columns, lanes: placedLanes, steps: placedSteps, arrows, inputs, spans: placedSpans }
}
