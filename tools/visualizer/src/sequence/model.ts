// The Sequence view's model, what layout.ts places: fromExecution builds it from
// an execution. The rules that read it are spec/SEQUENCE_VIEW.md.

export type StepKind =
  | 'send'     // signal sent
  | 'await'    // signal awaited
  | 'handler'  // signal handler run
  | 'activity'
  | 'timer'
  | 'detach'   // detached child workflow started
  | 'close'
  | 'event'    // something recorded in a lane that is not a workflow
  | 'note'     // an annotation, not an event

export type StepState = 'queued' | 'cancelled' | 'failed'

export interface Step {
  id: string
  /** The event's key, which names the step in every view; absent on a step no event stands behind. A queued box and the start it waits for share one. */
  key?: string
  lane: string
  kind: StepKind
  label: string
  state?: StepState
  /** Above 1, a retry: drawn with a retry mark in place of its verb. */
  attempt?: number
  /** Steps that happen before this one, beyond its lane's order and its messages. */
  after?: string[]
  /** Rows of quiet before this step: time passing. */
  pause?: number
  /** The task queue that runs this step; drawn offset when it is not its lane's own. */
  queue?: string
}

export interface Lane {
  id: string
  kind: 'workflow' | 'external' | 'host'
  name: string
  /** The column heading. Lanes sharing a title share a column, and their lifetimes must not overlap. */
  title: string
  tag?: { key: string; value: string }
  /** The step that starts this lane; absent when it is there from the top. */
  startedBy?: string
  /** A host's last step, a failed one meaning it was lost; absent, it lasts to the end. */
  endedAt?: string
}

/** Between two steps at the same row, or from outside the design into one. */
export interface Message {
  from: string | { outside: string; note?: string }
  to: string
}

/** A state held across steps of one lane. */
export interface Span {
  lane: string
  label: string
  from: string
  to: string
}

export interface Model {
  title: string
  lanes: Lane[]
  steps: Step[]
  messages: Message[]
  spans: Span[]
}
