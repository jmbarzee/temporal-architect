// Group overlay — the glow groups the Graph view draws. A host hands the view
// groups over the WHOLE graph (an id, the node ids the group covers, whether it
// is emphasised); the view restricts each to the visible set, drops the
// empty, and colours each by its place in the host's list — so a group keeps
// its colour when a filter hides the groups before it. Membership is
// derived on every render, never baked into the static graph, exactly like
// the hover and search highlight sets. What a group IS — the host's chunking,
// what the user has drilled into — is the host's; the host turns its own
// structure into `NodeGroup`s.

import type { Theme } from './scheme'

// A small cycling palette per theme. Identity is carried by the host's legend,
// so colours only need to separate the handful of sibling groups shown at
// once — not be globally unique. The light set is the same ten hues a few
// stops deeper, so a glow reads on a pale canvas. Smarter assignment
// (structural map-colouring, stable semantic hue) is deferred — see
// https://github.com/jmbarzee/temporal-architect/issues/44.
export const GROUP_PALETTE: Readonly<Record<Theme, readonly string[]>> = {
  dark: [
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
  ],
  light: [
    '#0F766E', // teal
    '#B45309', // amber
    '#6D28D9', // violet
    '#BE185D', // rose
    '#047857', // green
    '#1D4ED8', // blue
    '#C2410C', // orange
    '#4D7C0F', // lime
    '#0E7490', // cyan
    '#A21CAF', // fuchsia
  ],
}

// Glow intensity multiplier for a group the host emphasises (`NodeGroup
// .emphasized`: hovered in its legend, vs. the default 1). Drives both
// brightness and — since the canvas swells focused groups — halo/corridor size.
const HOVER_STRENGTH = 2.2

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
  /** Whether the host emphasises this group (its legend row is hovered); the view glows it stronger. */
  emphasized?: boolean
  /** The glow's colour, hex or rgb(); absent, the palette's slot for this group's place in the list. */
  color?: string
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
 * (filter-as-source-of-truth), the empty dropped, each coloured by its place
 * in the host's list in the theme's palette — so hiding one group recolours
 * none of the others.
 */
export function activeGroupsOf(groups: readonly NodeGroup[], visibleIds: ReadonlySet<string>, theme: Theme = 'dark'): ActiveGroup[] {
  const palette = GROUP_PALETTE[theme]
  const out: ActiveGroup[] = []
  groups.forEach((g, i) => {
    const nodeIds = new Set<string>()
    for (const id of g.nodeIds) if (visibleIds.has(id)) nodeIds.add(id)
    if (nodeIds.size === 0) return
    out.push({ id: g.id, strength: g.emphasized ? HOVER_STRENGTH : 1, nodeIds, color: g.color ?? palette[i % palette.length] })
  })
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
