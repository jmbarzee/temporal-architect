// Groups modal for the Graph view's decomposition overlay.
// Implements GRAPH_VIEW.md § Decomposition Group Overlay: a collapsible
// floating panel (collapsed by default) with two tabs — a tree browser of
// chunk -> division options -> sections, and a read-only parameter readout.
// It mirrors GraphControlPanel's collapse/tab structure and reuses its CSS.

import React from 'react'
import type { Decomposition, Chunk, Division, Section } from '../types/decomposition'
import {
  defaultStrategyForChunk,
  type GroupSelection,
  type GroupHover,
  type ActiveGroup,
} from '../graph/groups'

type GroupsTab = 'groups' | 'params'

interface GroupsModalProps {
  decomposition?: Decomposition
  selection: GroupSelection
  onSelectionChange: (next: GroupSelection) => void
  hover: GroupHover | null
  onHover: (h: GroupHover | null) => void
  // The currently-glowing groups, used to color the section swatches so the
  // modal reads as the legend for what's on the canvas.
  activeGroups: ActiveGroup[]
}

// Last path segment of a section id (e.g. ".../service:workflow:AgenticTask"
// -> "service:workflow:AgenticTask") for a compact, readable row label.
function shortSectionId(id: string): string {
  const i = id.lastIndexOf('/')
  return i >= 0 ? id.slice(i + 1) : id
}

// Collect every section id in a division that carries a nested sub-division
// (i.e. is drillable) — used by "expand all" / "collapse all".
function drillableSectionIds(division: Division): string[] {
  const out: string[] = []
  const walk = (s: Section) => {
    const nested = s.divisions?.[0]
    if (nested && nested.sections.length > 0) {
      out.push(s.id)
      for (const child of nested.sections) walk(child)
    }
  }
  for (const s of division.sections) walk(s)
  return out
}

export function GroupsModal({
  decomposition,
  selection,
  onSelectionChange,
  hover,
  onHover,
  activeGroups,
}: GroupsModalProps) {
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<GroupsTab>('groups')

  const colorById = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const g of activeGroups) m.set(g.id, g.color)
    return m
  }, [activeGroups])

  // Chunks worth showing in the browser: those the explore phase actually
  // divided (loop/under-ceiling chunks have no divisions to choose between).
  const divisibleChunks = React.useMemo(
    () => (decomposition?.chunks ?? []).filter(c => c.divisions && c.divisions.length > 0),
    [decomposition],
  )

  // Nothing to overlay → don't render the modal at all (keeps the canvas clean
  // for designs with no over-ceiling chunks, or hosts that send no decomposition).
  if (!decomposition || divisibleChunks.length === 0) return null

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

  const setExpanded = (ids: string[], expanded: boolean) => {
    const expandedSections = new Set(selection.expandedSections)
    for (const id of ids) {
      if (expanded) expandedSections.add(id)
      else expandedSections.delete(id)
    }
    onSelectionChange({ ...selection, expandedSections })
  }

  const activeDivisionOf = (chunk: Chunk): Division => {
    const strategy = selection.activeStrategyByChunk[chunk.id] ?? defaultStrategyForChunk(chunk)
    return chunk.divisions!.find(d => d.strategy === strategy) ?? chunk.divisions![0]
  }

  return (
    <div className={`groups-modal graph-control-panel ${open ? 'open' : ''}`}>
      <button
        className="graph-control-panel-toggle"
        onClick={() => setOpen(!open)}
        title="Toggle decomposition groups"
      >
        {open ? '\u25BC Groups' : '\u25B6 Groups'}
      </button>

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

          {tab === 'groups' && (
            <div className="groups-tree" onMouseLeave={() => onHover(null)}>
              {divisibleChunks.map(chunk => {
                const division = activeDivisionOf(chunk)
                const enabled = selection.enabledChunks.has(chunk.id)
                const drillable = drillableSectionIds(division)
                return (
                  <div key={chunk.id} className="groups-chunk">
                    <label className="groups-chunk-head" title={chunk.id}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleEnabled(chunk.id)}
                      />
                      <span className="groups-chunk-name">{shortSectionId(chunk.id)}</span>
                      <span className="groups-chunk-meta">c{chunk.complexity}</span>
                    </label>

                    {/* Division options — pick the cut for this chunk. Hover an
                        option (selected or not) to preview it on the canvas. */}
                    <div className="groups-options">
                      {chunk.divisions!.map(div => (
                        <label
                          key={div.strategy}
                          className="groups-option"
                          title={div.rationale}
                          onMouseEnter={() => onHover({ chunkId: chunk.id, strategy: div.strategy })}
                          onMouseLeave={() => onHover(null)}
                        >
                          <input
                            type="radio"
                            name={`groups-div-${chunk.id}`}
                            checked={division.strategy === div.strategy}
                            onChange={() => setActiveStrategy(chunk.id, div.strategy)}
                          />
                          <span className="groups-option-rank">#{div.rank}</span>
                          <span className="groups-option-strategy">{div.strategy}</span>
                        </label>
                      ))}
                    </div>

                    {drillable.length > 0 && (
                      <div className="groups-expand-all">
                        <button onClick={() => setExpanded(drillable, true)}>expand all</button>
                        <button onClick={() => setExpanded(drillable, false)}>collapse all</button>
                      </div>
                    )}

                    <SectionRows
                      chunkId={chunk.id}
                      sections={division.sections}
                      depth={0}
                      selection={selection}
                      onToggleExpand={toggleExpand}
                      hover={hover}
                      onHover={onHover}
                      colorById={colorById}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'params' && (
            <div className="groups-params">
              <p className="groups-params-note">Parameters used to compute these groups.</p>
              {/* maxDepth / strategies were added to the wire contract after
                  ceiling / floor; guard against a host bundling an older twf
                  whose JSON omits them so the readout degrades instead of
                  crashing on `undefined.join`. */}
              <ParamRow label="ceiling" value={String(decomposition.ceiling)} />
              <ParamRow label="floor" value={String(decomposition.floor)} />
              <ParamRow label="max depth" value={decomposition.maxDepth != null ? String(decomposition.maxDepth) : '\u2014'} />
              <ParamRow label="strategies" value={(decomposition.strategies ?? []).join(', ')} />
            </div>
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
              <span
                className="groups-swatch"
                style={{
                  background: color ?? 'transparent',
                  borderColor: color ?? 'var(--color-border)',
                }}
              />
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
