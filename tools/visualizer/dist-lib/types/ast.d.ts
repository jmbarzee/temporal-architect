export interface Position {
    line: number;
    column: number;
}
export interface ResolvedRef {
    name: string;
    line: number;
    column: number;
}
export interface FileError {
    file: string;
    error: string;
    stderr?: string;
}
export type DiagnosticSeverity = 'error' | 'warning';
export type DiagnosticKind = 'parse' | 'resolve' | 'validate';
export interface Diagnostic {
    severity: DiagnosticSeverity;
    kind: DiagnosticKind;
    code: string;
    file?: string;
    start: Position;
    end: Position;
    message: string;
    name?: string;
}
export interface SummaryMetadata {
    namespaces: number;
    workers: number;
    workflows: number;
    activities: number;
    nexusServices: number;
    errors?: number;
    warnings?: number;
}
export interface TWFFile {
    summary?: SummaryMetadata;
    definitions: Definition[];
    focusedFile?: string;
    errors?: FileError[];
    diagnostics?: Diagnostic[];
}
export type NexusOperationType = 'async' | 'sync';
export interface NexusOperation extends Position {
    opType: NexusOperationType;
    name: string;
    workflowName?: string;
    params?: string;
    returnType?: string;
    body?: Statement[];
}
export interface NexusServiceDef extends Position {
    type: 'nexusServiceDef';
    name: string;
    operations?: NexusOperation[];
    sourceFile?: string;
}
export type Definition = WorkflowDef | ActivityDef | WorkerDef | NamespaceDef | NexusServiceDef;
export interface WorkflowDef extends Position {
    type: 'workflowDef';
    name: string;
    params: string;
    returnType?: string;
    state?: StateBlock;
    signals: SignalDecl[];
    queries: QueryDecl[];
    updates: UpdateDecl[];
    body: Statement[];
    sourceFile?: string;
}
export interface StateBlock {
    conditions?: ConditionDecl[];
    rawStmts?: RawStmt[];
}
export interface ConditionDecl extends Position {
    name: string;
}
export interface ActivityDef extends Position {
    type: 'activityDef';
    name: string;
    params: string;
    returnType?: string;
    body: Statement[];
    sourceFile?: string;
}
export interface WorkerRef extends Position {
    name: string;
    resolved?: ResolvedRef;
}
export interface WorkerDef extends Position {
    type: 'workerDef';
    name: string;
    workflows: WorkerRef[];
    activities: WorkerRef[];
    services: WorkerRef[];
    sourceFile?: string;
}
export interface NamespaceWorker extends Position {
    workerName: string;
    options?: OptionsBlock;
    resolvedWorker?: ResolvedRef;
}
export interface NamespaceEndpoint extends Position {
    endpointName: string;
    options?: OptionsBlock;
}
export interface NamespaceDef extends Position {
    type: 'namespaceDef';
    name: string;
    workers: NamespaceWorker[];
    endpoints: NamespaceEndpoint[];
    sourceFile?: string;
}
export type HandlerDecl = SignalDecl | QueryDecl | UpdateDecl;
export interface SignalDecl extends Position {
    type: 'signalDecl';
    name: string;
    params: string;
    body?: Statement[];
}
export interface QueryDecl extends Position {
    type: 'queryDecl';
    name: string;
    params: string;
    returnType?: string;
    body?: Statement[];
}
export interface UpdateDecl extends Position {
    type: 'updateDecl';
    name: string;
    params: string;
    returnType?: string;
    body?: Statement[];
}
export type Statement = ActivityCall | WorkflowCall | NexusCall | AwaitStmt | AwaitAllBlock | AwaitOneBlock | SwitchBlock | IfStmt | ForStmt | ReturnStmt | CloseStmt | BreakStmt | ContinueStmt | RawStmt | Comment | PromiseStmt | SetStmt | UnsetStmt;
export interface ActivityCall extends Position {
    type: 'activityCall';
    name: string;
    args: string;
    result?: string;
    options?: string;
    resolved?: ResolvedRef;
}
export type WorkflowCallMode = 'child' | 'detach';
export interface WorkflowCall extends Position {
    type: 'workflowCall';
    mode: WorkflowCallMode;
    name: string;
    args: string;
    result?: string;
    options?: string;
    resolved?: ResolvedRef;
}
export interface OptionEntry {
    key: string;
    value?: string;
    valueType?: string;
    nested?: OptionEntry[];
}
export interface OptionsBlock {
    entries: OptionEntry[];
}
export interface NexusCall extends Position {
    type: 'nexusCall';
    detach: boolean;
    endpoint: string;
    service: string;
    operation: string;
    args: string;
    result?: string;
    options?: OptionsBlock;
    resolvedEndpoint?: ResolvedRef;
    resolvedEndpointNamespace?: string;
    resolvedService?: ResolvedRef;
    resolvedOperation?: ResolvedRef;
}
export type AsyncTargetKind = 'timer' | 'signal' | 'update' | 'activity' | 'workflow' | 'nexus' | 'ident';
export interface TimerTarget {
    duration: string;
}
export interface SignalTarget {
    name: string;
    params?: string;
}
export interface UpdateTarget {
    name: string;
    params?: string;
}
export interface ActivityTarget {
    name: string;
    args?: string;
    result?: string;
    resolved?: ResolvedRef;
}
export interface WorkflowTarget {
    name: string;
    mode: string;
    args?: string;
    result?: string;
    resolved?: ResolvedRef;
}
export interface NexusTarget {
    endpoint: string;
    service: string;
    operation: string;
    args?: string;
    result?: string;
    detach?: boolean;
    resolvedEndpoint?: ResolvedRef;
    resolvedEndpointNamespace?: string;
    resolvedService?: ResolvedRef;
    resolvedOperation?: ResolvedRef;
}
export interface IdentTarget {
    name: string;
    result?: string;
}
export interface AsyncTarget {
    kind: AsyncTargetKind;
    timer?: TimerTarget;
    signal?: SignalTarget;
    update?: UpdateTarget;
    activity?: ActivityTarget;
    workflow?: WorkflowTarget;
    nexus?: NexusTarget;
    ident?: IdentTarget;
}
export interface AwaitStmt extends Position {
    type: 'await';
    target: AsyncTarget;
}
export interface AwaitAllBlock extends Position {
    type: 'awaitAll';
    body: Statement[];
}
export interface AwaitOneCase extends Position {
    target?: AsyncTarget;
    awaitAll?: AwaitAllBlock;
    body: Statement[];
}
export interface AwaitOneBlock extends Position {
    type: 'awaitOne';
    cases: AwaitOneCase[];
}
export interface SwitchCase extends Position {
    value: string;
    body: Statement[];
}
export interface SwitchBlock extends Position {
    type: 'switch';
    expr: string;
    cases: SwitchCase[];
    default?: Statement[];
}
export interface IfStmt extends Position {
    type: 'if';
    condition: string;
    body: Statement[];
    elseBody?: Statement[];
}
export type ForVariant = 'infinite' | 'conditional' | 'iteration';
export interface ForStmt extends Position {
    type: 'for';
    variant: ForVariant;
    condition?: string;
    variable?: string;
    iterable?: string;
    body: Statement[];
}
export interface ReturnStmt extends Position {
    type: 'return';
    value?: string;
}
export interface CloseStmt extends Position {
    type: 'close';
    reason: string;
    args?: string;
}
export interface BreakStmt extends Position {
    type: 'break';
}
export interface ContinueStmt extends Position {
    type: 'continue';
}
export interface RawStmt extends Position {
    type: 'raw';
    text: string;
}
export interface Comment extends Position {
    type: 'comment';
    text: string;
}
export interface PromiseStmt extends Position {
    type: 'promise';
    name: string;
    target: AsyncTarget;
}
export interface SetStmt extends Position {
    type: 'set';
    name: string;
}
export interface UnsetStmt extends Position {
    type: 'unset';
    name: string;
}
export declare function isWorkflowDef(def: Definition): def is WorkflowDef;
export declare function isActivityDef(def: Definition): def is ActivityDef;
export declare function isWorkerDef(def: Definition): def is WorkerDef;
export declare function isNamespaceDef(def: Definition): def is NamespaceDef;
export declare function isNexusServiceDef(def: Definition): def is NexusServiceDef;
