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
// (structural map-coloring, stable semantic hue) is deferred — see
// https://github.com/jmbarzee/temporal-architect/issues/44.
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

// Glow intensity multiplier for a hovered group (vs. the default 1). Drives both
// brightness and — since the canvas swells focused groups — halo/corridor size.
export const HOVER_STRENGTH = 2.2

// Glow intensity multiplier for the group that contains the node currently
// hovered/selected on the canvas. This is the antidote to "tons of groups": with
// many faint groups shown at once, moving over the graph makes the group under
// the pointer surface, so the user can read which group any node belongs to
// without hunting in the modal legend. It brightens *and* swells the group's glow
// (see GROUP_GLOW_FOCUS_SWELL in GraphCanvas) so it clearly lifts out of the field.
export const NODE_FOCUS_STRENGTH = 2.2

// GroupSelection is the persistent, user-driven overlay state owned by
// GraphView. The overlay is an **initially-off** feature: on load nothing glows
// (initialized=false, glowEnabled=false, enabledChunks empty), so the canvas is
// clean and the decomposition is opt-in. The first engagement — opening the
// modal or flipping the master switch on — *initializes* it (enables every chunk
// and turns the glow on); after that it behaves like normal persistent state.
//
// glowEnabled is the master on/off for the whole overlay (the switch at the top
// of the modal); when false nothing glows regardless of the rest.
// activeStrategyByChunk records which division option is active per chunk
// (absent = the rank-1 default); enabledChunks are the chunks whose active
// division (or, for an under-ceiling chunk, whose whole member set) is currently
// glowing; expandedSections are the section rows the user has drilled into (which
// scopes the glow to that section's children). collapsedChunks holds chunks whose
// selected division's section list is collapsed in the modal tree — purely a
// browsing/disclosure concern (it does NOT change what glows).
export interface GroupSelection {
  initialized: boolean
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

// initialGroupSelection is the **off / uninitialized** state: nothing enabled,
// glow off. The overlay stays dark until the user first engages it (see
// initializedSelection), so a freshly-loaded design isn't blanketed in glow. The
// decomposition arg is unused now (kept for call-site symmetry with the reset
// effect that rebuilds this on every new decomposition).
export function initialGroupSelection(_decomposition?: Decomposition): GroupSelection {
  return {
    initialized: false,
    glowEnabled: false,
    activeStrategyByChunk: {},
    enabledChunks: new Set(),
    expandedSections: new Set(),
    collapsedChunks: new Set(),
  }
}

// initializedSelection is the one-time bootstrap applied on first engagement:
// turn the glow on and enable every chunk (the full partition lights up), so the
// user sees the whole decomposition the moment they open it. After this the
// selection behaves normally — toggling the master switch or individual chunks
// no longer re-bootstraps.
export function initializedSelection(
  selection: GroupSelection,
  decomposition: Decomposition | undefined,
): GroupSelection {
  const enabledChunks = new Set<string>()
  if (decomposition) for (const chunk of decomposition.chunks) enabledChunks.add(chunk.id)
  return { ...selection, initialized: true, glowEnabled: true, enabledChunks }
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

    // Under-ceiling chunk (no divisions): the chunk *is* the group — glow its
    // whole member set as one. This is what makes the overlay show the full
    // partition, not just the over-ceiling chunks that carry division options.
    if (!division) {
      const nodeIds = resolveMembers(chunk.members, duplicateGroups, visibleIds)
      if (nodeIds.size === 0) continue
      const chunkHovered = hover?.chunkId === chunk.id && !hover.sectionId && !hover.strategy
      groups.push({
        id: chunk.id,
        chunkId: chunk.id,
        color: GROUP_PALETTE[colorSeq % GROUP_PALETTE.length],
        strength: chunkHovered ? HOVER_STRENGTH : 1,
        nodeIds,
      })
      colorSeq++
      continue
    }

    for (const section of frontierSections(division, selection.expandedSections)) {
      const nodeIds = resolveMembers(section.members, duplicateGroups, visibleIds)
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

// boostGroupsForNodes strengthens any active group that contains one of the
// focused node ids (the node hovered or selected on the canvas), so that group
// surfaces out of a field of many faint ones. Returns the same array when no
// focus node lands in any group, so the common case allocates nothing.
export function boostGroupsForNodes(
  groups: ActiveGroup[],
  focusIds: Array<string | null>,
): ActiveGroup[] {
  const ids = focusIds.filter((id): id is string => !!id)
  if (ids.length === 0) return groups
  let changed = false
  const boosted = groups.map(g => {
    if (ids.some(id => g.nodeIds.has(id))) {
      changed = true
      return { ...g, strength: Math.max(g.strength, NODE_FOCUS_STRENGTH) }
    }
    return g
  })
  return changed ? boosted : groups
}

// resolveMembers maps a list of definition keys to the visible graph node ids
// they cover (each member through its sister-copies, intersected with the
// current visible set — filter-as-source-of-truth).
function resolveMembers(
  members: string[],
  duplicateGroups: Map<string, Set<string>>,
  visibleIds: Set<string>,
): Set<string> {
  const nodeIds = new Set<string>()
  for (const member of members) {
    const copies = duplicateGroups.get(member)
    if (!copies) continue
    for (const id of copies) {
      if (visibleIds.has(id)) nodeIds.add(id)
    }
  }
  return nodeIds
}
