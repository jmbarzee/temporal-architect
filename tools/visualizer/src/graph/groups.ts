// Decomposition group overlay — the selection model and the derivation of the
// active glow groups for the Graph view. Implements GRAPH_VIEW.md
// § Decomposition Group Overlay.
//
// The decomposition (`twf graph chunks`) partitions definitions into chunks ->
// ranked division options (one per strategy) -> sections -> recursive
// sub-divisions. This module turns "what the modal has selected/expanded" into
// a flat list of ActiveGroups, each resolved to the visible graph node ids it
// covers (via the definitionKey -> sister-copies index). Membership is derived
// reactively, never baked into the static graph — exactly like the hover/search
// highlight sets.

import type { Decomposition, Chunk, Division, Section } from '../types/decomposition'

// A small cycling palette. Identity is carried by the Groups modal (the
// legend), so colors only need to separate the handful of sibling groups shown
// at the currently-expanded depth — not be globally unique. Smarter assignment
// (structural map-coloring, stable semantic hue) is deferred (see
// internal/changes/temp-change-set/chunks/BACKLOG.md
// § Deferred — decomposition overlay → Coloring).
export const GROUP_PALETTE = [
  '#2DD4BF', // teal
  '#F59E0B', // amber
  '#A78BFA', // violet
  '#F472B6', // rose
  '#34D399', // green
  '#60A5FA', // blue
  '#FB923C', // orange
  '#A3E635', // lime
  '#22D3EE', // cyan
  '#E879F9', // fuchsia
] as const

// Glow intensity multiplier for a hovered group (vs. the default 1).
export const HOVER_STRENGTH = 1.9

// GroupSelection is the persistent, user-driven overlay state owned by
// GraphView. glowEnabled is the master on/off for the whole overlay (the switch
// at the top of the modal); when false nothing glows regardless of the rest.
// activeStrategyByChunk records which division option is active per chunk
// (absent = the rank-1 default); enabledChunks are the chunks whose active
// division is currently glowing; expandedSections are the section rows the user
// has drilled into (which scopes the glow to that section's children).
// collapsedChunks holds chunks whose active division's section list is collapsed
// in the modal tree — purely a browsing/disclosure concern (it does NOT change
// what glows); absent = expanded (the default), so the recommended grouping is
// visible on load.
export interface GroupSelection {
  glowEnabled: boolean
  activeStrategyByChunk: Record<string, string>
  enabledChunks: Set<string>
  expandedSections: Set<string>
  collapsedChunks: Set<string>
}

// GroupHover is the transient preview: hovering a division option previews that
// division for its chunk (overriding the active/enabled state); hovering a
// section row emphasizes that one group. Cleared on mouse-out.
export interface GroupHover {
  chunkId: string
  strategy?: string
  sectionId?: string
}

// ActiveGroup is one glowing group: a (possibly drilled-into) section resolved
// to the visible node ids it covers, with its palette color and strength.
export interface ActiveGroup {
  id: string // section id (also the modal row key)
  chunkId: string
  color: string
  strength: number
  nodeIds: Set<string>
}

// defaultStrategyForChunk is the rank-1 division's strategy (divisions arrive
// rank-ordered, rank 1 first), or undefined when the chunk has no divisions
// (under-ceiling or loop-exempt).
export function defaultStrategyForChunk(chunk: Chunk): string | undefined {
  return chunk.divisions?.[0]?.strategy
}

// initialGroupSelection enables every chunk that has divisions at its rank-1
// division ("default to the best-scoring option", per the design), with nothing
// drilled in — so the overlay shows the recommended top-level grouping on load.
export function initialGroupSelection(decomposition: Decomposition | undefined): GroupSelection {
  const enabledChunks = new Set<string>()
  if (decomposition) {
    for (const chunk of decomposition.chunks) {
      if (chunk.divisions && chunk.divisions.length > 0) enabledChunks.add(chunk.id)
    }
  }
  return {
    glowEnabled: true,
    activeStrategyByChunk: {},
    enabledChunks,
    expandedSections: new Set(),
    collapsedChunks: new Set(),
  }
}

// activeDivisionFor resolves the division a chunk should render given the
// selection and any hover override.
function activeDivisionFor(
  chunk: Chunk,
  selection: GroupSelection,
  hover: GroupHover | null,
): Division | undefined {
  if (!chunk.divisions || chunk.divisions.length === 0) return undefined
  const strategy =
    hover && hover.chunkId === chunk.id && hover.strategy
      ? hover.strategy
      : selection.activeStrategyByChunk[chunk.id] ?? defaultStrategyForChunk(chunk)
  return chunk.divisions.find(d => d.strategy === strategy) ?? chunk.divisions[0]
}

// frontierSections returns the sections that should glow for a division: each
// top-level section, unless it has been drilled into (expandedSections) and
// carries a nested sub-division, in which case that sub-division's sections
// take its place (recursively). This bounds the simultaneously-shown groups to
// the branching factor at the expanded depth rather than the total leaf count.
function frontierSections(division: Division, expanded: Set<string>): Section[] {
  const out: Section[] = []
  const walk = (section: Section) => {
    const nested = section.divisions?.[0]
    if (expanded.has(section.id) && nested && nested.sections.length > 0) {
      for (const child of nested.sections) walk(child)
    } else {
      out.push(section)
    }
  }
  for (const s of division.sections) walk(s)
  return out
}

// computeActiveGroups turns the decomposition + selection + hover into the flat
// list of glow groups, each resolved to the visible node ids it covers. A chunk
// contributes when it is enabled or being hovered; for each, its active
// division's frontier sections become groups, with members mapped through
// duplicateGroups (definitionKey -> sister node ids) and intersected with the
// visible set (filter-as-source-of-truth). Colors cycle the palette in stable
// order; the hovered section glows stronger.
export function computeActiveGroups(
  decomposition: Decomposition | undefined,
  selection: GroupSelection,
  hover: GroupHover | null,
  duplicateGroups: Map<string, Set<string>>,
  visibleIds: Set<string>,
): ActiveGroup[] {
  if (!decomposition || !selection.glowEnabled) return []

  const groups: ActiveGroup[] = []
  let colorSeq = 0

  for (const chunk of decomposition.chunks) {
    const shown = selection.enabledChunks.has(chunk.id) || hover?.chunkId === chunk.id
    if (!shown) continue

    const division = activeDivisionFor(chunk, selection, hover)
    if (!division) continue

    for (const section of frontierSections(division, selection.expandedSections)) {
      const nodeIds = new Set<string>()
      for (const member of section.members) {
        const copies = duplicateGroups.get(member)
        if (!copies) continue
        for (const id of copies) {
          if (visibleIds.has(id)) nodeIds.add(id)
        }
      }
      if (nodeIds.size === 0) continue

      groups.push({
        id: section.id,
        chunkId: chunk.id,
        color: GROUP_PALETTE[colorSeq % GROUP_PALETTE.length],
        strength: hover?.sectionId === section.id ? HOVER_STRENGTH : 1,
        nodeIds,
      })
      colorSeq++
    }
  }

  return groups
}
