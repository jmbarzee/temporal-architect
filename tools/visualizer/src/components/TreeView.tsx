import React from 'react'
import type { TWFFile, Definition, Statement, AsyncTarget } from '../types/ast'
import type { CallerRef, NavigationContextType, CrossViewTarget } from './WorkflowCanvas'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { filterStatesEqual } from '../filter/types'
import { NavigationContext } from './WorkflowCanvas'
import { DefinitionBlock } from './blocks/DefinitionBlock'
import { FilterBar } from './FilterBar'
import { DEF_TYPE_ORDER } from '../theme/temporal-theme'

interface TreeViewProps {
  // Whether this view is the active tab. Both views stay mounted (keep-alive),
  // so the inactive one must not respond to global keyboard shortcuts.
  active: boolean
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
  active,
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

  // Toggle search bar
  const toggleSearch = React.useCallback(() => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [searchActive, searchQuery, onSearchChange])

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

  // Raw findings handed straight to the shared FilterBar, which partitions
  // them by the file filter and renders the error/warning bars.
  const errors = ast.errors || []
  const diagnostics = ast.diagnostics || []
  // Whether there's anything to surface — used only to decide the empty state.
  const hasHeaderContent = errors.length > 0 || diagnostics.length > 0

  // Global keyboard shortcut: "/" or Ctrl+F opens search. Gated on `active`
  // so the hidden (inactive) view doesn't also respond.
  React.useEffect(() => {
    if (!active) return
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
  }, [active, searchActive, searchQuery, onSearchChange])

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

  // Tree-view search adornment: the "N of M" / "no matches" counter.
  const searchExtra = searchActive && searchQuery ? (
    matchIndices.length > 0 ? (
      <span className="header-search-counter" title="Press n/N to jump between matches">
        {currentMatchPosition !== null
          ? `${currentMatchPosition} of ${matchIndices.length}`
          : `${matchIndices.length} match${matchIndices.length !== 1 ? 'es' : ''}`}
      </span>
    ) : (
      <span className="header-search-counter empty">no matches</span>
    )
  ) : null

  return (
    <NavigationContext.Provider value={navigationValue}>
      <div className="workflow-canvas">
        <FilterBar
          ast={ast}
          allFiles={allFiles}
          filter={filter}
          onFilterChange={onFilterChange}
          pins={pins}
          onPinsChange={onPinsChange}
          overriddenPins={overriddenPins}
          recentlyChanged={recentlyChanged}
          searchQuery={searchQuery}
          searchActive={searchActive}
          onSearchChange={onSearchChange}
          searchInputRef={searchInputRef}
          searchTitle="Search definitions"
          searchPlaceholder="Filter by name..."
          searchExtra={searchExtra}
          hiddenMatchByType={hiddenMatchByType}
          hiddenMatchByFile={hiddenMatchByFile}
          errors={errors}
          diagnostics={diagnostics}
          refreshFlash={refreshFlash}
        />

        {/* === Content — padded; scrolls independently of the sticky header === */}
        <div className="workflow-canvas-content">
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
