// TypeScript types mirroring `twf graph`'s JSON payload.
//
// Authoritative shape: `tools/lsp/parser/graph/graph.go` (Go struct names
// match 1:1 with the field names below; field tags carry the wire names).
// When the parser graph contract changes, this file is the visualizer's
// part of the rename — keep the two in lockstep.

/** Definition key — `${kind}:${name}`, e.g. `workflow:OrderWorkflow`. */
export type DefinitionKey = string

/** Edge kind discriminator. Mirrors the Go EdgeXxx constants. */
export type ParserEdgeKind =
  | 'containment'
  | 'activityCall'
  | 'workflowCall'
  | 'nexusCall'
  | 'asyncBacking'
  | 'signalSend'

/** Coarsening tier discriminator. Mirrors the Go TierXxx constants. */
export type ParserTier = 'worker' | 'namespace'

/** Diagnostic codes emitted by the graph stage. */
export type ParserGraphDiagnosticCode = 'DISPATCH_NO_REACHABLE_DEPLOYMENT'

/** Graph-stage diagnostic severity. */
export type ParserGraphDiagnosticSeverity = 'error' | 'warning'

/**
 * One deployment in the resolved graph. Identity is composite
 * (definition × deployment context), encoded into `id`.
 *
 * `definition` is the AST anchor (always present); the optional
 * `worker` / `namespace` / `queue` fields carry deployment context.
 * Orphan nodes (definitions that exist but have no deployment) carry
 * `orphan: true` and omit the deployment fields.
 */
export interface ParserNode {
  id: string
  definition: DefinitionKey
  worker?: DefinitionKey      // e.g. "worker:paymentWorker"
  namespace?: string          // e.g. "namespace:ecommerce"
  queue?: string
  orphan?: boolean
}

/**
 * Routing block on a dispatch edge. Diagnostic-only — the effect of
 * routing (which deployment got the call) is already encoded by the
 * edge's `to` node. Containment edges omit this.
 */
export interface ParserRouting {
  /** Literal task_queue from the call site, when one was specified. */
  explicit?: string
  /** Endpoint node ID, set only on `nexusCall` edges. */
  nexusEndpoint?: string
}

/**
 * Edge in the resolved graph. Dispatch edges
 * (`activityCall` / `workflowCall` / `nexusCall` / `asyncBacking`) carry
 * `routing`; containment edges omit it entirely.
 */
export interface ParserEdge {
  from: string
  to: string
  kind: ParserEdgeKind
  line: number
  routing?: ParserRouting
}

/**
 * Dispatch edge projected to a higher containment tier
 * (worker → worker, or namespace → namespace), aggregated by
 * (from, to, tier).
 */
export interface CoarsenedEdge {
  from: string
  to: string
  tier: ParserTier
  weight: number
}

/** Call site whose callee couldn't be resolved by the resolver. */
export interface ParserUnresolved {
  from: string
  name: string
  kind: ParserEdgeKind
  line: number
}

/** Graph-stage diagnostic. */
export interface ParserGraphDiagnostic {
  severity: ParserGraphDiagnosticSeverity
  code: ParserGraphDiagnosticCode
  message: string
  from?: string
  line: number
}

/** Top-level counts from `twf graph`. */
export interface ParserGraphSummary {
  nodes: number
  edges: number
  coarsenedEdges: number
  unresolved: number
  diagnostics: number
}

/**
 * The full payload emitted by `twf graph --json` (inside the standard
 * envelope's `graph` field). Arrays are always non-nil (`[]` on empty),
 * matching the Go side's stable wire shape.
 */
export interface ParserGraph {
  summary: ParserGraphSummary
  nodes: ParserNode[]
  edges: ParserEdge[]
  coarsenedEdges: CoarsenedEdge[]
  unresolved: ParserUnresolved[]
  diagnostics: ParserGraphDiagnostic[]
}

/** Empty parser graph — used as a fallback when no graph is available. */
export const EMPTY_PARSER_GRAPH: ParserGraph = {
  summary: { nodes: 0, edges: 0, coarsenedEdges: 0, unresolved: 0, diagnostics: 0 },
  nodes: [],
  edges: [],
  coarsenedEdges: [],
  unresolved: [],
  diagnostics: [],
}
