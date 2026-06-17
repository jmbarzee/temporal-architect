// Public API for @temporal-architect/wire-types.
//
// The TypeScript projection of twf's JSON wire contract. The Go DTO structs in
// tools/lsp are the single source of truth; ./generated/* is produced by tygo
// (CI-gated via `make check-types`), and ./residue.ts supplies the discriminated
// overlays and string-literal enums tygo can't express. This barrel assembles
// the ergonomic public surface both the visualizer and the extension consume
// (type-only).

// AST ergonomic types + string-literal enums + leaf aliases.
export type * from "./residue";

// Raw generated AST DTOs (the `*JSON` shapes) and summary/file types, for
// callers that want the unmodified wire structs.
export type * from "./generated/ast";

// `twf symbols --json` payload.
export type * from "./generated/symbols";

import type {
  Graph as GraphJSON,
  Node as GraphNodeJSON,
  Edge as GraphEdgeJSON,
  Summary as GraphSummaryJSON,
  Routing as GraphRoutingJSON,
  Unresolved as GraphUnresolvedJSON,
  CoarsenedEdge as GraphCoarsenedEdgeJSON,
  Diagnostic as GraphDiagnosticJSON,
} from "./generated/graph";
import type {
  Diagnostic as EnvelopeDiagnosticJSON,
  Position as EnvelopePositionJSON,
} from "./generated/envelope";
import type { FileSummary } from "./generated/ast";
import type {
  EdgeKind,
  CoarsenTier,
  GraphDiagnosticSeverity,
  DiagnosticSeverity,
  DiagnosticKind,
} from "./residue";

// ── Envelope: diagnostics + summary ──────────────────────────────────────────

/** 1-based source position (`twf` envelope). */
export type Position = EnvelopePositionJSON;

/** Unified diagnostic emitted in every `twf` JSON envelope. */
export type Diagnostic = Omit<EnvelopeDiagnosticJSON, "severity" | "kind"> & {
  severity: DiagnosticSeverity;
  kind: DiagnosticKind;
};

/** Per-file definition counts + rolled-up diagnostic totals (`summary`). */
export type SummaryMetadata = FileSummary;

// ── Graph payload (`twf graph --json`) ───────────────────────────────────────
// Ergonomic names match the visualizer's prior hand types (Parser*-prefixed to
// avoid colliding with the view-layer's own Graph/Node/Edge model types).

/** Definition key — `${kind}:${name}`, e.g. `workflow:OrderWorkflow`. */
export type DefinitionKey = string;

export type ParserEdgeKind = EdgeKind;
export type ParserTier = CoarsenTier;
export type ParserGraphDiagnosticSeverity = GraphDiagnosticSeverity;
/**
 * Diagnostic codes surfaced on the graph payload. DISPATCH_NO_REACHABLE_DEPLOYMENT
 * is graph.go's only emitted code today; SIGNAL_TARGET_NOT_SAMPLED is produced by
 * the history-import path that shares this payload shape.
 */
export type ParserGraphDiagnosticCode =
  | "DISPATCH_NO_REACHABLE_DEPLOYMENT"
  | "SIGNAL_TARGET_NOT_SAMPLED";

export type ParserNode = GraphNodeJSON;
export type ParserRouting = GraphRoutingJSON;
export type ParserGraphSummary = GraphSummaryJSON;

export type ParserEdge = Omit<GraphEdgeJSON, "kind"> & { kind: ParserEdgeKind };
export type CoarsenedEdge = Omit<GraphCoarsenedEdgeJSON, "tier"> & {
  tier: ParserTier;
};
export type ParserUnresolved = Omit<GraphUnresolvedJSON, "kind"> & {
  kind: ParserEdgeKind;
};
export type ParserGraphDiagnostic = Omit<
  GraphDiagnosticJSON,
  "severity" | "code"
> & {
  severity: ParserGraphDiagnosticSeverity;
  code: ParserGraphDiagnosticCode;
};

/** The full payload emitted by `twf graph --json` (the envelope's `graph`). */
export type ParserGraph = Omit<
  GraphJSON,
  "edges" | "coarsenedEdges" | "unresolved" | "diagnostics"
> & {
  edges: ParserEdge[];
  coarsenedEdges: CoarsenedEdge[];
  unresolved: ParserUnresolved[];
  diagnostics: ParserGraphDiagnostic[];
};
