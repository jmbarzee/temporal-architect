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

// Decomposition payload — the `chunks` field of `twf graph chunks --json`.
// `Decomposition` is the top-level Result; the rest are its nested shapes.
// Listed explicitly (not star-exported) so the public surface stays grep-able
// and the generic generated names (`Result`, `Node`) don't leak.
export type { SectionEdge, Advisory } from "./generated/decompose";

import type {
  Result as DecompositionJSON,
  Chunk as ChunkJSON,
  Division as DivisionJSON,
  Section as SectionJSON,
  Node as DecompositionNodeJSON,
} from "./generated/decompose";
import type { LabelKind } from "./residue";

// The display fields arrived with package identity; a saved decomposition, or
// one from an older twf, lacks them, so they are optional here.

/** One proposed sub-unit of a divided chunk. */
export type Section = Omit<SectionJSON, "labelKind" | "label" | "divisions"> & {
  labelKind?: LabelKind;
  label?: string;
  divisions?: Division[];
};
/** One ranked way to divide an over-ceiling chunk. */
export type Division = Omit<DivisionJSON, "sections"> & { sections: Section[] };
/** One chunk of the hard partition. */
export type Chunk = Omit<ChunkJSON, "baseKey" | "label" | "divisions"> & {
  baseKey?: string;
  label?: string;
  divisions?: Division[];
};
/** One authorable definition of a decomposition. */
export type DecompositionNode = Omit<DecompositionNodeJSON, "label"> & { label?: string };
/** The `chunks` payload of `twf graph chunks --json`. */
export type Decomposition = Omit<DecompositionJSON, "nodes" | "chunks"> & {
  nodes: DecompositionNode[];
  chunks: Chunk[];
};

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
import type { Diagnostic as EnvelopeDiagnosticJSON } from "./generated/envelope";
import type {
  ObservedGraph as ObservedGraphJSON,
  Window as ObservedWindowJSON,
} from "./generated/observe";
import type { FileSummary } from "./generated/ast";
import type {
  EdgeKind,
  CoarsenTier,
  GraphDiagnosticSeverity,
  DiagnosticSeverity,
  DiagnosticKind,
} from "./residue";

// ── Envelope: diagnostics + summary ──────────────────────────────────────────

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
 * is graph.go's only emitted code today; SIGNAL_TARGET_NOT_SAMPLED and
 * SIGNAL_TARGET_AMBIGUOUS are produced by the history-import path that shares
 * this payload shape.
 */
export type ParserGraphDiagnosticCode =
  | "DISPATCH_NO_REACHABLE_DEPLOYMENT"
  | "SIGNAL_TARGET_NOT_SAMPLED"
  | "SIGNAL_TARGET_AMBIGUOUS";

/** A graph node; `name` is optional because saved graphs from an older twf lack it. */
export type ParserNode = Omit<GraphNodeJSON, "name"> & { name?: string };
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
  "nodes" | "edges" | "coarsenedEdges" | "unresolved" | "diagnostics"
> & {
  nodes: ParserNode[];
  edges: ParserEdge[];
  coarsenedEdges: CoarsenedEdge[];
  unresolved: ParserUnresolved[];
  diagnostics: ParserGraphDiagnostic[];
};

// ── Observed graph payload (sampler `observedGraph`) ──────────────────────────
// The sampler's output: the ParserGraph shape plus a time axis (ObservedWindow)
// and a per-edge occurrence series (ObservedEdge.buckets). It is a superset of
// ParserGraph — see observe.go.

/** The time axis the per-edge occurrence buckets are laid out on. */
export type ObservedWindow = ObservedWindowJSON;

/**
 * A dispatch edge observed in history: a ParserEdge plus its occurrence series.
 *
 * NB: the Go ObservedEdge embeds graph.Edge, which encoding/json flattens onto
 * the edge object. tygo cannot express a cross-package embed and renders it as a
 * nested `Edge` field in ./generated/observe (which does NOT match the wire
 * bytes), so the true flattened shape is restated here — the same residue
 * pattern the AST unions use.
 */
export type ObservedEdge = ParserEdge & { buckets: number[] };

/** The full payload emitted by the sampler (the envelope's `observedGraph`). */
export type ObservedGraph = Omit<
  ObservedGraphJSON,
  "nodes" | "edges" | "coarsenedEdges" | "unresolved" | "diagnostics"
> & {
  nodes: ParserNode[];
  edges: ObservedEdge[];
  coarsenedEdges: CoarsenedEdge[];
  unresolved: ParserUnresolved[];
  diagnostics: ParserGraphDiagnostic[];
};
