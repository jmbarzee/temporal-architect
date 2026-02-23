import React from 'react'
import type { TWFFile, Definition, FileError, Statement, AsyncTarget } from '../types/ast'
import type { CallerRef, NavigationContextType } from './WorkflowCanvas'
import { NavigationContext } from './WorkflowCanvas'
import { DefinitionBlock } from './blocks/DefinitionBlock'
import { SearchIcon } from './icons/GearIcons'
import { THEME, DEF_TYPE_CONFIGS, DEF_TYPE_ORDER } from '../theme/temporal-theme'

interface TreeViewProps {
  ast: TWFFile
  onOpenFile?: (file: string) => void
}

const DEFAULT_VISIBLE_TYPES = new Set(
  DEF_TYPE_CONFIGS.filter(c => c.defaultOn).map(c => c.type)
)

export function TreeView({ ast, onOpenFile }: TreeViewProps) {
  // --- Header state ---
  const [selectedFiles, setSelectedFiles] = React.useState<Set<string>>(new Set())
  const [searchActive, setSearchActive] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [visibleTypes, setVisibleTypes] = React.useState<Set<string>>(DEFAULT_VISIBLE_TYPES)
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

  // Initialize selected files: focused file selected by default
  React.useEffect(() => {
    if (ast.focusedFile) {
      setSelectedFiles(new Set([ast.focusedFile]))
    } else {
      setSelectedFiles(new Set())
    }
  }, [ast.focusedFile])

  // Stale file cleanup: remove selected files that no longer exist in the AST
  React.useEffect(() => {
    const fileSet = new Set(allFiles)
    setSelectedFiles(prev => {
      const pruned = new Set([...prev].filter(f => fileSet.has(f)))
      return pruned.size === prev.size ? prev : pruned
    })
  }, [allFiles])

  // Toggle a file in the selection
  const toggleFile = (file: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }
      return next
    })
  }

  // When file filter narrows to exactly one file, open it in the editor
  React.useEffect(() => {
    if (selectedFiles.size === 1 && onOpenFile) {
      onOpenFile(selectedFiles.values().next().value!)
    }
  }, [selectedFiles, onOpenFile])

  // Toggle search bar
  const toggleSearch = () => {
    if (searchActive) {
      setSearchActive(false)
      setSearchQuery('')
    } else {
      setSearchActive(true)
      // Focus the input after it renders
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  // Toggle a definition type in visibility
  const toggleType = (type: string) => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Filter and group definitions for display
  const visibleDefinitions = React.useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase()

    const filtered = ast.definitions.filter((def): def is Definition => {
      // Type filter
      if (!visibleTypes.has(def.type)) return false

      // File filter: if any files are selected, only show from those files
      // If none selected (all toggled off), show all
      if (selectedFiles.size > 0 && def.sourceFile) {
        if (!selectedFiles.has(def.sourceFile)) return false
      }

      // Search filter
      if (lowerQuery) {
        if (!def.name.toLowerCase().includes(lowerQuery)) return false
      }

      return true
    })

    // Group by type in scope order (namespace → worker → nexus → workflow → activity)
    filtered.sort((a, b) => {
      const orderA = DEF_TYPE_ORDER.get(a.type) ?? 999
      const orderB = DEF_TYPE_ORDER.get(b.type) ?? 999
      return orderA - orderB
    })

    return filtered
  }, [ast.definitions, selectedFiles, visibleTypes, searchQuery])

  // Partition errors into "shown files" vs "hidden files" based on file filter
  const errors = ast.errors || []
  const { shownFileErrors, hiddenFileErrors } = React.useMemo(() => {
    if (selectedFiles.size === 0) {
      // No file filter active — all errors are "shown"
      return { shownFileErrors: errors, hiddenFileErrors: [] as FileError[] }
    }
    const shown: FileError[] = []
    const hidden: FileError[] = []
    for (const e of errors) {
      if (selectedFiles.has(e.file)) {
        shown.push(e)
      } else {
        hidden.push(e)
      }
    }
    return { shownFileErrors: shown, hiddenFileErrors: hidden }
  }, [errors, selectedFiles])

  const hasFiles = allFiles.length > 0
  const hasErrors = errors.length > 0
  const noFilesSelected = selectedFiles.size === 0

  // Global keyboard shortcut: "/" or Ctrl+F opens search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is already typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '/' || (e.ctrlKey && e.key === 'f')) {
        e.preventDefault()
        if (!searchActive) {
          setSearchActive(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
        } else {
          searchInputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchActive])

  // Keep refs array sized to visible definitions
  React.useEffect(() => {
    treeItemRefs.current = treeItemRefs.current.slice(0, visibleDefinitions.length)
  }, [visibleDefinitions.length])

  // Helper: get stable key for a definition (by type+name, not file — survives file moves)
  const defKey = (def: Definition) => `${def.type}:${def.name}`

  // Expand state cleanup: remove entries for definitions that no longer exist
  React.useEffect(() => {
    const validKeys = new Set(ast.definitions.map(d => `${d.type}:${d.name}`))
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
  }), [navIndex, navigateTo])

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
      case 'Escape': {
        e.preventDefault()
        if (searchActive) {
          toggleSearch()
        }
        break
      }
    }
  }, [visibleDefinitions, focusedIndex, expandedDefs, searchActive, toggleSearch, toggleDefExpand])

  return (
    <NavigationContext.Provider value={navigationValue}>
      <div className="workflow-canvas">
        {/* === Filter Header === */}
        <div className={`canvas-header${refreshFlash ? ' refresh-flash' : ''}`}>
          {/* Files Section — only show if there are files */}
          {hasFiles && (
            <>
              <div className="header-files-section">
                <div className="header-files-row">
                  {allFiles.map(file => {
                    const fileName = file.split('/').pop() || file
                    const isSelected = selectedFiles.has(file)
                    const chipClass = noFilesSelected
                      ? 'header-file-tag all-included'
                      : `header-file-tag ${isSelected ? 'selected' : ''}`
                    return (
                      <button
                        key={file}
                        className={chipClass}
                        onClick={() => toggleFile(file)}
                        title={file}
                      >
                        <span className="header-file-icon">📄</span>
                        <span className="header-file-name">{fileName}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="header-divider" />
            </>
          )}

          {/* Definition Type Toggles */}
          <div className="header-types-section">
            <div className="header-types-row">
              {DEF_TYPE_CONFIGS.map(cfg => {
                const isActive = visibleTypes.has(cfg.type)
                return (
                  <button
                    key={cfg.type}
                    className={`header-type-tag ${isActive ? 'active' : ''} header-type-${cfg.type}`}
                    onClick={() => toggleType(cfg.type)}
                    title={isActive ? `Hide ${cfg.label.toLowerCase()}` : `Show ${cfg.label.toLowerCase()}`}
                  >
                    <span className="header-type-icon">{cfg.icon}</span>
                    <span className="header-type-label">{cfg.label}</span>
                  </button>
                )
              })}
            </div>
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
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') toggleSearch()
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* === Errors Header === */}
        {hasErrors && (
          <ErrorsHeader
            shownFileErrors={shownFileErrors}
            hiddenFileErrors={hiddenFileErrors}
          />
        )}

        {/* Definitions */}
        {visibleDefinitions.length === 0 && !hasErrors ? (
          <div className="no-workflows">
            <p>No definitions match the current filters.</p>
            <p className="no-workflows-hint">Try adjusting the type toggles or file filter above.</p>
          </div>
        ) : visibleDefinitions.length === 0 && hasErrors ? (
          null /* Only errors, no content — errors header is shown above */
        ) : (
          <div role="tree" aria-label="Definition list" onKeyDown={handleTreeKeyDown}>
            {visibleDefinitions.map((def, i) => {
              const key = defKey(def)
              const isExpanded = expandedDefs.has(key)
              return (
                <div
                  key={key}
                  role="treeitem"
                  aria-expanded={isExpanded}
                  aria-level={1}
                  tabIndex={i === focusedIndex ? 0 : -1}
                  ref={el => { treeItemRefs.current[i] = el }}
                  onFocus={() => setFocusedIndex(i)}
                  className={flashKey === key ? 'flash-target' : undefined}
                >
                  <DefinitionBlock definition={def} expanded={isExpanded} onToggle={() => toggleDefExpand(key)} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </NavigationContext.Provider>
  )
}

/** Collapsible errors header — shows compilation errors grouped by shown/hidden files */
function ErrorsHeader({ shownFileErrors, hiddenFileErrors }: {
  shownFileErrors: FileError[]
  hiddenFileErrors: FileError[]
}) {
  const [expanded, setExpanded] = React.useState(true)
  const totalErrors = shownFileErrors.length + hiddenFileErrors.length

  // Build summary text
  const summaryParts: string[] = []
  if (shownFileErrors.length > 0) {
    summaryParts.push(`${shownFileErrors.length} in shown files`)
  }
  if (hiddenFileErrors.length > 0) {
    summaryParts.push(`${hiddenFileErrors.length} in hidden files`)
  }
  const summary = summaryParts.length > 1
    ? ` (${summaryParts.join(', ')})`
    : ''

  return (
    <div className="errors-header">
      <div className="errors-header-bar" onClick={() => setExpanded(!expanded)}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="errors-header-icon">{THEME.error.icon}</span>
        <span className="errors-header-title">
          {totalErrors} {totalErrors === 1 ? 'error' : 'errors'}{summary}
        </span>
      </div>

      {expanded && (
        <div className="errors-header-body">
          {shownFileErrors.length > 0 && (
            <ErrorGroup
              label="Shown files"
              errors={shownFileErrors}
              variant="shown"
            />
          )}
          {hiddenFileErrors.length > 0 && (
            <ErrorGroup
              label="Hidden files"
              errors={hiddenFileErrors}
              variant="hidden"
            />
          )}
        </div>
      )}
    </div>
  )
}

/** A group of errors under a sub-label */
function ErrorGroup({ label, errors, variant }: {
  label: string
  errors: FileError[]
  variant: 'shown' | 'hidden'
}) {
  return (
    <div className={`error-group error-group-${variant}`}>
      <div className="error-group-label">
        {label} ({errors.length})
      </div>
      {errors.map((err, i) => (
        <div key={i} className="error-group-item">
          <div className="error-group-file">{err.file.split('/').pop()}</div>
          <pre className="error-group-message">{err.stderr || err.error}</pre>
        </div>
      ))}
    </div>
  )
}
