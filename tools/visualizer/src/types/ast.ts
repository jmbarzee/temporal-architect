// AST wire types for the visualizer.
//
// The structural shapes are generated from the Go DTO layer and live in
// `@temporal-architect/wire-types` (single source of truth; CI-gated). This
// file is a thin façade: it re-exports the ergonomic names the visualizer and
// its npm consumers use, adds the two loader-side shapes that are NOT part of
// the wire contract (`FileError`, and the `TWFFile` wrapper that carries
// extension-added fields), and `qualifiedNameOf`, the one reader of a
// definition's graph identity.

export type {
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
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticKind,
  Position,
  SummaryMetadata,
  Statement,
  ActivityCall,
  WorkflowCall,
  WorkflowCallMode,
  WorkflowStartKind,
  NexusCall,
  AwaitStmt,
  AwaitAllBlock,
  AwaitOneBlock,
  AwaitOneCase,
  SwitchBlock,
  SwitchCase,
  IfStmt,
  ForStmt,
  ForVariant,
  ReturnStmt,
  CloseStmt,
  BreakStmt,
  ContinueStmt,
  RawStmt,
  Comment,
  PromiseStmt,
  SetStmt,
  UnsetStmt,
  SignalSendStmt,
  SendHead,
  Address,
  IDValue,
  AsyncTarget,
  AsyncTargetKind,
  TimerTarget,
  SignalTarget,
  UpdateTarget,
  ActivityTarget,
  WorkflowTarget,
  NexusTarget,
  IdentTarget,
  OptionsBlock,
  OptionEntry,
} from '@temporal-architect/wire-types'

import type { Definition, Diagnostic, SummaryMetadata } from '@temporal-architect/wire-types'

// A definition's graph identity: the name element of its graph node ID, and so
// the `name` of its view node. For a packaged workflow, activity or nexus
// service that is the parser's `qualifiedName` (`pkg.Name`); for everything
// else it is the bare name. The parser owns the qualification rule — read it
// here, never rebuild it by joining a package onto a name.
export function qualifiedNameOf(def: Definition): string {
  return ('qualifiedName' in def ? def.qualifiedName : undefined) ?? def.name
}

// Per-file parse error (loader-side; not part of the twf wire contract).
export interface FileError {
  file: string
  error: string
  stderr?: string
}

// Top-level file the visualizer renders. Extends the wire `summary` + AST
// definitions with loader-side fields the host/extension attaches: the focused
// file, legacy per-file parse errors, and the structured diagnostics envelope.
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
