// One fixture per rule of spec/SEQUENCE_VIEW.md, each as small as the rule allows.

import type { Execution, Lane, Step } from '../execution'

const flow = (id: string, queue: string, extra: Partial<Lane> = {}): Lane =>
  ({ id, kind: 'workflow', name: id, title: id.toUpperCase(), tag: { key: 'task_queue', value: queue }, ...extra })
const host = (id: string, queue: string, extra: Partial<Lane> = {}): Lane =>
  ({ id, kind: 'host', name: id, title: 'HOSTS', tag: { key: 'task_queue', value: queue }, ...extra })
const step = (lane: string, id: string, extra: Partial<Step> = {}): Step =>
  ({ id, lane, kind: 'activity', label: id, ...extra })

/** Rows: a step sits below what precedes it, a pause adds rows, `after` orders across lanes. */
const rows: Execution = {
  title: 'Rows',
  lanes: [flow('a', 'qa'), flow('b', 'qb')],
  steps: [
    step('a', 'a1'), step('a', 'a2'), step('a', 'a3', { pause: 2 }),
    step('b', 'b1', { after: ['a2'] }),
  ],
  messages: [],
  spans: [],
}

/** Link ends: a send waits on its lane and the receive's lane waits on the send, so both take the later row. */
const linkRows: Execution = {
  title: 'Link ends',
  lanes: [flow('a', 'qa'), flow('b', 'qb')],
  steps: [
    step('a', 'a-send', { kind: 'send' }),
    step('b', 'b1'), step('b', 'b2'), step('b', 'b-recv', { kind: 'await' }),
    step('a', 'a-next'),
  ],
  messages: [{ from: 'a-send', to: 'b-recv' }, { from: { outside: 'user' }, to: 'a-next' }],
  spans: [],
}

/** Lane set: nothing lives on queue `pods` but offset work, so it is a tag and no column. */
const queueTag: Execution = {
  title: 'Queue tag',
  lanes: [flow('a', 'qa'), host('pods', 'pods')],
  steps: [step('a', 'a-run', { queue: 'pods' })],
  messages: [],
  spans: [],
}

/** Lane set: a host lives on queue `pods` (it starts and ends), so it is a column and the work shifts toward it. */
const queueLane: Execution = {
  title: 'Queue lane',
  lanes: [flow('a', 'qa'), host('pods', 'pods', { startedBy: 'a-start', endedAt: 'a-stop' })],
  steps: [step('a', 'a-start'), step('a', 'a-run', { queue: 'pods' }), step('a', 'a-stop')],
  messages: [],
  spans: [],
}

/** Lane set: lanes sharing a title share a column, in order of first lane; lifetimes may not overlap. */
const grouping: Execution = {
  title: 'Grouping',
  lanes: [flow('a', 'qa'), host('h1', 'pods', { startedBy: 'a1', endedAt: 'a2' }), host('h2', 'pods', { startedBy: 'a3', endedAt: 'a4' })],
  steps: [step('a', 'a1'), step('a', 'a2'), step('a', 'a3'), step('a', 'a4')],
  messages: [],
  spans: [],
}

/** Lifetimes: a child begins at its start, a lost host ends in a mark, a host with no end lasts, a span bars a held state. */
const lifetimes: Execution = {
  title: 'Lifetimes',
  lanes: [
    flow('parent', 'qp'),
    host('h1', 'pods', { startedBy: 'p-grant', endedAt: 'p-lost' }),
    host('h2', 'pods', { startedBy: 'p-after' }),
    flow('child', 'qc', { startedBy: 'p-spawn' }),
  ],
  steps: [
    step('parent', 'p-spawn', { kind: 'detach', label: 'Child' }),
    step('parent', 'p-grant', { kind: 'await' }),
    step('parent', 'p-lost', { kind: 'event', state: 'failed' }),
    step('parent', 'p-after'),
    step('parent', 'p-release', { kind: 'send' }),
    step('child', 'c1'), step('child', 'c2'),
  ],
  messages: [],
  spans: [{ lane: 'parent', label: 'held', from: 'p-grant', to: 'p-release' }],
}

/** Offset: a step shifts toward the column that runs it, left or right of its own, and not when it runs on its own queue. */
const offset: Execution = {
  title: 'Offset',
  lanes: [flow('left', 'ql'), flow('mid', 'qm'), flow('right', 'qr')],
  steps: [
    step('left', 'l1'),
    step('mid', 'm-left', { queue: 'ql' }), step('mid', 'm-right', { queue: 'qr' }), step('mid', 'm-own', { queue: 'qm' }),
    step('right', 'r1'),
  ],
  messages: [],
  spans: [],
}

/** Attempts: each retry is a box of its own, marked in place of its verb; the first keeps the verb. */
const attempts: Execution = {
  title: 'Attempts',
  lanes: [flow('a', 'qa')],
  steps: [
    step('a', 'try1', { label: 'Charge' }),
    step('a', 'timeout', { kind: 'event', state: 'failed', label: 'timed out' }),
    step('a', 'try2', { label: 'Charge', attempt: 2 }),
    step('a', 'try3', { label: 'Charge', attempt: 3 }),
  ],
  messages: [],
  spans: [],
}

/** Winners: a timer armed and cancelled precedes the signal that won, and no branch that lost without a trace is drawn. */
const winners: Execution = {
  title: 'Winners',
  lanes: [flow('a', 'qa'), flow('b', 'qb')],
  steps: [
    step('a', 'a-send', { kind: 'send' }),
    step('b', 'b-timer', { kind: 'timer', label: 'timer(1h)', state: 'cancelled' }),
    step('b', 'b-won', { kind: 'await', label: 'Ping' }),
  ],
  messages: [{ from: 'a-send', to: 'b-won' }],
  spans: [],
}

/** One box per call: an activity run elsewhere, a call to another participant and a child start are one box each. */
const oneBox: Execution = {
  title: 'One box',
  lanes: [
    flow('a', 'qa'),
    host('pods', 'pods', { startedBy: 'a-run', endedAt: 'a-call' }),
    { id: 'api', kind: 'external', name: 'API', title: 'API' },
    flow('child', 'qc', { startedBy: 'a-child' }),
  ],
  steps: [
    step('a', 'a-run', { queue: 'pods' }),
    step('a', 'a-call'),
    step('a', 'a-child', { kind: 'detach', label: 'Child' }),
    step('api', 'api-handle', { kind: 'event' }),
    step('child', 'c1'),
  ],
  messages: [{ from: 'a-call', to: 'api-handle' }],
  spans: [],
}

export const rules: Record<string, Execution> = {
  'rule-rows': rows,
  'rule-link-ends': linkRows,
  'rule-queue-tag': queueTag,
  'rule-queue-lane': queueLane,
  'rule-grouping': grouping,
  'rule-lifetimes': lifetimes,
  'rule-offset': offset,
  'rule-attempts': attempts,
  'rule-winners': winners,
  'rule-one-box': oneBox,
}
