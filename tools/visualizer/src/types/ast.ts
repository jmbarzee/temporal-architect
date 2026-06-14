// TypeScript types mirroring the Go AST JSON output

export interface Position {
  line: number
  column: number
}

// Lightweight reference to a resolved AST node (matches Go resolvedRefJSON)
export interface ResolvedRef {
  name: string
  line: number
  column: number
}

// Per-file parse error
export interface FileError {
  file: string
  error: string
  stderr?: string
}

// Diagnostic emitted by the parser/resolver/validator. Matches the wire
// shape produced by `twf parse` and `twf <cmd> --json`. See
// tools/lsp/cmd/twf/twf.schema.json for the authoritative schema.
export type DiagnosticSeverity = 'error' | 'warning'
export type DiagnosticKind = 'parse' | 'resolve' | 'validate' | 'graph'

export interface Diagnostic {
  severity: DiagnosticSeverity
  kind: DiagnosticKind
  code: string
  file?: string
  start: Position
  end: Position
  message: string
  name?: string
}

// Summary counts emitted by the parser, plus rolled-up diagnostic totals.
export interface SummaryMetadata {
  namespaces: number
  workers: number
  workflows: number
  activities: number
  nexusServices: number
  // Diagnostic roll-up counts. Populated by the CLI envelope; absent in
  // contexts that emit only the inner AST.
  errors?: number
  warnings?: number
}

// Top-level file
export interface TWFFile {
  summary?: SummaryMetadata
  definitions: Definition[]
  // Added for focused-file visualization
  focusedFile?: string
  // Per-file parse errors and warnings (loader-side; pre-dates the
  // diagnostics envelope and is preserved for backward compatibility).
  errors?: FileError[]
  // Structured diagnostics emitted by `twf parse`. Present when the AST is
  // loaded via the JSON envelope; absent when loaded from older shapes.
  diagnostics?: Diagnostic[]
}

// Nexus service definition
export type NexusOperationType = 'async' | 'sync'

export interface NexusOperation extends Position {
  opType: NexusOperationType
  name: string
  workflowName?: string   // async only: backing workflow
  params?: string         // sync only
  returnType?: string     // sync only
  body?: Statement[]      // sync only
}

export interface NexusServiceDef extends Position {
  type: 'nexusServiceDef'
  name: string
  operations?: NexusOperation[]
  sourceFile?: string
}

// Definition types
export type Definition = WorkflowDef | ActivityDef | WorkerDef | NamespaceDef | NexusServiceDef

export interface WorkflowDef extends Position {
  type: 'workflowDef'
  name: string
  params: string
  returnType?: string
  state?: StateBlock
  signals: SignalDecl[]
  queries: QueryDecl[]
  updates: UpdateDecl[]
  body: Statement[]
  // Source file path (added by extension)
  sourceFile?: string
}

// State block declared at the top of a workflow definition
export interface StateBlock {
  conditions?: ConditionDecl[]
  rawStmts?: RawStmt[]
}

export interface ConditionDecl extends Position {
  name: string
}

export interface ActivityDef extends Position {
  type: 'activityDef'
  name: string
  params: string
  returnType?: string
  body: Statement[]
  // Source file path (added by extension)
  sourceFile?: string
}

// Worker reference (a named ref to a workflow, activity, or nexus service)
export interface WorkerRef extends Position {
  name: string
  resolved?: ResolvedRef
}

// Worker definition - groups workflows, activities, and nexus services
export interface WorkerDef extends Position {
  type: 'workerDef'
  name: string
  workflows: WorkerRef[]
  activities: WorkerRef[]
  services: WorkerRef[]
  // Source file path (added by extension)
  sourceFile?: string
}

// Namespace worker instantiation (worker + deployment options)
export interface NamespaceWorker extends Position {
  workerName: string
  options?: OptionsBlock
  resolvedWorker?: ResolvedRef
}

// Namespace endpoint instantiation (nexus endpoint + options)
export interface NamespaceEndpoint extends Position {
  endpointName: string
  options?: OptionsBlock
}

// Namespace definition - instantiates workers with deployment config
export interface NamespaceDef extends Position {
  type: 'namespaceDef'
  name: string
  workers: NamespaceWorker[]
  endpoints: NamespaceEndpoint[]
  // Source file path (added by extension)
  sourceFile?: string
}

// Handler declaration union (signal, query, update)
export type HandlerDecl = SignalDecl | QueryDecl | UpdateDecl

// Declaration types (with handler bodies)
export interface SignalDecl extends Position {
  type: 'signalDecl'
  name: string
  params: string
  options?: OptionsBlock
  body?: Statement[]
}

export interface QueryDecl extends Position {
  type: 'queryDecl'
  name: string
  params: string
  returnType?: string
  options?: OptionsBlock
  body?: Statement[]
}

export interface UpdateDecl extends Position {
  type: 'updateDecl'
  name: string
  params: string
  returnType?: string
  options?: OptionsBlock
  body?: Statement[]
}

// Statement types
export type Statement =
  | ActivityCall
  | WorkflowCall
  | NexusCall
  | AwaitStmt
  | AwaitAllBlock
  | AwaitOneBlock
  | SwitchBlock
  | IfStmt
  | ForStmt
  | ReturnStmt
  | CloseStmt
  | BreakStmt
  | ContinueStmt
  | RawStmt
  | Comment
  | PromiseStmt
  | SetStmt
  | UnsetStmt

export interface ActivityCall extends Position {
  type: 'activityCall'
  name: string
  args: string
  result?: string
  options?: OptionsBlock
  resolved?: ResolvedRef
}

export type WorkflowCallMode = 'child' | 'detach'

export interface WorkflowCall extends Position {
  type: 'workflowCall'
  mode: WorkflowCallMode
  name: string
  args: string
  result?: string
  options?: OptionsBlock
  resolved?: ResolvedRef
}

// Options block (key-value pairs used by nexus calls, namespaces, etc.)
export interface OptionEntry {
  key: string
  value?: string
  valueType?: string
  nested?: OptionEntry[]
}

export interface OptionsBlock {
  entries: OptionEntry[]
}

// Nexus call - calls a nexus service operation
export interface NexusCall extends Position {
  type: 'nexusCall'
  detach: boolean
  endpoint: string
  service: string
  operation: string
  args: string
  result?: string
  options?: OptionsBlock
  resolvedEndpoint?: ResolvedRef
  resolvedEndpointNamespace?: string
  resolvedService?: ResolvedRef
  resolvedOperation?: ResolvedRef
}

// Async target: discriminated union by kind, with per-kind sub-objects
export type AsyncTargetKind = 'timer' | 'signal' | 'update' | 'activity' | 'workflow' | 'nexus' | 'ident'

export interface TimerTarget { duration: string }
export interface SignalTarget { name: string; params?: string }
export interface UpdateTarget { name: string; params?: string }
export interface ActivityTarget { name: string; args?: string; result?: string; resolved?: ResolvedRef }
export interface WorkflowTarget { name: string; mode: string; args?: string; result?: string; resolved?: ResolvedRef }
export interface NexusTarget {
  endpoint: string
  service: string
  operation: string
  args?: string
  result?: string
  detach?: boolean
  resolvedEndpoint?: ResolvedRef
  resolvedEndpointNamespace?: string
  resolvedService?: ResolvedRef
  resolvedOperation?: ResolvedRef
}
export interface IdentTarget { name: string; result?: string }

export interface AsyncTarget {
  kind: AsyncTargetKind
  timer?: TimerTarget
  signal?: SignalTarget
  update?: UpdateTarget
  activity?: ActivityTarget
  workflow?: WorkflowTarget
  nexus?: NexusTarget
  ident?: IdentTarget
}

// Single await statement: await timer/signal/update/activity/workflow/nexus/ident
export interface AwaitStmt extends Position {
  type: 'await'
  target: AsyncTarget
}

// await all: waits for all operations to complete
export interface AwaitAllBlock extends Position {
  type: 'awaitAll'
  body: Statement[]
}

// await one case: target-based cases use AsyncTarget; await_all uses nested awaitAll
export interface AwaitOneCase extends Position {
  target?: AsyncTarget
  awaitAll?: AwaitAllBlock
  body: Statement[]
}

// await one: waits for first case to complete
export interface AwaitOneBlock extends Position {
  type: 'awaitOne'
  cases: AwaitOneCase[]
}

export interface SwitchCase extends Position {
  value: string
  body: Statement[]
}

export interface SwitchBlock extends Position {
  type: 'switch'
  expr: string
  cases: SwitchCase[]
  default?: Statement[]
}

export interface IfStmt extends Position {
  type: 'if'
  condition: string
  body: Statement[]
  elseBody?: Statement[]
}

export type ForVariant = 'infinite' | 'conditional' | 'iteration'

export interface ForStmt extends Position {
  type: 'for'
  variant: ForVariant
  condition?: string
  variable?: string
  iterable?: string
  body: Statement[]
}

export interface ReturnStmt extends Position {
  type: 'return'
  value?: string
}

export interface CloseStmt extends Position {
  type: 'close'
  reason: string // 'complete', 'fail', or 'continue_as_new'
  args?: string
}

export interface BreakStmt extends Position {
  type: 'break'
}

export interface ContinueStmt extends Position {
  type: 'continue'
}

export interface RawStmt extends Position {
  type: 'raw'
  text: string
}

export interface Comment extends Position {
  type: 'comment'
  text: string
}

// Promise statement: promise name <- async_target
export interface PromiseStmt extends Position {
  type: 'promise'
  name: string
  target: AsyncTarget
}

// Set a condition to true
export interface SetStmt extends Position {
  type: 'set'
  name: string
}

// Set a condition to false
export interface UnsetStmt extends Position {
  type: 'unset'
  name: string
}

// Type guards
export function isWorkflowDef(def: Definition): def is WorkflowDef {
  return def.type === 'workflowDef'
}

export function isActivityDef(def: Definition): def is ActivityDef {
  return def.type === 'activityDef'
}

export function isWorkerDef(def: Definition): def is WorkerDef {
  return def.type === 'workerDef'
}

export function isNamespaceDef(def: Definition): def is NamespaceDef {
  return def.type === 'namespaceDef'
}

export function isNexusServiceDef(def: Definition): def is NexusServiceDef {
  return def.type === 'nexusServiceDef'
}
