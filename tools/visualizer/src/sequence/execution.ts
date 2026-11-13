// PROVISIONAL. The sequence view's input as two hand-drawn samples need it;
// the wire contract is #752's, and this type is what that Task reads from.

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
  /** The task queue that runs this activity, when not its lane's. */
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
  /** A host's last step; a failed one means the host was lost. */
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

export interface Execution {
  title: string
  lanes: Lane[]
  steps: Step[]
  messages: Message[]
  spans: Span[]
}
