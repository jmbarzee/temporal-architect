import { Definition, Diagnostic, SummaryMetadata } from '@temporal-architect/wire-types';
export type { Definition, WorkflowDef, ActivityDef, WorkerDef, WorkerRef, NamespaceDef, NamespaceWorker, NamespaceEndpoint, NexusServiceDef, NexusOperation, NexusOperationType, StateBlock, ConditionDecl, SignalDecl, QueryDecl, UpdateDecl, HandlerDecl, ResolvedRef, Diagnostic, DiagnosticSeverity, DiagnosticKind, Position, SummaryMetadata, Statement, ActivityCall, WorkflowCall, WorkflowCallMode, NexusCall, AwaitStmt, AwaitAllBlock, AwaitOneBlock, AwaitOneCase, SwitchBlock, SwitchCase, IfStmt, ForStmt, ForVariant, ReturnStmt, CloseStmt, BreakStmt, ContinueStmt, RawStmt, Comment, PromiseStmt, SetStmt, UnsetStmt, AsyncTarget, AsyncTargetKind, TimerTarget, SignalTarget, UpdateTarget, ActivityTarget, WorkflowTarget, NexusTarget, IdentTarget, OptionsBlock, OptionEntry, } from '@temporal-architect/wire-types';
export interface FileError {
    file: string;
    error: string;
    stderr?: string;
}
export interface TWFFile {
    summary?: SummaryMetadata;
    definitions: Definition[];
    focusedFile?: string;
    errors?: FileError[];
    diagnostics?: Diagnostic[];
}
