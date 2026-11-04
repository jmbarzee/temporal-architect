import {
  useTaxonomy,
  hiddenMatchesOf,
  passesSelection,
  selectionFor,
  FilterBar,
} from '@temporal-architect/graph-view'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import type { AxisValues, FocusTarget, LinkedViewProps, Theme } from '@temporal-architect/graph-view'
import React from 'react'
import './TreeView.css'
import type { TWFFile, Definition } from '../types/ast'
import { qualifiedNameOf } from '../types/ast'
import type { NavigationContextType } from './WorkflowCanvas'
import { buildNavIndex } from './navIndex'
import { NavigationContext } from './WorkflowCanvas'
import { DefinitionBlock } from './blocks/DefinitionBlock'
import { FLASH_MS, NO_REVEAL, measureFilterBar, replayFlash, revealReducer, scrollRowIntoView } from './reveal'
import { ErrorBars } from './ErrorBars'
import { definitionCounts, sourceFilesOf } from '../adapter/useGraphModel'
import { DEF_TYPE_ORDER } from '../theme/temporal-theme'

/** A definition's values on the axes it carries: its type, and its file when it has one. */
function valuesOf(def: Definition): AxisValues {
  return def.sourceFile === undefined
    ? { [DEF_TYPE_DIMENSION]: def.type }
    : { [DEF_TYPE_DIMENSION]: def.type, [SOURCE_FILE_DIMENSION]: def.sourceFile }
}

/**
 * Where a focus into the tree lands: the library's target, plus the name this
 * view finds a definition by — its qualified name (`qualifiedNameOf`), which is
 * also its graph node's `name`. Bare when the definition is unpackaged.
 * `child` names a row nested in it (a nexus operation or endpoint) to reveal
 * instead of the definition itself.
 */
export type TreeFocus = FocusTarget & { name: string; child?: string }

// The filter, locks, axes (and the locks a focus overrode) and the shared
// search are the shell's `linked.of('tree')`: the bar takes them as they come.
interface TreeViewProps extends LinkedViewProps {
  // Whether this view is the active tab. Both views stay mounted (keep-alive),
  // so the inactive one must not respond to global keyboard shortcuts.
  active: boolean
  ast: TWFFile
  onShowInGraph?: (qualifiedName: string, defType: string) => void
  /** What the bar's `system` theme resolves to: the host's own theme. */
  systemTheme: Theme
  pendingFocus: TreeFocus | null
  onFocusConsumed: () => void
}

export function TreeView({
  active,
  ast,
  onShowInGraph,
  systemTheme,
  pendingFocus,
  onFocusConsumed,
  ...linked
}: TreeViewProps) {
  const { filter, axes, search, onSearchChange: onSearchState } = linked
  const { query: searchQuery, active: searchActive } = search
  const onSearchChange = React.useCallback(
    (query: string, active: boolean) => onSearchState({ query, active }),
    [onSearchState],
  )
  const taxonomy = useTaxonomy()
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const treeItemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  // Track per-definition expand state for keyboard toggle (keyed by def identity)
  const [expandedDefs, setExpandedDefs] = React.useState<Set<string>>(new Set())
  // The revealed definition, and the nested row it names when that row is the
  // target, lit for FLASH_MS from its latest reveal.
  const [reveal, dispatchReveal] = React.useReducer(revealReducer, NO_REVEAL)
  const canvasRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const lit = reveal.lit
    if (!lit) return
    // A repeat reveal of a definition replays its flash; a nested row replays its own.
    if (lit.repeat && !lit.child) {
      const row = canvasRef.current?.querySelector('[role="treeitem"].flash-target')
      if (row) replayFlash(row)
    }
    const timer = setTimeout(() => dispatchReveal({ type: 'end', nonce: lit.nonce }), FLASH_MS)
    return () => clearTimeout(timer)
  }, [reveal.lit])

  // The sticky FilterBar covers the top of the scroller, and its height pads
  // every scroll into view (TreeView.css). It is measured as the view is
  // shown, and again whenever the bar changes size (its rows wrap, a search
  // or findings open).
  React.useLayoutEffect(() => {
    if (active && canvasRef.current) measureFilterBar(canvasRef.current)
  }, [active])
  React.useEffect(() => {
    const canvas = canvasRef.current
    const bar = canvas?.querySelector(':scope > .gv-canvas-header')
    if (!canvas || !bar || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureFilterBar(canvas))
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  // Transition indicator: flash header when AST updates. A counter the bar
  // flashes on once per change and puts out itself — a flag the host switched
  // back off would cancel the bar's own timer and leave the flash lit.
  const [refreshFlash, setRefreshFlash] = React.useState(0)
  const prevAstRef = React.useRef(ast)
  React.useEffect(() => {
    if (prevAstRef.current !== ast && prevAstRef.current !== null) setRefreshFlash(n => n + 1)
    prevAstRef.current = ast
  }, [ast])


  // Reverse reference index for contextual navigation
  const navIndex = React.useMemo(() => buildNavIndex(ast.definitions), [ast])

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

  // What each filter axis can take, read off the definitions — the one source
  // the bar builds every axis's chips from. Omitting the kind axis here once
  // left it un-re-addable in this view while the graph view still offered it.
  const valuesByDimension = React.useMemo(() => {
    const kinds = new Set<string>()
    for (const def of ast.definitions) kinds.add(def.type)
    return new Map<string, readonly string[]>([
      [SOURCE_FILE_DIMENSION, allFiles],
      [DEF_TYPE_DIMENSION, [...kinds]],
    ])
  }, [ast, allFiles])

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
    // Same policy as the graph, via passesSelection; only the projection is
    // local, because a definition has named fields where a graph node has a
    // `values` map. This used to be a second hand-written implementation of
    // both axes' empty/absent semantics, so a descriptor change moved the graph
    // and left the tree behind.
    // Only the axes this view shows filter, as in the graph view.
    const filtered = ast.definitions.filter((def): def is Definition =>
      passesSelection({ filter, taxonomy, axes, node: { values: valuesOf(def) } }))

    filtered.sort((a, b) => {
      const orderA = DEF_TYPE_ORDER.get(a.type) ?? 999
      const orderB = DEF_TYPE_ORDER.get(b.type) ?? 999
      return orderA - orderB
    })

    return filtered
  }, [ast.definitions, filter, axes, taxonomy])

  // Search matches against the *visible* definition set. Matches outside
  // the visible set (hidden by file/type filters) are surfaced as
  // hidden-match badges on the corresponding filter controls below.
  const { matchSet, matchIndices, hiddenMatches } = React.useMemo(() => {
    if (!searchQuery) {
      return {
        matchSet: null as Set<string> | null,
        matchIndices: [] as number[],
        hiddenMatches: new Map<string, ReadonlyMap<string, number>>(),
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
    // Matches HIDDEN by the structural filters, counted on the chip hiding
    // each — the library's split, so the tree badges the chip the graph would.
    const split = hiddenMatchesOf({
      nodes: ast.definitions.map(def => ({ id: defKey(def), def })),
      filter, taxonomy, axes,
      visibleIds: new Set(visibleDefinitions.map(defKey)),
      matches: n => n.def.name.toLowerCase().includes(lq),
      valueOn: (n, dim) => dim === DEF_TYPE_DIMENSION ? n.def.type : dim === SOURCE_FILE_DIMENSION ? n.def.sourceFile : undefined,
    })
    return { matchSet: set, matchIndices: indices, hiddenMatches: split.hiddenByAxis }
  }, [searchQuery, visibleDefinitions, ast.definitions, filter, taxonomy, axes])

  // The findings and the chip counts, read off the AST for the shared bar.
  const errors = ast.errors || []
  const diagnostics = ast.diagnostics || []
  const counts = React.useMemo(() => definitionCounts(ast, selectionFor(filter, SOURCE_FILE_DIMENSION)), [ast, filter])
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

  // Focus the row at `index` and scroll it into view below the filter bar.
  const focusRow = React.useCallback((index: number, behavior: ScrollBehavior = 'auto') => {
    const row = treeItemRefs.current[index]
    if (!row) return
    row.focus({ preventScroll: true })
    scrollRowIntoView(row, behavior)
  }, [])

  // Reveal the visible definition at `index`: expand, scroll, flash. With a
  // `child`, the nested row of that name scrolls and flashes itself instead.
  const revealAt = React.useCallback((index: number, child?: string) => {
    if (index === -1) return

    const key = defKey(visibleDefinitions[index])
    setExpandedDefs(prev => new Set(prev).add(key))
    setFocusedIndex(index)
    dispatchReveal({ type: 'reveal', key, child })

    setTimeout(() => {
      if (child) treeItemRefs.current[index]?.focus({ preventScroll: true })
      else focusRow(index, 'smooth')
    }, 50)
  }, [visibleDefinitions, focusRow])

  // Navigate to a definition by bare name+type — the names statements and
  // the reverse reference index carry.
  const navigateTo = React.useCallback((name: string, defType: string) => {
    revealAt(visibleDefinitions.findIndex(d => d.name === name && d.type === defType))
  }, [visibleDefinitions, revealAt])

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
    // This view locks a qualified name with the kind axis it knows.
    const { name, child } = pendingFocus
    const defType = pendingFocus.values[DEF_TYPE_DIMENSION] ?? ''
    // Defer to let visibleDefinitions reflect any filter change that
    // arrived in the same tick.
    const timer = setTimeout(() => {
      revealAt(visibleDefinitions.findIndex(d => qualifiedNameOf(d) === name && d.type === defType), child)
      onFocusConsumed()
    }, 50)
    return () => clearTimeout(timer)
  }, [pendingFocus, visibleDefinitions, revealAt, onFocusConsumed])

  // Tree keyboard navigation handler
  const handleTreeKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const count = visibleDefinitions.length
    if (count === 0) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = focusedIndex < count - 1 ? focusedIndex + 1 : focusedIndex
        setFocusedIndex(next)
        focusRow(next)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = focusedIndex > 0 ? focusedIndex - 1 : 0
        setFocusedIndex(prev)
        focusRow(prev)
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
        focusRow(0)
        break
      }
      case 'End': {
        e.preventDefault()
        const last = count - 1
        setFocusedIndex(last)
        focusRow(last)
        break
      }
      case 'n':
      case 'N': {
        if (matchIndices.length === 0) break
        e.preventDefault()
        const forward = e.key === 'n'
        const next = nextMatchIndex(matchIndices, focusedIndex, forward)
        setFocusedIndex(next)
        focusRow(next, 'smooth')
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
  }, [visibleDefinitions, focusedIndex, expandedDefs, searchActive, toggleSearch, toggleDefExpand, matchIndices, focusRow])

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
      <div className="workflow-canvas" ref={canvasRef}>
        <FilterBar
          {...linked}
          systemTheme={systemTheme}
          counts={counts}
          values={valuesByDimension}
          searchInputRef={searchInputRef}
          searchTitle="Search definitions"
          searchPlaceholder="Filter by name..."
          searchExtra={searchExtra}
          hiddenMatches={hiddenMatches}
          findings={<ErrorBars errors={errors} diagnostics={diagnostics} selectedFiles={selectionFor(filter, SOURCE_FILE_DIMENSION)} sourceFiles={sourceFilesOf(ast)} />}
          refreshFlash={refreshFlash}
        />

        {/* === Content — padded; scrolls independently of the sticky header === */}
        <div className="workflow-canvas-content">
          {visibleDefinitions.length === 0 && !hasHeaderContent ? (
            <div className="no-workflows">
              <p>No definitions match the current filters.</p>
              <p className="no-workflows-hint">Try adjusting the chips above.</p>
            </div>
          ) : visibleDefinitions.length === 0 && hasHeaderContent ? (
            null /* Only diagnostics, no content — errors header is shown above */
          ) : (
            <div role="tree" aria-label="Definition list" onKeyDown={handleTreeKeyDown}>
              {visibleDefinitions.map((def, i) => {
                const key = defKey(def)
                const isExpanded = expandedDefs.has(key)
                const isDimmed = matchSet !== null && !matchSet.has(key)
                const revealed = reveal.lit?.key === key ? reveal.lit : undefined
                const wrapClass = [
                  revealed && !revealed.child ? 'flash-target' : '',
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
                    <DefinitionBlock definition={def} expanded={isExpanded} onToggle={() => toggleDefExpand(key)} reveal={revealed} />
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
