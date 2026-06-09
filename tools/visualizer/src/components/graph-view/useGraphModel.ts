// useGraphModel — the pure data layer for the Graph View.
//
// Derives everything that comes straight from props (ast, parserGraph, filter)
// with no dependency on the simulation or the DOM: the view-side graph, the set
// of source files, the filter-change "recently changed" flash set, and the
// error/diagnostic partition by the file filter. Extracted from GraphView as the
// first, most-isolated decomposition step (see graphview_hook_decomposition plan).

import React from 'react'
import type { TWFFile, FileError, Diagnostic } from '../../types/ast'
import type { ParserGraph } from '../../types/parser-graph'
import type { FilterState } from '../../filter/types'
import { filterStatesEqual } from '../../filter/types'
import { buildGraph } from '../../graph/build'

// graphFindingsToDiagnostics lifts graph-stage findings (parserGraph.diagnostics
// and parserGraph.unresolved) into the AST Diagnostic shape so the existing
// GraphErrorsHeader renders them with no new UI. These are the primary way
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
  graph: ReturnType<typeof buildGraph>
  allFiles: string[]
  recentlyChanged: Set<string>
  errors: FileError[]
  diagnostics: Diagnostic[]
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}

export function useGraphModel(ast: TWFFile, parserGraph: ParserGraph, filter: FilterState): GraphModel {
  const selectedFiles = filter.selectedFiles

  // Build the view-side graph from the parser's deployment graph. AST is
  // consulted for sourceFile (file-filter chips) and future hover enrichments.
  const graph = React.useMemo(
    () => buildGraph(parserGraph, ast),
    [parserGraph, ast],
  )

  // All unique source files across graph nodes (drives the file-filter chips).
  const allFiles = React.useMemo(() => {
    const files = new Set<string>()
    for (const node of graph.nodes.values()) {
      if (node.sourceFile) files.add(node.sourceFile)
    }
    return Array.from(files).sort()
  }, [graph])

  // Transient "recently changed" set for the focus-transition flash animation:
  // the file/type keys that just turned on, cleared ~450ms later.
  const prevFilterRef = React.useRef<FilterState>(filter)
  const [recentlyChanged, setRecentlyChanged] = React.useState<Set<string>>(new Set())
  React.useEffect(() => {
    const prev = prevFilterRef.current
    if (filterStatesEqual(prev, filter)) return
    const changed = new Set<string>()
    for (const f of filter.selectedFiles) if (!prev.selectedFiles.has(f)) changed.add(`file:${f}`)
    for (const t of filter.visibleTypes) if (!prev.visibleTypes.has(t)) changed.add(`type:${t}`)
    prevFilterRef.current = filter
    if (changed.size > 0) {
      setRecentlyChanged(changed)
      const timer = setTimeout(() => setRecentlyChanged(new Set()), 450)
      return () => clearTimeout(timer)
    }
  }, [filter])

  // Process-level FileErrors and structured Diagnostics, partitioned by the
  // file filter so the errors header can report the shown/hidden split.
  // Graph-stage findings (parserGraph.diagnostics + unresolved) are folded in
  // alongside the AST diagnostics so history-derived warnings are visible.
  const errors = ast.errors || []
  const diagnostics = React.useMemo(
    () => [...(ast.diagnostics || []), ...graphFindingsToDiagnostics(parserGraph)],
    [ast.diagnostics, parserGraph],
  )
  const { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics } = React.useMemo(() => {
    if (selectedFiles.size === 0) {
      return {
        shownFileErrors: errors,
        hiddenFileErrors: [] as FileError[],
        shownDiagnostics: diagnostics,
        hiddenDiagnostics: [] as Diagnostic[],
      }
    }
    const sFE: FileError[] = []
    const hFE: FileError[] = []
    for (const e of errors) {
      if (selectedFiles.has(e.file)) sFE.push(e)
      else hFE.push(e)
    }
    const sD: Diagnostic[] = []
    const hD: Diagnostic[] = []
    for (const d of diagnostics) {
      // Unstamped diagnostics surface in the shown group so a missing file path
      // can't accidentally hide them.
      if (!d.file || selectedFiles.has(d.file)) sD.push(d)
      else hD.push(d)
    }
    return { shownFileErrors: sFE, hiddenFileErrors: hFE, shownDiagnostics: sD, hiddenDiagnostics: hD }
  }, [errors, diagnostics, selectedFiles])

  return {
    graph,
    allFiles,
    recentlyChanged,
    errors,
    diagnostics,
    shownFileErrors,
    hiddenFileErrors,
    shownDiagnostics,
    hiddenDiagnostics,
  }
}
