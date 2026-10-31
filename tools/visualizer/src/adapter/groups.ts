// The group overlay's host half: the selection model the Groups modal edits and
// the derivation of the groups the Graph view is asked to glow, from the host's
// decomposition. The decomposition (`twf graph chunks`) partitions definitions
// into chunks -> ranked division options (one per strategy) -> sections ->
// recursive sub-divisions. This module turns "what the modal has
// selected/expanded" into `NodeGroup`s over the whole graph — each section's
// members mapped through the definitionKey -> sister-copies index — and the
// view restricts them to what is visible and colours them (`graph/groups.ts`).

import type { Decomposition, Chunk, Division, Section } from '../types/decomposition'
import type { NodeGroup } from '@temporal-architect/graph-view'
// GroupSelection is the persistent, user-driven overlay state owned by the host
// canvas. The overlay is an **initially-off** feature: on load nothing glows
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

// nodeGroupsOf turns the decomposition + selection + hover into the flat list of
// groups the view is asked to glow, each over every node its members cover. A
// chunk contributes when it is enabled or being hovered; for each, its active
// division's frontier sections become groups, with members mapped through the
// copy index (`copyGroups(graph)`: definition key -> every deployment copy's
// node id). The hovered section is emphasised. The view restricts each group
// to the visible set and colours what is left, in this order.
export function nodeGroupsOf(
  decomposition: Decomposition | undefined,
  selection: GroupSelection,
  hover: GroupHover | null,
  duplicateGroups: ReadonlyMap<string, ReadonlySet<string>>,
): NodeGroup[] {
  if (!decomposition || !selection.glowEnabled) return []

  const groups: NodeGroup[] = []
  for (const chunk of decomposition.chunks) {
    const shown = selection.enabledChunks.has(chunk.id) || hover?.chunkId === chunk.id
    if (!shown) continue

    const division = activeDivisionFor(chunk, selection, hover)

    // Under-ceiling chunk (no divisions): the chunk *is* the group — glow its
    // whole member set as one. This is what makes the overlay show the full
    // partition, not just the over-ceiling chunks that carry division options.
    if (!division) {
      const chunkHovered = hover?.chunkId === chunk.id && !hover.sectionId && !hover.strategy
      groups.push({ id: chunk.id, nodeIds: resolveMembers(chunk.members, duplicateGroups), emphasized: chunkHovered })
      continue
    }

    for (const section of frontierSections(division, selection.expandedSections)) {
      groups.push({
        id: section.id,
        nodeIds: resolveMembers(section.members, duplicateGroups),
        emphasized: hover?.sectionId === section.id,
      })
    }
  }
  return groups
}

// resolveMembers maps a list of definition keys to every graph node id they
// cover (each member through its sister-copies).
function resolveMembers(members: string[], duplicateGroups: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const nodeIds = new Set<string>()
  for (const member of members) {
    const copies = duplicateGroups.get(member)
    if (!copies) continue
    for (const id of copies) nodeIds.add(id)
  }
  return nodeIds
}
