// Hand-written companion to the generated wire types in ./generated/*.
//
// This file is the residue the Go->TS generator (tygo) cannot express but which
// is fully determined by the Go DTO layer. It covers the AST half of the
// contract; the graph / envelope ergonomic aliases live in ./index.ts.
//
//   1. Discriminated-union overlays — the generated `*JSON` structs type their
//      `type` / `mode` / `variant` / `opType` / `kind` discriminators as plain
//      `string` (Go untyped consts). We intersect a string-literal back on so
//      the `Definition` / `Statement` / `HandlerDecl` unions narrow under
//      strict tsc. Members mirror marshalDefinition / marshalStatement in
//      tools/lsp/parser/ast/json.go.
//   2. Nested-shape overlays — tygo emits `(T | undefined)[]` for `[]*T` pointer
//      slices and references the raw `*JSON` nested types. We remap the handful
//      of affected fields (signals/queries/updates, conditions, operations,
//      async targets) to the clean ergonomic element types.
//   3. RawStatement / RawDefinition — the names the generated AST uses on its
//      body / definitions arrays; they resolve to the discriminated unions, so
//      generated bodies are themselves narrowable.
//   4. String-literal enums — the discriminator/enum vocabularies, re-stated
//      with their Go source-of-truth noted.
//
// Hand-maintained: when a Go constant value or the marshalDefinition /
// marshalStatement dispatch changes, update it here. The generated half
// (./generated/*) is CI-gated; this half is not, by design — keep them in step.

import type {
  ActivityCallJSON,
  WorkflowCallJSON,
  NexusCallJSON,
  AwaitStmtJSON,
  AwaitAllBlockJSON,
  AwaitOneCaseJSON,
  AwaitOneBlockJSON,
  SwitchCaseJSON,
  SwitchBlockJSON,
  IfStmtJSON,
  ForStmtJSON,
  ReturnStmtJSON,
  CloseStmtJSON,
  BreakStmtJSON,
  ContinueStmtJSON,
  RawStmtJSON,
  CommentJSON,
  SignalSendStmtJSON,
  PromiseStmtJSON,
  SetStmtJSON,
  UnsetStmtJSON,
  WorkflowDefJSON,
  ActivityDefJSON,
  WorkerDefJSON,
  WorkerRefJSON,
  NamespaceDefJSON,
  NamespaceWorkerJSON,
  NamespaceEndpointJSON,
  NexusServiceDefJSON,
  NexusOperationJSON,
  StateBlockJSON,
  ConditionDeclJSON,
  SignalDeclJSON,
  QueryDeclJSON,
  UpdateDeclJSON,
  OptionsBlockJSON,
  OptionEntryJSON,
  ResolvedRefJSON,
  AsyncTargetJSON,
  TimerTargetJSON,
  SignalTargetJSON,
  UpdateTargetJSON,
  ActivityTargetJSON,
  WorkflowTargetJSON,
  NexusTargetJSON,
  IdentTargetJSON,
} from "./generated/ast";

// ── 4. String-literal enums ──────────────────────────────────────────────────
// Each mirrors an untyped string constant (or a *String() mapper) in the Go
// source; the field that carries it is typed `string` in the generated output.

/** AST node `type` discriminators — the `Type:` literals in ast/json.go. */
export type DefinitionType =
  | "workflowDef"
  | "activityDef"
  | "workerDef"
  | "namespaceDef"
  | "nexusServiceDef";
export type HandlerDeclType = "signalDecl" | "queryDecl" | "updateDecl";
export type StatementType =
  | "activityCall"
  | "workflowCall"
  | "nexusCall"
  | "await"
  | "awaitAll"
  | "awaitOne"
  | "switch"
  | "if"
  | "for"
  | "return"
  | "close"
  | "break"
  | "continue"
  | "raw"
  | "comment"
  | "signalSend"
  | "promise"
  | "set"
  | "unset";

/** workflowCallModeString in ast/json.go. */
export type WorkflowCallMode = "child" | "detach";
/** forVariantString in ast/json.go. */
export type ForVariant = "infinite" | "conditional" | "iteration";
/** closeReasonString in ast/json.go (carried as a plain string on the wire). */
export type CloseReason = "complete" | "fail" | "continue_as_new";
/** NexusOperationJSON.opType in ast/json.go. */
export type NexusOperationType = "sync" | "async";
/** AsyncTargetJSON.kind — the per-kind field populated in marshalAsyncTarget. */
export type AsyncTargetKind =
  | "timer"
  | "signal"
  | "update"
  | "activity"
  | "workflow"
  | "nexus"
  | "ident";
/** OptionEntryJSON.valueType — see OptionEntry in ast/statements.go. */
export type OptionValueType = "string" | "duration" | "number" | "bool" | "enum";

/** SymbolJSON.kind in cmd/twf/internal/command/symbols/symbols.go. */
export type SymbolKind =
  | "workflow"
  | "activity"
  | "worker"
  | "namespace"
  | "nexusService";

/** envelope.Diagnostic.severity / .kind in cmd/twf/internal/envelope/model.go. */
export type DiagnosticSeverity = "error" | "warning";
export type DiagnosticKind = "parse" | "resolve" | "validate" | "graph";

/** graph EdgeXxx / TierXxx / SeverityXxx / Diag* constants in graph/graph.go. */
export type EdgeKind =
  | "containment"
  | "activityCall"
  | "workflowCall"
  | "nexusCall"
  | "asyncBacking"
  | "signalSend"
  | "nexusRoute";
export type CoarsenTier = "worker" | "namespace";
export type GraphDiagnosticSeverity = "error" | "warning";
export type GraphDiagnosticCode = "DISPATCH_NO_REACHABLE_DEPLOYMENT";
/** graph KindXxx constants — the leftmost segment of a definition key. */
export type NodeKind =
  | "namespace"
  | "worker"
  | "workflow"
  | "activity"
  | "nexusService"
  | "nexusOperation"
  | "nexusEndpoint";

/** decompose SourceXxx / StrategyXxx constants in decompose/result.go. */
export type ChunkRootSource = "heuristic" | "declared";
export type DivisionStrategy =
  | "tree"
  | "nexus"
  | "worker"
  | "namespace"
  | "service"
  | "subtree";

/** decompose Advisory kinds in decompose/result.go. */
export type AdvisoryKind = "suggestContract";

// ── Leaf aliases (generated shape already matches the ergonomic shape) ───────

export type ResolvedRef = ResolvedRefJSON;
export type OptionsBlock = OptionsBlockJSON;
export type OptionEntry = OptionEntryJSON;
export type ConditionDecl = ConditionDeclJSON;
export type WorkerRef = WorkerRefJSON;
export type NamespaceWorker = NamespaceWorkerJSON;
export type NamespaceEndpoint = NamespaceEndpointJSON;

export type TimerTarget = TimerTargetJSON;
export type SignalTarget = SignalTargetJSON;
export type UpdateTarget = UpdateTargetJSON;
export type ActivityTarget = ActivityTargetJSON;
export type WorkflowTarget = WorkflowTargetJSON;
export type NexusTarget = NexusTargetJSON;
export type IdentTarget = IdentTargetJSON;

/** Async operation target — discriminated by `kind`. */
export type AsyncTarget = Omit<AsyncTargetJSON, "kind"> & { kind: AsyncTargetKind };

// ── 1+2. Discriminated AST member overlays ───────────────────────────────────
// Statement members.

export type ActivityCall = ActivityCallJSON & { type: "activityCall" };
export type WorkflowCall = WorkflowCallJSON & {
  type: "workflowCall";
  mode: WorkflowCallMode;
};
export type NexusCall = NexusCallJSON & { type: "nexusCall"; detach: boolean };
export type AwaitStmt = Omit<AwaitStmtJSON, "type" | "target"> & {
  type: "await";
  target: AsyncTarget;
};
export type AwaitAllBlock = AwaitAllBlockJSON & { type: "awaitAll" };
export type AwaitOneCase = Omit<AwaitOneCaseJSON, "target" | "awaitAll"> & {
  target?: AsyncTarget;
  awaitAll?: AwaitAllBlock;
};
export type AwaitOneBlock = Omit<AwaitOneBlockJSON, "type" | "cases"> & {
  type: "awaitOne";
  cases: AwaitOneCase[];
};
export type SwitchCase = SwitchCaseJSON;
export type SwitchBlock = SwitchBlockJSON & { type: "switch" };
export type IfStmt = IfStmtJSON & { type: "if" };
export type ForStmt = ForStmtJSON & { type: "for"; variant: ForVariant };
export type ReturnStmt = ReturnStmtJSON & { type: "return" };
export type CloseStmt = CloseStmtJSON & { type: "close" };
export type BreakStmt = BreakStmtJSON & { type: "break" };
export type ContinueStmt = ContinueStmtJSON & { type: "continue" };
export type RawStmt = RawStmtJSON & { type: "raw" };
export type Comment = CommentJSON & { type: "comment" };
export type SignalSendStmt = SignalSendStmtJSON & { type: "signalSend" };
export type PromiseStmt = Omit<PromiseStmtJSON, "type" | "target"> & {
  type: "promise";
  target: AsyncTarget;
};
export type SetStmt = SetStmtJSON & { type: "set" };
export type UnsetStmt = UnsetStmtJSON & { type: "unset" };

/** Workflow-body statement union — mirrors marshalStatement in ast/json.go. */
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
  | SignalSendStmt
  | PromiseStmt
  | SetStmt
  | UnsetStmt;

// Declaration members.

export type SignalDecl = SignalDeclJSON & { type: "signalDecl" };
export type QueryDecl = QueryDeclJSON & { type: "queryDecl" };
export type UpdateDecl = UpdateDeclJSON & { type: "updateDecl" };
/** Workflow handler-declaration union (signal / query / update). */
export type HandlerDecl = SignalDecl | QueryDecl | UpdateDecl;

// State block + nexus operation.

export type StateBlock = Omit<StateBlockJSON, "conditions" | "rawStmts"> & {
  conditions?: ConditionDecl[];
  rawStmts?: RawStmt[];
};
export type NexusOperation = NexusOperationJSON & { opType: NexusOperationType };

// Definition members.

export type WorkflowDef = Omit<
  WorkflowDefJSON,
  "type" | "state" | "signals" | "queries" | "updates"
> & {
  type: "workflowDef";
  state?: StateBlock;
  signals: SignalDecl[];
  queries: QueryDecl[];
  updates: UpdateDecl[];
};
export type ActivityDef = ActivityDefJSON & { type: "activityDef" };
export type WorkerDef = WorkerDefJSON & { type: "workerDef" };
export type NamespaceDef = NamespaceDefJSON & { type: "namespaceDef" };
export type NexusServiceDef = Omit<NexusServiceDefJSON, "type" | "operations"> & {
  type: "nexusServiceDef";
  operations?: NexusOperation[];
};

/** Top-level definition union — mirrors marshalDefinition in ast/json.go. */
export type Definition =
  | WorkflowDef
  | ActivityDef
  | WorkerDef
  | NamespaceDef
  | NexusServiceDef;

// ── 3. Body / definitions array element aliases ──────────────────────────────
// The generated AST refers to RawStatement / RawDefinition (Go json.RawMessage
// aliases) on its body / definitions fields; resolving them to the discriminated
// unions makes those generated arrays narrowable too.

export type RawStatement = Statement;
export type RawDefinition = Definition;
