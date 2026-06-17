// Shared filter bar for both the Tree and Graph views.
//
// Owns the markup that used to be duplicated in TreeView and GraphView: the
// file chips, the definition-type chips, the search control, and — at the
// bottom — the error/warning bars. Defining it once is what keeps the two
// views' toolbars in lockstep (spec § Unified Filter Bar / § Error Handling).
//
// View-specific extras (the Tree's "N of M" search counter, the Graph's
// hidden-match "+N" badge) are passed in as `searchExtra`; everything else
// is identical across views.

import React from 'react'
import type { TWFFile, FileError, Diagnostic } from '../types/ast'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { PinToggle } from './PinToggle'
import { SearchIcon } from './icons/GearIcons'
import { VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'

interface FilterBarProps {
  /** AST — used to count top-level definitions for the chip badges. */
  ast: TWFFile
  /** Unique source files driving the file chips (each view computes its own). */
  allFiles: string[]
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  /** Dimensions a recent focus transition bypassed — drives the pin flash. */
  overriddenPins: Set<FilterDimension>
  /** File/type keys that just turned on — drives the chip flash animation. */
  recentlyChanged: Set<string>
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  searchInputRef: React.RefObject<HTMLInputElement>
  searchTitle: string
  searchPlaceholder: string
  /** View-specific search adornment rendered inside the search control. */
  searchExtra?: React.ReactNode
  /** Per-chip hidden-match badges (Tree view search). Optional. */
  hiddenMatchByType?: Map<string, number>
  hiddenMatchByFile?: Map<string, number>
  /** Raw findings — partitioned by the file filter inside ErrorBars. */
  errors: FileError[]
  diagnostics: Diagnostic[]
  /** Tree view flashes the whole header on AST refresh. */
  refreshFlash?: boolean
}

export function FilterBar({
  ast,
  allFiles,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  overriddenPins,
  recentlyChanged,
  searchQuery,
  searchActive,
  onSearchChange,
  searchInputRef,
  searchTitle,
  searchPlaceholder,
  searchExtra,
  hiddenMatchByType,
  hiddenMatchByFile,
  errors,
  diagnostics,
  refreshFlash,
}: FilterBarProps) {
  const selectedFiles = filter.selectedFiles
  const visibleTypes = filter.visibleTypes
  const noFilesSelected = selectedFiles.size === 0
  const hasFiles = allFiles.length > 0

  // Top-level definition counts for the chips. Type counts respect the file
  // filter (defs from selected files only, or all when none selected); file
  // counts are the per-file definition totals.
  const { typeCounts, fileCounts } = React.useMemo(() => {
    const typeCounts = new Map<string, number>()
    const fileCounts = new Map<string, number>()
    for (const def of ast.definitions) {
      if (def.sourceFile) {
        fileCounts.set(def.sourceFile, (fileCounts.get(def.sourceFile) ?? 0) + 1)
      }
      // A def with no sourceFile can't be filtered out by a file selection.
      const passesFile = selectedFiles.size === 0 || !def.sourceFile || selectedFiles.has(def.sourceFile)
      if (passesFile) {
        typeCounts.set(def.type, (typeCounts.get(def.type) ?? 0) + 1)
      }
    }
    return { typeCounts, fileCounts }
  }, [ast.definitions, selectedFiles])

  const toggleFile = (file: string) => {
    const next = new Set(selectedFiles)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    onFilterChange({ ...filter, selectedFiles: next })
  }

  const toggleTypeGroup = (types: readonly string[]) => {
    const anyOn = types.some(t => visibleTypes.has(t))
    const next = new Set(visibleTypes)
    if (anyOn) for (const t of types) next.delete(t)
    else for (const t of types) next.add(t)
    onFilterChange({ ...filter, visibleTypes: next })
  }

  const togglePinFiles = () => onPinsChange({ ...pins, files: !pins.files })
  const togglePinTypes = () => onPinsChange({ ...pins, types: !pins.types })

  const toggleSearch = () => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  return (
    <div className={`canvas-header${refreshFlash ? ' refresh-flash' : ''}`}>
      {hasFiles && (
        <>
          <div className={`header-files-section${pins.files ? ' section-pinned' : ''}`}>
            <div className="header-files-row">
              {allFiles.map(file => {
                const fileName = file.split('/').pop() || file
                const isSelected = selectedFiles.has(file)
                const isChanged = recentlyChanged.has(`file:${file}`)
                const hiddenCount = hiddenMatchByFile?.get(file) ?? 0
                const count = fileCounts.get(file) ?? 0
                const chipClass = [
                  'header-file-tag',
                  noFilesSelected ? 'all-included' : (isSelected ? 'selected' : ''),
                  isChanged ? 'recently-changed' : '',
                ].filter(Boolean).join(' ')
                return (
                  <button key={file} className={chipClass} onClick={() => toggleFile(file)} title={file}>
                    <span className="header-file-icon">📄</span>
                    <span className="header-file-name">{fileName}</span>
                    <span className="header-chip-count">{count}</span>
                    {hiddenCount > 0 && (
                      <span className="header-hidden-badge" title={`${hiddenCount} match${hiddenCount !== 1 ? 'es' : ''} hidden in this file`}>
                        {hiddenCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <PinToggle
              pinned={pins.files}
              onClick={togglePinFiles}
              flashing={overriddenPins.has('files')}
              label="Files"
            />
          </div>
          <div className="header-divider" />
        </>
      )}

      <div className={`header-types-section${pins.types ? ' section-pinned' : ''}`}>
        <div className="header-types-row">
          {VIEW_FILTER_ENTRIES.map(entry => {
            const isActive = entry.types.some(t => visibleTypes.has(t))
            const isChanged = entry.types.some(t => recentlyChanged.has(`type:${t}`))
            const hiddenCount = entry.types.reduce((sum, t) => sum + (hiddenMatchByType?.get(t) ?? 0), 0)
            const count = entry.types.reduce((sum, t) => sum + (typeCounts.get(t) ?? 0), 0)
            const cls = [
              'header-type-tag',
              isActive ? 'active' : '',
              `header-type-${entry.id}`,
              isChanged ? 'recently-changed' : '',
            ].filter(Boolean).join(' ')
            return (
              <button
                key={entry.id}
                className={cls}
                onClick={() => toggleTypeGroup(entry.types)}
                title={isActive ? `Hide ${entry.label.toLowerCase()}` : `Show ${entry.label.toLowerCase()}`}
              >
                <span className="header-type-icon">{entry.icon}</span>
                <span className="header-type-label">{entry.label}</span>
                <span className="header-chip-count">{count}</span>
                {hiddenCount > 0 && (
                  <span className="header-hidden-badge" title={`${hiddenCount} match${hiddenCount !== 1 ? 'es' : ''} hidden by this filter`}>
                    {hiddenCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <PinToggle
          pinned={pins.types}
          onClick={togglePinTypes}
          flashing={overriddenPins.has('types')}
          label="Types"
        />
      </div>

      <div className="header-divider" />

      <div className="header-controls-section">
        <div className={`header-search ${searchActive ? 'active' : ''}`}>
          <button className="header-search-toggle" onClick={toggleSearch} title={searchTitle}>
            <SearchIcon size={14} />
          </button>
          {searchActive && (
            <input
              ref={searchInputRef}
              className="header-search-input"
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value, true)}
              onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
            />
          )}
          {searchExtra}
        </div>
      </div>

      <ErrorBars errors={errors} diagnostics={diagnostics} selectedFiles={selectedFiles} />
    </div>
  )
}

// --- Error / warning bars -------------------------------------------------

interface Partitioned {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}

// Split findings into "shown files" vs "hidden files" by the file filter.
// File-less diagnostics surface in the shown group so a missing path can't
// accidentally hide them.
function partitionByFile(errors: FileError[], diagnostics: Diagnostic[], selectedFiles: Set<string>): Partitioned {
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
function ErrorBars({ errors, diagnostics, selectedFiles }: {
  errors: FileError[]
  diagnostics: Diagnostic[]
  selectedFiles: Set<string>
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
