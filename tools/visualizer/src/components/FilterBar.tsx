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

import { useOntology } from './graph-view/useOntology'
import { selectionFor } from '../filter/types'
import React from 'react'
import './FilterBar.css'
import type { TWFFile, FileError, Diagnostic } from '../types/ast'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { pinnedFor, withPin, withSelection } from '../filter/types'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { toggleGroup } from '../filter/toggle'
import { PinToggle } from './PinToggle'
import { SearchIcon } from './icons/GearIcons'

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
  /** The axes shown, in order. R17/R18/R19: editable, and may be empty. */
  chain: readonly string[]
  /** Omitted by a host that does not want the chain edited in place. */
  onChainChange?: (next: readonly string[]) => void
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
  chain,
  onChainChange,
}: FilterBarProps) {
  const ontology = useOntology()
  const selectedFiles = selectionFor(filter, SOURCE_FILE_DIMENSION)

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

  // **The only place this bar names an axis.** Everything below loops over the
  // chain and reads the rest from descriptors. What is left here is presentation
  // and data-sourcing: which values exist, their counts, and the CSS classes the
  // current stylesheet keys on. Unit 6 owns the class names (B30's hand-written
  // chip tints) and Unit 7 replaces the value sourcing with the post-filter
  // visible set, so this table is where both land.
  const PRESENTATION = React.useMemo(() => new Map<string, {
    values: string[]
    counts: Map<string, number>
    hidden?: Map<string, number>
    sectionClass: string
    rowClass: string
    chipClass: string
    activeClass: string
    iconClass: string
    labelClass: string
  }>([
    [SOURCE_FILE_DIMENSION, {
      values: allFiles,
      counts: fileCounts,
      hidden: hiddenMatchByFile,
      sectionClass: 'header-files-section',
      rowClass: 'header-files-row',
      chipClass: 'header-file-tag',
      activeClass: 'selected',
      iconClass: 'header-file-icon',
      labelClass: 'header-file-name',
    }],
    [DEF_TYPE_DIMENSION, {
      values: [...new Set(ontology.nodeTypeKeys.map(k => ontology.styleForKey(k).defType))],
      counts: typeCounts,
      hidden: hiddenMatchByType,
      sectionClass: 'header-types-section',
      rowClass: 'header-types-row',
      chipClass: 'header-type-tag',
      activeClass: 'active',
      iconClass: 'header-type-icon',
      labelClass: 'header-type-label',
    }],
  ]), [allFiles, fileCounts, typeCounts, hiddenMatchByFile, hiddenMatchByType, ontology])

  // Axes the host declares that the chain is not already showing.
  const available = ontology.filterDimensions
    .map(d => d.id)
    .filter(id => !chain.includes(id) && (PRESENTATION.get(id)?.values.length ?? 0) > 0)

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
      {chain.map(dimension => {
        const descriptor = ontology.descriptorFor(dimension)
        const look = PRESENTATION.get(dimension)
        if (!descriptor || !look) return null
        const chips = descriptor.chipsFor(look.values)
        if (chips.length === 0) return null

        const selection = selectionFor(filter, dimension)
        const pinned = pinnedFor(pins, dimension)
        // An `emptyMeans: 'all'` axis with nothing selected is not "off" — it is
        // matching everything, and the chips say so rather than reading as a
        // filter that hides the lot.
        const allIncluded = selection.size === 0 && descriptor.emptyMeans === 'all'

        return (
          <React.Fragment key={dimension}>
            <div className={`${look.sectionClass}${pinned ? ' section-pinned' : ''}`}>
              <div className={look.rowClass}>
                {chips.map(chip => {
                  const isActive = chip.values.some(v => selection.has(v))
                  const isChanged = chip.values.some(v => recentlyChanged.has(`${dimension}:${v}`))
                  const hiddenCount = chip.values.reduce((sum, v) => sum + (look.hidden?.get(v) ?? 0), 0)
                  const count = chip.values.reduce((sum, v) => sum + (look.counts.get(v) ?? 0), 0)
                  const cls = [
                    look.chipClass,
                    allIncluded ? 'all-included' : (isActive ? look.activeClass : ''),
                    `${look.chipClass}-${chip.id}`,
                    isChanged ? 'recently-changed' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button
                      key={chip.id}
                      className={cls}
                      onClick={() => onFilterChange(toggleGroup(filter, dimension, chip.values))}
                      title={isActive ? `Hide ${chip.label.toLowerCase()}` : `Show ${chip.label.toLowerCase()}`}
                    >
                      {chip.icon && <span className={look.iconClass}>{chip.icon}</span>}
                      <span className={look.labelClass}>{chip.label}</span>
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
                pinned={pinned}
                onClick={() => onPinsChange(withPin(pins, dimension, !pinned))}
                flashing={overriddenPins.has(dimension)}
                label={descriptor.label}
              />
              {onChainChange && (
                <button
                  className="header-chain-remove"
                  onClick={() => {
                    // Removing an axis also stops it filtering. Keeping the
                    // selection would leave the view filtered by something with
                    // no on-screen representation and no way to reach it —
                    // invisible state that reads as a bug.
                    //
                    // "Stops filtering" is NOT "empty", and that difference is
                    // this axis's `emptyMeans` again. On the file axis an empty
                    // selection matches everything; on the kind axis it matches
                    // NOTHING, so clearing it would blank the view instead of
                    // unfiltering it. Match-everything is therefore empty for
                    // one and the full value set for the other.
                    onFilterChange(withSelection(
                      filter,
                      dimension,
                      descriptor.emptyMeans === 'all'
                        ? new Set<string>()
                        : new Set(chips.flatMap(c => [...c.values])),
                    ))
                    onChainChange(chain.filter(d => d !== dimension))
                  }}
                  title={`Remove the ${descriptor.label} filter`}
                >×</button>
              )}
            </div>
            <div className="header-divider" />
          </React.Fragment>
        )
      })}

      {onChainChange && available.length > 0 && (
        <div className="header-chain-add">
          <button
            className="header-chain-add-button"
            onClick={() => onChainChange([...chain, available[0]!])}
            title={`Add the ${ontology.descriptorFor(available[0]!)?.label ?? available[0]} filter`}
          >+</button>
        </div>
      )}

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
function ErrorBars({ errors, diagnostics, selectedFiles }: {
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
