// Payload normalization shared by the standalone (App.tsx) and webview
// (webview.tsx) entry points.
//
// The visualizer accepts three input shapes, in precedence order:
//
//  1. Wrapped envelope `{ ast, parserGraph }` — the host-preferred shape;
//     `twf parse` AST plus the resolved deployment graph.
//  2. Graph envelope `{ summary, diagnostics, graph }` — the output of
//     `twf graph --json` (including `twf graph --history`). There is no AST,
//     so we synthesize an empty one; WorkflowCanvas renders in history
//     (Graph-only) mode when `definitions` is empty.
//  3. Bare `TWFFile` — legacy / AST-only fixtures.

import type { TWFFile } from './ast'
import type { ParserGraph } from './parser-graph'
import type { Decomposition } from './decomposition'

/**
 * Normalized payload: a non-null AST plus an optional deployment graph and an
 * optional decomposition (`twf graph chunks`). The decomposition is additive —
 * absent for hosts that don't supply it; the Graph view's group overlay is
 * simply inert when it's missing.
 */
export interface NormalizedPayload {
  ast: TWFFile
  parserGraph?: ParserGraph
  decomposition?: Decomposition
}

/** Wrapped `{ ast, parserGraph, decomposition }` envelope. */
export function isWrappedPayload(
  d: unknown,
): d is { ast: TWFFile; parserGraph?: ParserGraph; decomposition?: Decomposition } {
  return d != null && typeof d === 'object' && 'ast' in (d as Record<string, unknown>) &&
    (d as { ast: unknown }).ast != null
}

/**
 * Graph envelope from `twf graph --json`: `{ summary, diagnostics, graph }`.
 * `graph` is a ParserGraph (or null when extraction failed); there is no AST.
 * Distinguished from a bare TWFFile by the presence of a non-null `graph` key
 * and the absence of `definitions`.
 */
export function isGraphEnvelope(d: unknown): d is { graph: ParserGraph } {
  if (d == null || typeof d !== 'object') return false
  const obj = d as Record<string, unknown>
  return 'graph' in obj && obj.graph != null && !('definitions' in obj) && !('ast' in obj)
}

/**
 * Normalize an arbitrary loaded payload into `{ ast, parserGraph? }`, or null
 * when the input is not a recognized shape. Precedence: wrapped envelope →
 * graph envelope (synthesizes an empty AST) → bare TWFFile.
 */
export function normalizePayload(d: unknown): NormalizedPayload | null {
  if (isWrappedPayload(d)) {
    return { ast: d.ast, parserGraph: d.parserGraph, decomposition: d.decomposition }
  }
  if (isGraphEnvelope(d)) {
    return { ast: { definitions: [] }, parserGraph: d.graph }
  }
  if (d != null && typeof d === 'object' && 'definitions' in (d as Record<string, unknown>)) {
    return { ast: d as TWFFile, parserGraph: undefined }
  }
  return null
}
