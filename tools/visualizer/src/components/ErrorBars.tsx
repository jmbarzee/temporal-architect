// The findings bars under the filter chips — process-level file errors, the
// parser's diagnostics — partitioned by the host's file filter into shown and
// hidden files. The host's, rendered into the bar's `findings` slot by both
// views: the shapes are the parser's, and a graph library has no opinion on
// them.

import React from 'react'
import './ErrorBars.css'
import type { FileError, Diagnostic } from '../types/ast'


interface Partitioned {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}

// Split findings into "shown files" vs "hidden files" by the file filter.
// File-less diagnostics surface in the shown group so a missing path can't
// accidentally hide them.
function partitionByFile(errors: FileError[], diagnostics: Diagnostic[], selectedFiles: ReadonlySet<string>): Partitioned {
  if (selectedFiles.size === 0) {
    return { shownFileErrors: errors, hiddenFileErrors: [], shownDiagnostics: diagnostics, hiddenDiagnostics: [] }
  }
  const shownFileErrors: FileError[] = []
  const hiddenFileErrors: FileError[] = []
  for (const e of errors) {
    if (selectedFiles.has(e.file)) shownFileErrors.push(e)
    else hiddenFileErrors.push(e)
  }
  const shownDiagnostics: Diagnostic[] = []
  const hiddenDiagnostics: Diagnostic[] = []
  for (const d of diagnostics) {
    if (!d.file || selectedFiles.has(d.file)) shownDiagnostics.push(d)
    else hiddenDiagnostics.push(d)
  }
  return { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics }
}

/**
 * Two independent, collapsed-by-default bars at the bottom of the filter bar:
 * a red Errors bar (process FileErrors + error-severity diagnostics) and a
 * yellow Warnings bar (warning-severity diagnostics). Each renders only when
 * it has at least one finding; each has its own scrollable body so a long list
 * never pushes the rest of the toolbar off-screen.
 */
export function ErrorBars({ errors, diagnostics, selectedFiles }: {
  errors: FileError[]
  diagnostics: Diagnostic[]
  selectedFiles: ReadonlySet<string>
}) {
  const { shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics } =
    partitionByFile(errors, diagnostics, selectedFiles)

  const shownErr = shownDiagnostics.filter(d => d.severity === 'error')
  const hiddenErr = hiddenDiagnostics.filter(d => d.severity === 'error')
  const shownWarn = shownDiagnostics.filter(d => d.severity === 'warning')
  const hiddenWarn = hiddenDiagnostics.filter(d => d.severity === 'warning')

  const errorCount = shownFileErrors.length + hiddenFileErrors.length + shownErr.length + hiddenErr.length
  const warningCount = shownWarn.length + hiddenWarn.length

  if (errorCount === 0 && warningCount === 0) return null

  return (
    <div className="filter-error-bars">
      {errorCount > 0 && (
        <SeverityBar
          severity="error"
          count={errorCount}
          shownFileErrors={shownFileErrors}
          hiddenFileErrors={hiddenFileErrors}
          shownDiagnostics={shownErr}
          hiddenDiagnostics={hiddenErr}
        />
      )}
      {warningCount > 0 && (
        <SeverityBar
          severity="warning"
          count={warningCount}
          shownFileErrors={[]}
          hiddenFileErrors={[]}
          shownDiagnostics={shownWarn}
          hiddenDiagnostics={hiddenWarn}
        />
      )}
    </div>
  )
}

function SeverityBar({ severity, count, shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics }: {
  severity: 'error' | 'warning'
  count: number
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}) {
  // Collapsed by default — the bar is a notification, expanded on demand.
  const [expanded, setExpanded] = React.useState(false)

  const icon = severity === 'error' ? '\u2717' : '\u26A0'
  const noun = severity === 'error' ? 'error' : 'warning'
  const title = `${count} ${count === 1 ? noun : `${noun}s`}`

  const shownTotal = shownFileErrors.length + shownDiagnostics.length
  const hiddenTotal = hiddenFileErrors.length + hiddenDiagnostics.length
  const splitGroups = shownTotal > 0 && hiddenTotal > 0

  return (
    <div className={`severity-bar severity-bar-${severity}`}>
      <div className="severity-bar-head" onClick={() => setExpanded(e => !e)}>
        <span className="block-toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="severity-bar-icon">{icon}</span>
        <span className="severity-bar-title">{title}</span>
      </div>
      {expanded && (
        <div className="severity-bar-body">
          {splitGroups && <div className="error-group-label">Shown files ({shownTotal})</div>}
          {shownFileErrors.map((err, i) => <FileErrorRow key={`sfe${i}`} err={err} />)}
          {shownDiagnostics.map((d, i) => <DiagnosticRow key={`sd${i}`} diagnostic={d} />)}
          {hiddenTotal > 0 && (
            <>
              <div className="error-group-label">Hidden files ({hiddenTotal})</div>
              {hiddenFileErrors.map((err, i) => <FileErrorRow key={`hfe${i}`} err={err} />)}
              {hiddenDiagnostics.map((d, i) => <DiagnosticRow key={`hd${i}`} diagnostic={d} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FileErrorRow({ err }: { err: FileError }) {
  return (
    <div className="severity-error-item">
      <span className="severity-error-file">{err.file.split('/').pop()}</span>
      <pre className="severity-error-msg">{err.stderr || err.error}</pre>
    </div>
  )
}

function DiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  const glyph = diagnostic.severity === 'error' ? '\u2717' : '\u26A0'
  const fileName = diagnostic.file ? diagnostic.file.split('/').pop() : undefined
  const loc = fileName ? `${fileName}:${diagnostic.start.line}:${diagnostic.start.column}` : undefined
  return (
    <div className={`diagnostic-item severity-${diagnostic.severity}`}>
      <span className="diagnostic-glyph" aria-hidden="true">{glyph}</span>
      <span className="diagnostic-code">{diagnostic.code}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      {loc && <span className="diagnostic-location">{loc}</span>}
    </div>
  )
}
