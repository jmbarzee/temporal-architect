// Public entry point for `@temporal-architect/visualizer`.
//
// This file is the *only* surface npm consumers see. Anything not re-exported
// here is an internal implementation detail and may change without a major
// version bump. When adding new exports, prefer a deliberate, named re-export
// to `export *` so the public API is grep-able in one place.

// Global layout / filter-bar / graph-overlay / control-panel / groups-modal
// styles. Imported here (not just in the standalone main.tsx) so the published
// library's single `styles.css` is complete — host webviews load only that
// sibling stylesheet, so anything omitted here is simply unstyled for them.
// Component-level CSS (blocks.css, style-guide.css) is pulled in transitively
// by the components below and folds into the same bundle.
import './styles/index.css'

export { WorkflowCanvas as Visualizer } from './components/WorkflowCanvas'

// Host-embedding kit. These are host-agnostic rendering pieces an embedder
// needs to mount the visualizer inside an arbitrary shell (e.g. a VS Code
// webview): a payload normalizer for the parser's wire shapes, the runtime
// node-type CSS injector, and the debug style guide. The VS Code-specific glue
// (acquireVsCodeApi, the editor message protocol) lives in the host, not here.
export { StyleGuide } from './components/StyleGuide'
export { normalizePayload } from './types/payload'
export type { NormalizedPayload } from './types/payload'
export { mountNodeTypeStyles } from './graph/node-type-styles'

// The host shell itself. `<VisualizerHost>` wraps the render core with the
// payload de-dupe, normalization, StyleGuide toggle, and error/empty/canvas
// branches that every host would otherwise copy. A host supplies two seams — a
// `PayloadSource` (how inbound payloads arrive) and optional `HostActions`
// (where outbound user intent goes) — plus an `emptyState` slot for its own
// no-payload content. The `HostMessage` union is the inbound vocabulary a
// `PayloadSource` speaks; `OutboundMessageType` canonicalizes the outbound wire
// `type` values (`ready`/`openFile`/`refocus`) so every transport agrees on
// them. The library never *implements* a transport — the concrete adapters
// (postMessage / SSE / fetch) are the host's concern.
export { VisualizerHost } from './components/VisualizerHost'
export type {
  VisualizerHostProps,
  PayloadSource,
  HostActions,
} from './components/VisualizerHost'
export type { HostMessage, OutboundMessage } from './components/protocol'
export { OutboundMessageType } from './components/protocol'

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

// ParserGraph types — the wire shape of `twf graph`'s JSON payload. Host
// applications that want to feed the visualizer's graph view must provide
// this alongside the AST. Listed explicitly rather than star-exported.
export type {
  ParserGraph,
  ParserGraphSummary,
  ParserNode,
  ParserEdge,
  ParserEdgeKind,
  ParserRouting,
  ParserTier,
  CoarsenedEdge,
  ParserUnresolved,
  ParserGraphDiagnostic,
  ParserGraphDiagnosticCode,
  ParserGraphDiagnosticSeverity,
  DefinitionKey,
} from './types/parser-graph'
export { EMPTY_PARSER_GRAPH } from './types/parser-graph'

// Decomposition types — the wire shape of `twf graph chunks`'s `chunks`
// payload. Host applications that want to drive the Graph view's group overlay
// pass a `decomposition` alongside the AST and parser graph.
export type {
  Decomposition,
  Chunk,
  Division,
  Section,
  SectionEdge,
  Advisory,
} from './types/decomposition'

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
