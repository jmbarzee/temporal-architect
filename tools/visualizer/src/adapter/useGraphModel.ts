// useGraphModel — what the host reads off its payload for the Graph view: the
// view-side graph built from the parser's deployment graph, the join from each
// node's copyKey to its owning AST definition, and the findings (process-level
// file errors, the AST's diagnostics, and the graph-stage findings lifted into
// the same shape). Nothing here depends on the simulation or the DOM; the view
// takes the graph and findings as props and never sees the AST or the parser
// graph.

import React from 'react'
import type { TWFFile, FileError, Diagnostic, Site } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import { buildAstLookup, buildGraph, nodeLabel, type AstLookup } from './build'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from './dimensions'
import type { Graph } from '@jmbarzee/force-graph'
// graphFindingsToDiagnostics lifts graph-stage findings (parserGraph.diagnostics
// and parserGraph.unresolved) into the AST Diagnostic shape so the existing
// findings bars render them with no new UI. These are the primary way
// history-derived warnings (e.g. a signal target not present in the sampled
// histories) become visible — the AST carries no such diagnostics in history mode.
//
// A finding carries its call's site; one observed in history has none, so it
// rides through the file-filter partition in the "shown" group (file-less
// diagnostics are never hidden).
const noSite: Site = { line: 0, column: 0 }

export function graphFindingsToDiagnostics(pg: ParserGraph): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const d of pg.diagnostics) {
    out.push({
      severity: d.severity,
      kind: 'graph',
      code: d.code,
      message: d.message,
      site: d.site ?? noSite,
      name: d.from === undefined ? undefined : nodeLabel(pg, d.from),
    })
  }
  for (const u of pg.unresolved) {
    // A target behind an import of a package outside the tree is carried
    // unchecked, not broken: a hint, which the findings bars leave out.
    if (u.reason === 'external') {
      out.push({
        severity: 'hint',
        kind: 'graph',
        code: 'EXTERNAL_REFERENCE',
        message: `${u.kind} target ${JSON.stringify(u.name)} is in a package outside this tree (unchecked)`,
        name: nodeLabel(pg, u.from),
        site: u.site ?? noSite,
      })
      continue
    }
    const code = u.kind === 'signalSend' ? 'SIGNAL_TARGET_NOT_SAMPLED' : 'UNRESOLVED_REFERENCE'
    out.push({
      severity: 'warning',
      kind: 'graph',
      code,
      message: `unresolved ${u.kind} target ${JSON.stringify(u.name)} (not present in the sampled input)`,
      name: nodeLabel(pg, u.from),
      site: u.site ?? noSite,
    })
  }
  return out
}

export interface GraphModel {
  graph: Graph
  // A node's copyKey → the top-level definition that owns it: itself, or the
  // service / namespace an operation / endpoint is nested in. The host reads
  // it to focus the Tree on a node.
  ownerOf: AstLookup
  // Raw findings — partitioned by the file filter in the host's ErrorBars.
  errors: FileError[]
  diagnostics: Diagnostic[]
}

export function useGraphModel(ast: TWFFile, parserGraph: ParserGraph): GraphModel {
  // Build the view-side graph from the parser's deployment graph. AST is
  // consulted for each definition's file (file-filter chips) and future hover enrichments.
  const ownerOf = React.useMemo(() => buildAstLookup(ast), [ast])
  const graph = React.useMemo(
    () => buildGraph(parserGraph, ownerOf),
    [parserGraph, ownerOf],
  )
  // Process-level FileErrors and structured Diagnostics. Graph-stage findings
  // (parserGraph.diagnostics + unresolved) are folded in alongside the AST
  // diagnostics so history-derived warnings are visible.
  const errors = ast.errors || []
  const diagnostics = React.useMemo(
    () => [...(ast.diagnostics || []), ...graphFindingsToDiagnostics(parserGraph)],
    [ast.diagnostics, parserGraph],
  )
  return { graph, ownerOf, errors, diagnostics }
}

/** Every file an AST definition names as its source. */
export function sourceFilesOf(ast: TWFFile): Set<string> {
  const files = new Set<string>()
  for (const def of ast.definitions) {
    if (def.site.file) files.add(def.site.file)
  }
  return files
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
    const file = def.site.file
    if (file) fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1)
    const passesFile = selectedFiles.size === 0 || !file || selectedFiles.has(file)
    if (passesFile) typeCounts.set(def.type, (typeCounts.get(def.type) ?? 0) + 1)
  }
  return new Map([[SOURCE_FILE_DIMENSION, fileCounts], [DEF_TYPE_DIMENSION, typeCounts]])
}
