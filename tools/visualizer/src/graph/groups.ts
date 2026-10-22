// Group overlay — the glow groups the Graph view draws. A host hands the view
// groups over the WHOLE graph (an id, the node ids the group covers, how
// strongly it glows); the view restricts each to the visible set, drops the
// empty, and colours what is left in order — the palette cycles over the groups
// shown, so a group with no visible node takes no colour. Membership is derived
// on every render, never baked into the static graph, exactly like the hover
// and search highlight sets. What a group IS — the host's chunking, its ranked
// strategies, what the user has drilled into — is the host's: `adapter/groups.ts`
// turns its decomposition and its modal's selection into `NodeGroup`s.
// GRAPH_VIEW.md § Decomposition Group Overlay.

// A small cycling palette. Identity is carried by the host's legend, so colors
// only need to separate the handful of sibling groups shown at once — not be
// globally unique. Smarter assignment (structural map-coloring, stable semantic
// hue) is deferred — see
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

// Glow intensity multiplier for a group the host emphasises (hovered in its
// legend, vs. the default 1). Drives both brightness and — since the canvas
// swells focused groups — halo/corridor size.
export const HOVER_STRENGTH = 2.2

// Glow intensity multiplier for the group that contains the node currently
// hovered/selected on the canvas. This is the antidote to "tons of groups": with
// many faint groups shown at once, moving over the graph makes the group under
// the pointer surface, so the user can read which group any node belongs to
// without hunting in the legend. It brightens *and* swells the group's glow
// (see GROUP_GLOW_FOCUS_SWELL in GraphCanvas) so it clearly lifts out of the field.
export const NODE_FOCUS_STRENGTH = 2.2

/** A group as the host asks for it: over the whole graph, visible or not. */
export interface NodeGroup {
  id: string
  nodeIds: ReadonlySet<string>
  /** Glow multiplier: 1 at rest, `HOVER_STRENGTH` when the host emphasises it. */
  strength: number
}

/** A group as drawn: the visible node ids it covers and its palette colour. */
export interface ActiveGroup {
  id: string
  color: string
  strength: number
  nodeIds: Set<string>
}

/**
 * The groups as drawn: each restricted to the visible set
 * (filter-as-source-of-truth), the empty dropped, the rest coloured in order.
 */
export function activeGroupsOf(groups: readonly NodeGroup[], visibleIds: ReadonlySet<string>): ActiveGroup[] {
  const out: ActiveGroup[] = []
  for (const g of groups) {
    const nodeIds = new Set<string>()
    for (const id of g.nodeIds) if (visibleIds.has(id)) nodeIds.add(id)
    if (nodeIds.size === 0) continue
    out.push({ id: g.id, strength: g.strength, nodeIds, color: GROUP_PALETTE[out.length % GROUP_PALETTE.length] })
  }
  return out
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
