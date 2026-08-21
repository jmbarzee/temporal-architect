// Groups modal for the Graph view's decomposition overlay.
// Implements GRAPH_VIEW.md § Decomposition Group Overlay: a collapsible
// floating panel (collapsed by default) with two tabs — a tree browser of
// chunk -> division options -> sections, and a read-only parameter readout.
// It mirrors GraphControlPanel's collapse/tab structure and reuses its CSS.

import React from 'react'
import './GroupsModal.css'
import type { Decomposition, Chunk, Division, Section } from '../types/decomposition'
import type { DecompositionParams } from './protocol'
import {
  defaultStrategyForChunk,
  initializedSelection,
  type GroupSelection,
  type GroupHover,
  type ActiveGroup,
} from '../graph/groups'

type GroupsTab = 'groups' | 'params'

// Decomposition strategies the `by` multi-select offers, mirroring the Go
// `decompose` strategy names a host translates into `twf graph chunks --by`.
const STRATEGY_OPTIONS = ['tree', 'nexus', 'worker', 'namespace', 'service', 'subtree'] as const

interface GroupsModalProps {
  decomposition?: Decomposition
  selection: GroupSelection
  onSelectionChange: (next: GroupSelection) => void
  hover: GroupHover | null
  onHover: (h: GroupHover | null) => void
  // The currently-glowing groups, used to color the section swatches so the
  // modal reads as the legend for what's on the canvas.
  activeGroups: ActiveGroup[]
  // Outbound recompute request. When wired, the Params tab becomes an editable
  // control set that builds a `DecompositionParams` and calls this; the panel
  // also renders (to host the controls) even before any decomposition exists, so
  // the first request can be made. When absent, the Params tab is a read-only
  // readout and the panel returns null with no decomposition — today's behaviour.
  onRequestDecomposition?: (params: DecompositionParams) => void
}

// Last path segment of a section id (e.g. ".../service:workflow:AgenticTask"
// -> "service:workflow:AgenticTask") for a compact, readable row label.
function shortSectionId(id: string): string {
  const i = id.lastIndexOf('/')
  return i >= 0 ? id.slice(i + 1) : id
}

export function GroupsModal({
  decomposition,
  selection,
  onSelectionChange,
  hover,
  onHover,
  activeGroups,
  onRequestDecomposition,
}: GroupsModalProps) {
  const colorById = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const g of activeGroups) m.set(g.id, g.color)
    return m
  }, [activeGroups])

  // The whole partition, heaviest first — over-ceiling chunks (which carry
  // division options) naturally sort to the top, the many single-group
  // under-ceiling chunks below. Showing them all is what makes the overlay
  // answer "what are all the chunks", not just "which ones can be split".
  const sortedChunks = React.useMemo(
    () => [...(decomposition?.chunks ?? [])].sort((a, b) => b.complexity - a.complexity),
    [decomposition],
  )

  // Capability vs. data: chunks to overlay, and whether a host can service a
  // recompute request. The panel renders when either holds; it stays absent
  // (today's behaviour) only when there is neither a decomposition nor an action.
  const hasChunks = !!decomposition && sortedChunks.length > 0
  const canRecompute = !!onRequestDecomposition

  const [open, setOpen] = React.useState(false)
  // Default to the Params tab when there's nothing to browse yet but a recompute
  // can be requested — that's where the first request is made.
  const [tab, setTab] = React.useState<GroupsTab>(hasChunks ? 'groups' : 'params')

  if (!hasChunks && !canRecompute) return null

  // First engagement bootstraps the overlay (glow on, every chunk enabled); see
  // initializedSelection. Opening the panel and flipping the master switch on are
  // both "engage" actions. No-op when there's no decomposition to engage with
  // (the bootstrap-only panel).
  const engage = () => {
    if (!decomposition) return
    onSelectionChange(initializedSelection(selection, decomposition))
  }

  const handleToggleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && !selection.initialized) engage()
  }

  const handleGlowToggle = (checked: boolean) => {
    if (checked && !selection.initialized) engage()
    else onSelectionChange({ ...selection, glowEnabled: checked })
  }

  const toggleEnabled = (chunkId: string) => {
    const enabledChunks = new Set(selection.enabledChunks)
    if (enabledChunks.has(chunkId)) enabledChunks.delete(chunkId)
    else enabledChunks.add(chunkId)
    onSelectionChange({ ...selection, enabledChunks })
  }

  const setActiveStrategy = (chunkId: string, strategy: string) => {
    onSelectionChange({
      ...selection,
      activeStrategyByChunk: { ...selection.activeStrategyByChunk, [chunkId]: strategy },
    })
  }

  const toggleExpand = (sectionId: string) => {
    const expandedSections = new Set(selection.expandedSections)
    if (expandedSections.has(sectionId)) expandedSections.delete(sectionId)
    else expandedSections.add(sectionId)
    onSelectionChange({ ...selection, expandedSections })
  }

  // Show/hide the selected division's section list in the modal tree. Pure
  // browsing — it does not change what glows on the canvas.
  const toggleChunkCollapsed = (chunkId: string) => {
    const collapsedChunks = new Set(selection.collapsedChunks)
    if (collapsedChunks.has(chunkId)) collapsedChunks.delete(chunkId)
    else collapsedChunks.add(chunkId)
    onSelectionChange({ ...selection, collapsedChunks })
  }

  const activeDivisionOf = (chunk: Chunk): Division => {
    const strategy = selection.activeStrategyByChunk[chunk.id] ?? defaultStrategyForChunk(chunk)
    return chunk.divisions!.find(d => d.strategy === strategy) ?? chunk.divisions![0]
  }

  return (
    <div className={`groups-modal graph-control-panel ${open ? 'open' : ''}`}>
      {/* Header: collapse toggle + the master glow switch. The switch is always
          shown (collapsed or open) so the overlay can be turned on/off without
          expanding the panel. */}
      <div className="groups-modal-header">
        <button
          className="graph-control-panel-toggle"
          onClick={handleToggleOpen}
          title="Toggle decomposition groups panel"
        >
          {open ? '\u25BC Groups' : '\u25B6 Groups'}
        </button>
        {/* The master glow switch only makes sense with a decomposition to glow;
            in the bootstrap-only panel (action wired, no chunks yet) it is
            omitted so no dead control is offered. */}
        {hasChunks && (
          <label
            className={`switch${selection.glowEnabled ? ' on' : ''}`}
            title="Show group glow on the canvas"
          >
            <input
              type="checkbox"
              checked={selection.glowEnabled}
              onChange={e => handleGlowToggle(e.target.checked)}
              aria-label="Show group glow"
            />
            <span className="switch-track"><span className="switch-knob" /></span>
          </label>
        )}
      </div>

      {open && (
        <div className="graph-control-panel-body">
          <div className="graph-control-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'groups'}
              className={`graph-control-tab${tab === 'groups' ? ' active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Groups
            </button>
            <button
              role="tab"
              aria-selected={tab === 'params'}
              className={`graph-control-tab${tab === 'params' ? ' active' : ''}`}
              onClick={() => setTab('params')}
            >
              Params
            </button>
          </div>

          {tab === 'groups' && !hasChunks && (
            <div className="groups-tree groups-tree-empty">
              No decomposition yet. Set parameters on the Params tab and Recompute.
            </div>
          )}

          {tab === 'groups' && hasChunks && (
            <div className="groups-tree" onMouseLeave={() => onHover(null)}>
              {sortedChunks.map(chunk => {
                const divisions = chunk.divisions ?? []
                const enabled = selection.enabledChunks.has(chunk.id)
                const activeDivision = divisions.length > 0 ? activeDivisionOf(chunk) : undefined
                return (
                  <div key={chunk.id} className="groups-chunk">
                    {/* Hovering the chunk head previews its glow even when it's
                        toggled off — discoverability for the many single-group
                        (under-ceiling) chunks. */}
                    <label
                      className="groups-chunk-head"
                      title={chunk.id}
                      onMouseEnter={() => onHover({ chunkId: chunk.id })}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleEnabled(chunk.id)}
                      />
                      <span className="groups-chunk-name">{shortSectionId(chunk.id)}</span>
                      <span className="groups-chunk-meta">{chunk.members.length}n · c{chunk.complexity}</span>
                    </label>

                    {/* Over-ceiling chunks carry division options; under-ceiling
                        chunks are a single group (the head is the whole control).
                        Options and the sections they produce share one tree: each
                        option is a radio row, and the selected option expands to
                        reveal its sections. Hover any option to preview it. */}
                    {divisions.length > 0 && (
                    <div className="groups-divisions">
                      {divisions.map(div => {
                        const selected = activeDivision?.strategy === div.strategy
                        const hasSections = div.sections.length > 0
                        const showSections = selected && hasSections && !selection.collapsedChunks.has(chunk.id)
                        return (
                          <div
                            key={div.strategy}
                            className={`groups-division${selected ? ' selected' : ''}`}
                          >
                            <div className="groups-option-row">
                              {/* Only the selected option owns sections, so only
                                  it carries a disclosure caret — show/hide its
                                  sections (VIEW_FRAMEWORK.md § Expand/Collapse
                                  Affordance). Collapsing is browsing only; it
                                  doesn't change the glow. Other rows get a spacer
                                  so every radio stays aligned. */}
                              {selected && hasSections ? (
                                <button
                                  className="groups-expand"
                                  onClick={() => toggleChunkCollapsed(chunk.id)}
                                  title={showSections ? 'Hide sections' : 'Show sections'}
                                >
                                  {showSections ? '\u25BC' : '\u25B6'}
                                </button>
                              ) : (
                                <span className="groups-expand-spacer" />
                              )}
                              <label
                                className="groups-option"
                                title={div.rationale}
                                onMouseEnter={() => onHover({ chunkId: chunk.id, strategy: div.strategy })}
                                onMouseLeave={() => onHover(null)}
                              >
                                <input
                                  type="radio"
                                  name={`groups-div-${chunk.id}`}
                                  checked={selected}
                                  onChange={() => setActiveStrategy(chunk.id, div.strategy)}
                                />
                                <span className="groups-option-rank">#{div.rank}</span>
                                <span className="groups-option-strategy">{div.strategy}</span>
                              </label>
                            </div>

                            {showSections && (
                              <SectionRows
                                chunkId={chunk.id}
                                sections={div.sections}
                                depth={1}
                                selection={selection}
                                onToggleExpand={toggleExpand}
                                hover={hover}
                                onHover={onHover}
                                colorById={colorById}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Editable when a host can service a recompute; the read-only readout
              otherwise (today's behaviour). The editor is keyed on the echoed
              params so a fresh decomposition re-seeds the controls. */}
          {tab === 'params' && (
            canRecompute ? (
              <ParamsEditor
                key={paramsSeedKey(decomposition)}
                decomposition={decomposition}
                onRequestDecomposition={onRequestDecomposition!}
              />
            ) : (
              <div className="groups-params">
                <p className="groups-params-note">Parameters used to compute these groups.</p>
                {/* maxDepth / strategies were added to the wire contract after
                    ceiling / floor; guard against a host bundling an older twf
                    whose JSON omits them so the readout degrades instead of
                    crashing on `undefined.join`. Only reached with a
                    decomposition present (canRecompute false + hasChunks true). */}
                <ParamRow label="ceiling" value={String(decomposition!.ceiling)} />
                <ParamRow label="floor" value={String(decomposition!.floor)} />
                <ParamRow label="max depth" value={decomposition!.maxDepth != null ? String(decomposition!.maxDepth) : '\u2014'} />
                <ParamRow label="strategies" value={(decomposition!.strategies ?? []).join(', ')} />
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

interface SectionRowsProps {
  chunkId: string
  sections: Section[]
  depth: number
  selection: GroupSelection
  onToggleExpand: (sectionId: string) => void
  hover: GroupHover | null
  onHover: (h: GroupHover | null) => void
  colorById: Map<string, string>
}

function SectionRows({
  chunkId, sections, depth, selection, onToggleExpand, hover, onHover, colorById,
}: SectionRowsProps) {
  return (
    <>
      {sections.map(section => {
        const nested = section.divisions?.[0]
        const expanded = selection.expandedSections.has(section.id)
        const color = colorById.get(section.id)
        const isHovered = hover?.sectionId === section.id
        return (
          <React.Fragment key={section.id}>
            <div
              className={`groups-section-row${isHovered ? ' hover' : ''}`}
              style={{ paddingLeft: 6 + depth * 12 }}
              onMouseEnter={() => onHover({ chunkId, sectionId: section.id })}
            >
              {nested && nested.sections.length > 0 ? (
                <button
                  className="groups-expand"
                  onClick={() => onToggleExpand(section.id)}
                  title={expanded ? 'Collapse' : 'Expand subdivisions'}
                >
                  {expanded ? '\u25BC' : '\u25B6'}
                </button>
              ) : (
                <span className="groups-expand-spacer" />
              )}
              {/* Color legend for the canvas glow — a thin bar (not a box), so
                  it never reads as a checkbox, and invisible when this section
                  isn't currently a glow group. */}
              <span className="groups-swatch" style={{ background: color ?? 'transparent' }} />
              <span className="groups-section-name" title={section.id}>
                {shortSectionId(section.id)}
              </span>
              <span className="groups-section-meta">{section.members.length}n · c{section.complexity}</span>
            </div>
            {expanded && nested && nested.sections.length > 0 && (
              <SectionRows
                chunkId={chunkId}
                sections={nested.sections}
                depth={depth + 1}
                selection={selection}
                onToggleExpand={onToggleExpand}
                hover={hover}
                onHover={onHover}
                colorById={colorById}
              />
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="groups-param-row">
      <span className="groups-param-label">{label}</span>
      <span className="groups-param-value">{value}</span>
    </div>
  )
}

// Identity of a decomposition's echoed-back params. Used as ParamsEditor's React
// key so a fresh decomposition (new resolved params) re-seeds the controls,
// while typing between recomputes never remounts the editor mid-edit.
function paramsSeedKey(decomposition?: Decomposition): string {
  if (!decomposition) return 'bootstrap'
  return [
    decomposition.ceiling,
    decomposition.floor,
    decomposition.maxDepth,
    (decomposition.strategies ?? []).join('+'),
  ].join('|')
}

interface ParamsEditorProps {
  decomposition?: Decomposition
  onRequestDecomposition: (params: DecompositionParams) => void
}

// Editable Params tab: seeds ceiling/floor/maxDepth/strategies from the current
// decomposition (or blank when bootstrapping the first request), and emits a
// `DecompositionParams` on Recompute. Numeric fields are held as strings so a
// field can be cleared to mean "let the host apply its default"; empty/invalid
// fields are omitted from the request rather than sent as 0.
function ParamsEditor({ decomposition, onRequestDecomposition }: ParamsEditorProps) {
  const numToInput = (n: number | undefined) => (n != null ? String(n) : '')
  const [ceiling, setCeiling] = React.useState(() => numToInput(decomposition?.ceiling))
  const [floor, setFloor] = React.useState(() => numToInput(decomposition?.floor))
  const [maxDepth, setMaxDepth] = React.useState(() => numToInput(decomposition?.maxDepth))
  const [by, setBy] = React.useState<Set<string>>(() => new Set(decomposition?.strategies ?? []))

  const toggleStrategy = (s: string) => {
    setBy(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const recompute = () => {
    const params: DecompositionParams = {}
    const addNum = (raw: string, set: (v: number) => void) => {
      if (raw.trim() === '') return
      const n = Number(raw)
      if (Number.isFinite(n)) set(n)
    }
    addNum(ceiling, v => { params.ceiling = v })
    addNum(floor, v => { params.floor = v })
    addNum(maxDepth, v => { params.maxDepth = v })
    if (by.size > 0) params.by = STRATEGY_OPTIONS.filter(s => by.has(s))
    onRequestDecomposition(params)
  }

  return (
    <div className="groups-params">
      <p className="groups-params-note">Adjust decomposition parameters and recompute.</p>
      <NumberField label="ceiling" value={ceiling} onChange={setCeiling} />
      <NumberField label="floor" value={floor} onChange={setFloor} />
      <NumberField label="max depth" value={maxDepth} onChange={setMaxDepth} />
      <div className="groups-param-strategies">
        <span className="groups-param-label">strategies</span>
        <div className="groups-strategy-options">
          {STRATEGY_OPTIONS.map(s => (
            <label key={s} className={`groups-strategy${by.has(s) ? ' on' : ''}`} title={s}>
              <input
                type="checkbox"
                checked={by.has(s)}
                onChange={() => toggleStrategy(s)}
                aria-label={s}
              />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </div>
      <button className="groups-recompute" onClick={recompute}>Recompute</button>
    </div>
  )
}

function NumberField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="groups-param-row">
      <span className="groups-param-label">{label}</span>
      <input
        className="groups-param-input"
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  )
}
