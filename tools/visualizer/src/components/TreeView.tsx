import React from 'react'
import type { TWFFile, Definition, FileError, Diagnostic, Statement, AsyncTarget } from '../types/ast'
import type { CallerRef, NavigationContextType, CrossViewTarget } from './WorkflowCanvas'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { filterStatesEqual } from '../filter/types'
import { NavigationContext } from './WorkflowCanvas'
import { DefinitionBlock } from './blocks/DefinitionBlock'
import { PinToggle } from './PinToggle'
import { SearchIcon } from './icons/GearIcons'
import { DEF_TYPE_ORDER, VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'

interface TreeViewProps {
  ast: TWFFile
  onShowInGraph?: (name: string, defType: string) => void
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  pendingFocus: CrossViewTarget | null
  onFocusConsumed: () => void
  overriddenPins: Set<FilterDimension>
  onOverriddenPinsConsumed: () => void
}

export function TreeView({
  ast,
  onShowInGraph,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  searchQuery,
  searchActive,
  onSearchChange,
  pendingFocus,
  onFocusConsumed,
  overriddenPins,
  onOverriddenPinsConsumed,
}: TreeViewProps) {
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const treeItemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Track per-definition expand state for keyboard toggle (keyed by def identity)
  const [expandedDefs, setExpandedDefs] = React.useState<Set<string>>(new Set())
  const [flashKey, setFlashKey] = React.useState<string | null>(null)

  // Transition indicator: flash header when AST updates
  const [refreshFlash, setRefreshFlash] = React.useState(false)
  const prevAstRef = React.useRef(ast)
  React.useEffect(() => {
    if (prevAstRef.current !== ast && prevAstRef.current !== null) {
      setRefreshFlash(true)
      const timer = setTimeout(() => setRefreshFlash(false), 600)
      return () => clearTimeout(timer)
    }
    prevAstRef.current = ast
  }, [ast])

  // Track which filter chips/toggles were changed by an external filter
  // update (i.e., a focus transition's reconciler expansion). These
  // briefly animate (~400ms) to make the change visible. We diff the new
  // filter against the previous one to find the changed keys.
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

  // Pin-override flash: clear the overridden-pins set after ~600ms so
  // the visual flash plays once per focus transition.
  React.useEffect(() => {
    if (overriddenPins.size === 0) return
    const timer = setTimeout(onOverriddenPinsConsumed, 600)
    return () => clearTimeout(timer)
  }, [overriddenPins, onOverriddenPinsConsumed])

  // Build reverse reference index for contextual navigation
  const navIndex = React.useMemo(() => {
    const callers = new Map<string, CallerRef[]>()
    const workerOf = new Map<string, string[]>()
    const namespaceOf = new Map<string, string[]>()

    function addCaller(key: string, caller: CallerRef) {
      const list = callers.get(key) || []
      if (!list.some(c => c.defName === caller.defName && c.defType === caller.defType)) {
        list.push(caller)
        callers.set(key, list)
      }
    }

    function addTo(map: Map<string, string[]>, key: string, value: string) {
      const list = map.get(key) || []
      if (!list.includes(value)) {
        list.push(value)
        map.set(key, list)
      }
    }

    function walkTarget(target: AsyncTarget, callerDef: Definition) {
      if (target.activity) addCaller(`activityDef:${target.activity.name}`, { defName: callerDef.name, defType: callerDef.type })
      if (target.workflow) addCaller(`workflowDef:${target.workflow.name}`, { defName: callerDef.name, defType: callerDef.type })
      if (target.nexus) addCaller(`nexusServiceDef:${target.nexus.service}`, { defName: callerDef.name, defType: callerDef.type })
    }

    function walkStmts(stmts: Statement[], callerDef: Definition) {
      for (const stmt of stmts) {
        switch (stmt.type) {
          case 'activityCall':
            addCaller(`activityDef:${stmt.name}`, { defName: callerDef.name, defType: callerDef.type })
            break
          case 'workflowCall':
            addCaller(`workflowDef:${stmt.name}`, { defName: callerDef.name, defType: callerDef.type })
            break
          case 'nexusCall':
            addCaller(`nexusServiceDef:${stmt.service}`, { defName: callerDef.name, defType: callerDef.type })
            break
          case 'await':
            walkTarget(stmt.target, callerDef)
            break
          case 'promise':
            walkTarget(stmt.target, callerDef)
            break
          case 'awaitAll':
            walkStmts(stmt.body || [], callerDef)
            break
          case 'awaitOne':
            for (const c of stmt.cases || []) {
              if (c.target) walkTarget(c.target, callerDef)
              if (c.awaitAll) walkStmts(c.awaitAll.body || [], callerDef)
              walkStmts(c.body || [], callerDef)
            }
            break
          case 'if':
            walkStmts(stmt.body || [], callerDef)
            walkStmts(stmt.elseBody || [], callerDef)
            break
          case 'for':
            walkStmts(stmt.body || [], callerDef)
            break
          case 'switch':
            for (const c of stmt.cases || []) walkStmts(c.body || [], callerDef)
            if (stmt.default) walkStmts(stmt.default, callerDef)
            break
        }
      }
    }

    for (const def of ast.definitions) {
      if (def.type === 'workflowDef') {
        walkStmts(def.body || [], def)
        for (const s of def.signals || []) walkStmts(s.body || [], def)
        for (const q of def.queries || []) walkStmts(q.body || [], def)
        for (const u of def.updates || []) walkStmts(u.body || [], def)
      } else if (def.type === 'activityDef') {
        walkStmts(def.body || [], def)
      } else if (def.type === 'nexusServiceDef') {
        for (const op of def.operations || []) {
          if (op.opType === 'async' && op.workflowName) {
            addCaller(`workflowDef:${op.workflowName}`, { defName: def.name, defType: def.type })
          }
          if (op.body) walkStmts(op.body, def)
        }
      }

      // Containment: workerOf
      if (def.type === 'workerDef') {
        for (const ref of def.workflows || []) addTo(workerOf, `workflowDef:${ref.name}`, def.name)
        for (const ref of def.activities || []) addTo(workerOf, `activityDef:${ref.name}`, def.name)
        for (const ref of def.services || []) addTo(workerOf, `nexusServiceDef:${ref.name}`, def.name)
      }

      // Containment: namespaceOf
      if (def.type === 'namespaceDef') {
        for (const w of def.workers || []) addTo(namespaceOf, `workerDef:${w.workerName}`, def.name)
      }
    }

    return { callers, workerOf, namespaceOf }
  }, [ast])

  // Extract all unique source files from definitions
  const allFiles = React.useMemo(() => {
    const files = new Set<string>()
    for (const def of ast.definitions) {
      if (def.sourceFile) {
        files.add(def.sourceFile)
      }
    }
    return Array.from(files).sort()
  }, [ast])

  // Toggle a file in the selection
  const toggleFile = React.useCallback((file: string) => {
    const next = new Set(filter.selectedFiles)
    if (next.has(file)) next.delete(file)
    else next.add(file)
    onFilterChange({ ...filter, selectedFiles: next })
  }, [filter, onFilterChange])

  // Toggle search bar
  const toggleSearch = React.useCallback(() => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [searchActive, searchQuery, onSearchChange])

  // Toggle a group of definition types in visibility. For single-type chips
  // types has one element; for the Nexus group chip it has three. If any
  // member of the group is on, the whole group turns off; if all are off,
  // the whole group turns on — matching the Graph view's group toggle logic.
  const toggleTypeGroup = React.useCallback((types: readonly string[]) => {
    const anyOn = types.some(t => filter.visibleTypes.has(t))
    const next = new Set(filter.visibleTypes)
    if (anyOn) {
      for (const t of types) next.delete(t)
    } else {
      for (const t of types) next.add(t)
    }
    onFilterChange({ ...filter, visibleTypes: next })
  }, [filter, onFilterChange])

  const togglePinFiles = React.useCallback(() => {
    onPinsChange({ ...pins, files: !pins.files })
  }, [pins, onPinsChange])
  const togglePinTypes = React.useCallback(() => {
    onPinsChange({ ...pins, types: !pins.types })
  }, [pins, onPinsChange])

  // Filter and group definitions for display. Search is NO LONGER a
  // structural filter — non-matching definitions remain rendered but
  // are visually dimmed (spec § Search Scope: non-destructive search).
  const visibleDefinitions = React.useMemo(() => {
    const filtered = ast.definitions.filter((def): def is Definition => {
      if (!filter.visibleTypes.has(def.type)) return false
      if (filter.selectedFiles.size > 0 && def.sourceFile) {
        if (!filter.selectedFiles.has(def.sourceFile)) return false
      }
      return true
    })

    filtered.sort((a, b) => {
      const orderA = DEF_TYPE_ORDER.get(a.type) ?? 999
      const orderB = DEF_TYPE_ORDER.get(b.type) ?? 999
      return orderA - orderB
    })

    return filtered
  }, [ast.definitions, filter])

  // Search matches against the *visible* definition set. Matches outside
  // the visible set (hidden by file/type filters) are surfaced as
  // hidden-match badges on the corresponding filter controls below.
  const { matchSet, matchIndices, hiddenMatchByType, hiddenMatchByFile } = React.useMemo(() => {
    if (!searchQuery) {
      return {
        matchSet: null as Set<string> | null,
        matchIndices: [] as number[],
        hiddenMatchByType: new Map<string, number>(),
        hiddenMatchByFile: new Map<string, number>(),
      }
    }
    const lq = searchQuery.toLowerCase()
    const set = new Set<string>()
    const indices: number[] = []
    visibleDefinitions.forEach((def, i) => {
      if (def.name.toLowerCase().includes(lq)) {
        set.add(defKey(def))
        indices.push(i)
      }
    })
    // Tally matches HIDDEN by structural filters, for badge overlays.
    const byType = new Map<string, number>()
    const byFile = new Map<string, number>()
    for (const def of ast.definitions) {
      if (!def.name.toLowerCase().includes(lq)) continue
      const inType = filter.visibleTypes.has(def.type)
      const inFile = filter.selectedFiles.size === 0 || (def.sourceFile ? filter.selectedFiles.has(def.sourceFile) : true)
      if (!inType) byType.set(def.type, (byType.get(def.type) ?? 0) + 1)
      else if (!inFile && def.sourceFile) byFile.set(def.sourceFile, (byFile.get(def.sourceFile) ?? 0) + 1)
    }
    return { matchSet: set, matchIndices: indices, hiddenMatchByType: byType, hiddenMatchByFile: byFile }
  }, [searchQuery, visibleDefinitions, ast.definitions, filter])

  // Partition errors into "shown files" vs "hidden files" based on file filter
  const errors = ast.errors || []
  const diagnostics = ast.diagnostics || []
  const {
    shownFileErrors,
    hiddenFileErrors,
    shownDiagnostics,
    hiddenDiagnostics,
  } = React.useMemo(() => {
    if (filter.selectedFiles.size === 0) {
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
      if (filter.selectedFiles.has(e.file)) sFE.push(e)
      else hFE.push(e)
    }
    const sD: Diagnostic[] = []
    const hD: Diagnostic[] = []
    for (const d of diagnostics) {
      // Diagnostics without a `file` (rare — the parser should always
      // stamp one) are surfaced in the shown group so they aren't
      // accidentally hidden by file-filter narrowing.
      if (!d.file || filter.selectedFiles.has(d.file)) sD.push(d)
      else hD.push(d)
    }
    return {
      shownFileErrors: sFE,
      hiddenFileErrors: hFE,
      shownDiagnostics: sD,
      hiddenDiagnostics: hD,
    }
  }, [errors, diagnostics, filter.selectedFiles])

  const hasFiles = allFiles.length > 0
  // Render the errors header whenever there's anything to surface:
  // a parser-process FileError or a structured Diagnostic of any
  // severity. The header itself partitions counts by severity.
  const hasHeaderContent = errors.length > 0 || diagnostics.length > 0
  const noFilesSelected = filter.selectedFiles.size === 0

  // Global keyboard shortcut: "/" or Ctrl+F opens search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault()
        if (!searchActive) {
          onSearchChange(searchQuery, true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        } else {
          searchInputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchActive, searchQuery, onSearchChange])

  // Keep refs array sized to visible definitions
  React.useEffect(() => {
    treeItemRefs.current = treeItemRefs.current.slice(0, visibleDefinitions.length)
  }, [visibleDefinitions.length])

  // Helper: get a stable, unique key for a definition.
  //
  // sourceFile is included so that two definitions with the same (type, name)
  // originating in different files render as independent React nodes with
  // independent expand/focus state.
  function defKey(def: Definition) {
    return `${def.type}:${def.name}:${def.sourceFile ?? ''}`
  }

  // Expand state cleanup: remove entries for definitions that no longer exist
  React.useEffect(() => {
    const validKeys = new Set(ast.definitions.map(defKey))
    setExpandedDefs(prev => {
      const pruned = new Set([...prev].filter(k => validKeys.has(k)))
      return pruned.size === prev.size ? prev : pruned
    })
  }, [ast.definitions])

  // Toggle expand state for a definition (used by keyboard Enter/Right/Left)
  const toggleDefExpand = React.useCallback((key: string) => {
    setExpandedDefs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Navigate to a definition by name+type: expand, scroll, flash
  const navigateTo = React.useCallback((name: string, defType: string) => {
    const index = visibleDefinitions.findIndex(d => d.name === name && d.type === defType)
    if (index === -1) return

    const key = defKey(visibleDefinitions[index])
    setExpandedDefs(prev => new Set(prev).add(key))
    setFocusedIndex(index)

    setTimeout(() => {
      treeItemRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      treeItemRefs.current[index]?.focus()
    }, 50)

    setFlashKey(key)
    setTimeout(() => setFlashKey(null), 1000)
  }, [visibleDefinitions])

  const navigationValue = React.useMemo<NavigationContextType>(() => ({
    ...navIndex,
    navigateTo,
    showInGraph: onShowInGraph,
  }), [navIndex, navigateTo, onShowInGraph])

  // Handle cross-view focus: the reconciler has already expanded the
  // destination filter (in WorkflowCanvas) so the target is guaranteed
  // visible. We only need to scroll to it and flash.
  React.useEffect(() => {
    if (!pendingFocus) return
    const { name, defType } = pendingFocus
    // Defer to let visibleDefinitions reflect any filter change that
    // arrived in the same tick.
    const timer = setTimeout(() => {
      navigateTo(name, defType)
      onFocusConsumed()
    }, 50)
    return () => clearTimeout(timer)
  }, [pendingFocus, navigateTo, onFocusConsumed])

  // Tree keyboard navigation handler
  const handleTreeKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const count = visibleDefinitions.length
    if (count === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = focusedIndex < count - 1 ? focusedIndex + 1 : focusedIndex
        setFocusedIndex(next)
        treeItemRefs.current[next]?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = focusedIndex > 0 ? focusedIndex - 1 : 0
        setFocusedIndex(prev)
        treeItemRefs.current[prev]?.focus()
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < count) {
          const key = defKey(visibleDefinitions[focusedIndex])
          if (!expandedDefs.has(key)) {
            setExpandedDefs(prev => new Set(prev).add(key))
          }
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < count) {
          const key = defKey(visibleDefinitions[focusedIndex])
          if (expandedDefs.has(key)) {
            setExpandedDefs(prev => {
              const next = new Set(prev)
              next.delete(key)
              return next
            })
          }
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < count) {
          toggleDefExpand(defKey(visibleDefinitions[focusedIndex]))
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        setFocusedIndex(0)
        treeItemRefs.current[0]?.focus()
        break
      }
      case 'End': {
        e.preventDefault()
        const last = count - 1
        setFocusedIndex(last)
        treeItemRefs.current[last]?.focus()
        break
      }
      case 'n':
      case 'N': {
        if (matchIndices.length === 0) break
        e.preventDefault()
        const forward = e.key === 'n'
        const next = nextMatchIndex(matchIndices, focusedIndex, forward)
        setFocusedIndex(next)
        treeItemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        treeItemRefs.current[next]?.focus()
        break
      }
      case 'Escape': {
        e.preventDefault()
        if (searchActive) {
          toggleSearch()
        }
        break
      }
    }
  }, [visibleDefinitions, focusedIndex, expandedDefs, searchActive, toggleSearch, toggleDefExpand, matchIndices])

  // Compute current-match position for the "N of M" indicator (only
  // meaningful when the user has navigated via n/N to land on a match).
  const currentMatchPosition = React.useMemo(() => {
    if (!matchSet || matchIndices.length === 0 || focusedIndex < 0) return null
    const def = visibleDefinitions[focusedIndex]
    if (!def || !matchSet.has(defKey(def))) return null
    const pos = matchIndices.indexOf(focusedIndex)
    return pos >= 0 ? pos + 1 : null
  }, [matchSet, matchIndices, focusedIndex, visibleDefinitions])

  return (
    <NavigationContext.Provider value={navigationValue}>
      <div className="workflow-canvas">
        {/* === Filter Header === */}
        <div className={`canvas-header${refreshFlash ? ' refresh-flash' : ''}`}>
          {/* Files Section — only show if there are files */}
          {hasFiles && (
            <>
              <div className={`header-files-section${pins.files ? ' section-pinned' : ''}`}>
                <div className="header-files-row">
                  {allFiles.map(file => {
                    const fileName = file.split('/').pop() || file
                    const isSelected = filter.selectedFiles.has(file)
                    const isChanged = recentlyChanged.has(`file:${file}`)
                    const hiddenCount = hiddenMatchByFile.get(file) ?? 0
                    const chipClass = [
                      'header-file-tag',
                      noFilesSelected ? 'all-included' : (isSelected ? 'selected' : ''),
                      isChanged ? 'recently-changed' : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <button
                        key={file}
                        className={chipClass}
                        onClick={() => toggleFile(file)}
                        title={file}
                      >
                        <span className="header-file-icon">📄</span>
                        <span className="header-file-name">{fileName}</span>
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

          {/* Definition Type Toggles */}
          <div className={`header-types-section${pins.types ? ' section-pinned' : ''}`}>
            <div className="header-types-row">
              {VIEW_FILTER_ENTRIES.map(entry => {
                const isActive = entry.types.some(t => filter.visibleTypes.has(t))
                const isChanged = entry.types.some(t => recentlyChanged.has(`type:${t}`))
                const hiddenCount = entry.types.reduce((sum, t) => sum + (hiddenMatchByType.get(t) ?? 0), 0)
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

          {/* Controls Section — search */}
          <div className="header-controls-section">
            <div className={`header-search ${searchActive ? 'active' : ''}`}>
              <button
                className="header-search-toggle"
                onClick={toggleSearch}
                title="Search definitions"
              >
                <SearchIcon size={14} />
              </button>
              {searchActive && (
                <input
                  ref={searchInputRef}
                  className="header-search-input"
                  type="text"
                  placeholder="Filter by name..."
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value, true)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') toggleSearch()
                  }}
                />
              )}
              {searchActive && searchQuery && matchIndices.length > 0 && (
                <span className="header-search-counter" title="Press n/N to jump between matches">
                  {currentMatchPosition !== null
                    ? `${currentMatchPosition} of ${matchIndices.length}`
                    : `${matchIndices.length} match${matchIndices.length !== 1 ? 'es' : ''}`}
                </span>
              )}
              {searchActive && searchQuery && matchIndices.length === 0 && (
                <span className="header-search-counter empty">no matches</span>
              )}
            </div>
          </div>
        </div>

        {/* === Content — padded; scrolls independently of the sticky header === */}
        <div className="workflow-canvas-content">
          {hasHeaderContent && (
            <ErrorsHeader
              shownFileErrors={shownFileErrors}
              hiddenFileErrors={hiddenFileErrors}
              shownDiagnostics={shownDiagnostics}
              hiddenDiagnostics={hiddenDiagnostics}
            />
          )}

          {visibleDefinitions.length === 0 && !hasHeaderContent ? (
            <div className="no-workflows">
              <p>No definitions match the current filters.</p>
              <p className="no-workflows-hint">Try adjusting the type toggles or file filter above.</p>
            </div>
          ) : visibleDefinitions.length === 0 && hasHeaderContent ? (
            null /* Only diagnostics, no content — errors header is shown above */
          ) : (
            <div role="tree" aria-label="Definition list" onKeyDown={handleTreeKeyDown}>
              {visibleDefinitions.map((def, i) => {
                const key = defKey(def)
                const isExpanded = expandedDefs.has(key)
                const isDimmed = matchSet !== null && !matchSet.has(key)
                const wrapClass = [
                  flashKey === key ? 'flash-target' : '',
                  isDimmed ? 'search-dimmed' : '',
                ].filter(Boolean).join(' ')
                return (
                  <div
                    key={key}
                    role="treeitem"
                    aria-expanded={isExpanded}
                    aria-level={1}
                    tabIndex={i === focusedIndex ? 0 : -1}
                    ref={el => { treeItemRefs.current[i] = el }}
                    onFocus={() => setFocusedIndex(i)}
                    className={wrapClass || undefined}
                  >
                    <DefinitionBlock definition={def} expanded={isExpanded} onToggle={() => toggleDefExpand(key)} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </NavigationContext.Provider>
  )
}

// Find the next match index in `matchIndices` after `currentIndex`,
// wrapping. If `forward` is false, find the previous one.
function nextMatchIndex(matchIndices: number[], currentIndex: number, forward: boolean): number {
  if (matchIndices.length === 0) return currentIndex
  if (forward) {
    for (const i of matchIndices) {
      if (i > currentIndex) return i
    }
    return matchIndices[0]
  } else {
    for (let j = matchIndices.length - 1; j >= 0; j--) {
      if (matchIndices[j] < currentIndex) return matchIndices[j]
    }
    return matchIndices[matchIndices.length - 1]
  }
}

/**
 * Collapsible errors header — surfaces two distinct kinds of finding:
 *
 *   1. FileError (parser-process failure): missing binary, IO error,
 *      malformed JSON envelope. Always rendered as a parse-error row.
 *   2. Diagnostic (validator/resolver/parse finding from `twf parse`'s
 *      JSON envelope): carries severity, code, file, position, message.
 *
 * Each kind is partitioned by the file-filter into "shown" and "hidden"
 * groups so users see exactly which findings the current filter is
 * hiding from them. The header bar shows the rolled-up counts as
 * "N errors, M warnings", switching to a warning palette when there
 * are no errors and the only findings are warnings.
 */
function ErrorsHeader({
  shownFileErrors, hiddenFileErrors,
  shownDiagnostics, hiddenDiagnostics,
}: {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
  shownDiagnostics: Diagnostic[]
  hiddenDiagnostics: Diagnostic[]
}) {
  const [expanded, setExpanded] = React.useState(true)

  // Severity roll-up: process-level FileErrors count as errors; structured
  // diagnostics contribute to either count based on their severity field.
  const { errorCount, warningCount, headerSeverity } = React.useMemo(() => {
    const allDiags = [...shownDiagnostics, ...hiddenDiagnostics]
    const diagErrors = allDiags.filter(d => d.severity === 'error').length
    const diagWarnings = allDiags.filter(d => d.severity === 'warning').length
    const errCount = shownFileErrors.length + hiddenFileErrors.length + diagErrors
    const warnCount = diagWarnings
    const severity: 'error' | 'warning' = errCount > 0 ? 'error' : 'warning'
    return { errorCount: errCount, warningCount: warnCount, headerSeverity: severity }
  }, [shownFileErrors, hiddenFileErrors, shownDiagnostics, hiddenDiagnostics])

  const countParts: string[] = []
  if (errorCount > 0) countParts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`)
  if (warningCount > 0) countParts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`)
  const countText = countParts.join(', ')

  // Append the shown/hidden breakdown when the file filter is splitting
  // findings into both groups — gives the user a hint that filtered-out
  // files have their own issues without forcing a chip toggle.
  const shownTotal = shownFileErrors.length + shownDiagnostics.length
  const hiddenTotal = hiddenFileErrors.length + hiddenDiagnostics.length
  const splitParts: string[] = []
  if (shownTotal > 0 && hiddenTotal > 0) {
    splitParts.push(`${shownTotal} in shown files`)
    splitParts.push(`${hiddenTotal} in hidden files`)
  }
  const splitSuffix = splitParts.length > 0 ? ` (${splitParts.join(', ')})` : ''

  // Top-bar glyph mirrors the most severe entry: ✗ when any errors are
  // present, ⚠ otherwise. Distinct from per-row glyphs so the bar
  // communicates "worst-case" at a glance.
  const headerIcon = headerSeverity === 'error' ? '✗' : '⚠'

  return (
    <div className={`errors-header${headerSeverity === 'warning' ? ' severity-warnings-only' : ''}`}>
      <div className="errors-header-bar" onClick={() => setExpanded(!expanded)}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="errors-header-icon">{headerIcon}</span>
        <span className="errors-header-title">
          {countText}{splitSuffix}
        </span>
      </div>

      {expanded && (
        <div className="errors-header-body">
          {(shownFileErrors.length > 0 || shownDiagnostics.length > 0) && (
            <ErrorGroup
              label="Shown files"
              fileErrors={shownFileErrors}
              diagnostics={shownDiagnostics}
              variant="shown"
            />
          )}
          {(hiddenFileErrors.length > 0 || hiddenDiagnostics.length > 0) && (
            <ErrorGroup
              label="Hidden files"
              fileErrors={hiddenFileErrors}
              diagnostics={hiddenDiagnostics}
              variant="hidden"
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A group of findings under a sub-label. FileErrors render first
 * (parse-process failures are the most impactful); then errors-severity
 * diagnostics; then warnings. The grouping order ensures the user reads
 * "what's broken" before "what might be off".
 */
function ErrorGroup({ label, fileErrors, diagnostics, variant }: {
  label: string
  fileErrors: FileError[]
  diagnostics: Diagnostic[]
  variant: 'shown' | 'hidden'
}) {
  const errorDiagnostics = diagnostics.filter(d => d.severity === 'error')
  const warningDiagnostics = diagnostics.filter(d => d.severity === 'warning')
  const total = fileErrors.length + diagnostics.length

  return (
    <div className={`error-group error-group-${variant}`}>
      <div className="error-group-label">
        {label} ({total})
      </div>
      {fileErrors.map((err, i) => (
        <div key={`fe-${i}`} className="error-group-item">
          <div className="error-group-file">{err.file.split('/').pop()}</div>
          <pre className="error-group-message">{err.stderr || err.error}</pre>
        </div>
      ))}
      {errorDiagnostics.map((d, i) => (
        <DiagnosticRow key={`de-${i}`} diagnostic={d} />
      ))}
      {warningDiagnostics.map((d, i) => (
        <DiagnosticRow key={`dw-${i}`} diagnostic={d} />
      ))}
    </div>
  )
}

/** Single-line diagnostic row: glyph + code chip + message, with a
 * secondary muted file:line:col line beneath the message column. */
function DiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  const glyph = diagnostic.severity === 'error' ? '✗' : '⚠'
  const fileName = diagnostic.file ? diagnostic.file.split('/').pop() : undefined
  const loc = fileName
    ? `${fileName}:${diagnostic.start.line}:${diagnostic.start.column}`
    : undefined
  return (
    <div className={`diagnostic-item severity-${diagnostic.severity}`}>
      <span className="diagnostic-glyph" aria-hidden="true">{glyph}</span>
      <span className="diagnostic-code">{diagnostic.code}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      {loc && <span className="diagnostic-location">{loc}</span>}
    </div>
  )
}
