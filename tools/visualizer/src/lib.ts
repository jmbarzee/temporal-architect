// Public entry point for `@temporal-skills/visualizer`.
//
// This file is the *only* surface npm consumers see. Anything not re-exported
// here is an internal implementation detail and may change without a major
// version bump. When adding new exports, prefer a deliberate, named re-export
// to `export *` so the public API is grep-able in one place.

export { WorkflowCanvas as Visualizer } from './components/WorkflowCanvas'

// Re-export the AST types so consumers can type their `ast` prop and walk
// it for custom integrations (badges, side panels, link-outs, …) without
// having to vendor or re-declare the shapes.
export type {
  TWFFile,
  SummaryMetadata,
  FileError,
  Definition,
  WorkflowDef,
  ActivityDef,
  WorkerDef,
  WorkerRef,
  NamespaceDef,
  NamespaceWorker,
  NamespaceEndpoint,
  NexusServiceDef,
  NexusOperation,
  NexusOperationType,
  StateBlock,
  ConditionDecl,
  SignalDecl,
  QueryDecl,
  UpdateDecl,
  HandlerDecl,
  ResolvedRef,
  // Diagnostic shape from `twf parse`'s envelope, carried alongside the AST
  // when host applications want to surface validation in the visualizer UI.
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticKind,
} from './types/ast'

// Statement union and primitives — exported so host apps can write their
// own walkers / custom statement renderers without re-defining the discriminated
// union. Listed explicitly rather than star-exported.
export type {
  Position,
  Statement,
  ActivityCall,
  WorkflowCall,
  NexusCall,
  AwaitStmt,
  AwaitAllBlock,
  AwaitOneBlock,
  AwaitOneCase,
  SwitchBlock,
  SwitchCase,
  IfStmt,
  ForStmt,
  ReturnStmt,
  CloseStmt,
  BreakStmt,
  ContinueStmt,
  RawStmt,
  Comment,
  PromiseStmt,
  SetStmt,
  UnsetStmt,
  AsyncTarget,
  TimerTarget,
  SignalTarget,
  UpdateTarget,
  ActivityTarget,
  WorkflowTarget,
  NexusTarget,
  IdentTarget,
  OptionsBlock,
  OptionEntry,
} from './types/ast'
