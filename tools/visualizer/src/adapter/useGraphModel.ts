// useGraphModel — what the host reads off its payload for the Graph view: the
// view-side graph built from the parser's deployment graph, and the findings
// (process-level file errors, the AST's diagnostics, and the graph-stage
// findings lifted into the same shape). Nothing here depends on the
// simulation or the DOM; the view takes the result as props and never sees
// the AST or the parser graph (D41, D61).

import React from 'react'
import type { TWFFile, FileError, Diagnostic } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import { buildGraph } from './build'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from './dimensions'
import type { Graph } from '@temporal-architect/graph-view'
// graphFindingsToDiagnostics lifts graph-stage findings (parserGraph.diagnostics
// and parserGraph.unresolved) into the AST Diagnostic shape so the existing
// findings bars render them with no new UI. These are the primary way
// history-derived warnings (e.g. a signal target not present in the sampled
// histories) become visible — the AST carries no such diagnostics in history mode.
//
// Graph findings have no source file or column; they ride through the file-filter
// partition in the "shown" group (file-less diagnostics are never hidden).
function graphFindingsToDiagnostics(pg: ParserGraph): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const d of pg.diagnostics) {
    out.push({
      severity: d.severity,
      kind: 'graph',
      code: d.code,
      message: d.message,
      name: d.from,
      start: { line: d.line, column: 0 },
      end: { line: d.line, column: 0 },
    })
  }
  for (const u of pg.unresolved) {
    const code = u.kind === 'signalSend' ? 'SIGNAL_TARGET_NOT_SAMPLED' : 'UNRESOLVED_REFERENCE'
    out.push({
      severity: 'warning',
      kind: 'graph',
      code,
      message: `unresolved ${u.kind} target ${JSON.stringify(u.name)} (not present in the sampled input)`,
      name: u.from,
      start: { line: u.line, column: 0 },
      end: { line: u.line, column: 0 },
    })
  }
  return out
}

export interface GraphModel {
  graph: Graph
  // Raw findings — partitioned by the file filter in the host's ErrorBars.
  errors: FileError[]
  diagnostics: Diagnostic[]
}

export function useGraphModel(ast: TWFFile, parserGraph: ParserGraph): GraphModel {
  // Build the view-side graph from the parser's deployment graph. AST is
  // consulted for sourceFile (file-filter chips) and future hover enrichments.
  const graph = React.useMemo(
    () => buildGraph(parserGraph, ast),
    [parserGraph, ast],
  )
  // Process-level FileErrors and structured Diagnostics. Graph-stage findings
  // (parserGraph.diagnostics + unresolved) are folded in alongside the AST
  // diagnostics so history-derived warnings are visible.
  const errors = ast.errors || []
  const diagnostics = React.useMemo(
    () => [...(ast.diagnostics || []), ...graphFindingsToDiagnostics(parserGraph)],
    [ast.diagnostics, parserGraph],
  )
  return { graph, errors, diagnostics }
}

/**
 * The chip badges, per axis and value: top-level definitions per file, and per
 * type among the selected files (or all of them, when none is selected). A
 * definition with no source file cannot be filtered out by a file selection.
 */
export function definitionCounts(ast: TWFFile, selectedFiles: ReadonlySet<string>): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const typeCounts = new Map<string, number>()
  const fileCounts = new Map<string, number>()
  for (const def of ast.definitions) {
    if (def.sourceFile) fileCounts.set(def.sourceFile, (fileCounts.get(def.sourceFile) ?? 0) + 1)
    const passesFile = selectedFiles.size === 0 || !def.sourceFile || selectedFiles.has(def.sourceFile)
    if (passesFile) typeCounts.set(def.type, (typeCounts.get(def.type) ?? 0) + 1)
  }
  return new Map([[SOURCE_FILE_DIMENSION, fileCounts], [DEF_TYPE_DIMENSION, typeCounts]])
}
