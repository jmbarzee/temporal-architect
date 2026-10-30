// The definition *shapes* a taxonomy is expressed in.
//
// This is the library half of the registries. The shapes live here; the entries
// — which node styles exist, what they are called, what colour they are — live
// with the host, and reach the engine through an `Ontology`. That split is the
// whole point: a host declares its own values against these shapes and gets the
// full graph engine, without the library knowing a single one of its names.
//
// Each shape comes twice: the *declared* form a host writes, in which
// everything that has a sensible default is optional, and the *resolved* form
// the engine reads, in which every field is present. `createOntology` turns
// the one into the other once, so the draw loop never asks "was this given?".

import type { DimensionValue } from './dimension'
import type { EdgeStroke, ThemedColor } from './scheme'

// ── Node styles ─────────────────────────────────────────────────────────────

/** A rest band on one layout axis: the range inside which a value feels no gravity. */
export interface Band { min: number; max: number }

/**
 * How one value on the style axis is drawn, sized, and physically weighted,
 * as a host declares it. Only the id, the label and the colour are required;
 * the rest is derived from them and from the value's position in the
 * declaration order (top of the hierarchy first):
 *
 *   - `abbreviation`: the first two characters of the label.
 *   - `icon`: none.
 *   - `size.r`: 12; `size.iconSize`: nine tenths of the radius, at least 9.
 *   - `physics.charge`: −40 × r; `physics.coreRadius`: 4 × r.
 *   - `physics.band.y`: the value's slice of the stack, by position — the
 *     first value's band at the top of the canvas, the last at the bottom,
 *     neighbours overlapping a fifth; `physics.band.x`: 0 to 380.
 *   - `whenHidden`: `ascend`; `summaryKind`: `degree`.
 *
 * A field given overrides its default, field by field — a band's `x` may be
 * declared and its `y` left to the stack.
 */
export interface NodeStyle {
  /** The value on the style axis this style is for. */
  id: DimensionValue
  /** Display name, e.g. "Endpoint". */
  label: string
  /**
   * One or two characters for a control token: a control surface renders a
   * token per value and has no room for a name.
   */
  abbreviation?: string
  /** Single glyph drawn inside the canvas node. */
  icon?: string
  /** Fill and border in both themes; the canvas reads `color[theme]`. */
  color: ThemedColor
  size?: {
    /** Circle radius in world units. Hit-test radius = r + 4. */
    r?: number
    /** Font size for the icon glyph (px). */
    iconSize?: number
  }
  physics?: {
    /**
     * Repulsion charge. Negative = repulsion. The starting point for the
     * value the user tunes at runtime via the control panel.
     */
    charge?: number
    /**
     * Core radius (charge softening, as a length). A pair of nodes softens
     * its charge by the squared average of the two endpoints' effective core
     * radii (`coreRadiusMultiplier × coreRadius`), added to d². Larger =
     * gentler, wider plateau.
     */
    coreRadius?: number
    /**
     * Rest bands, one per layout axis, inside which this value feels no
     * gravity. `y` is the hierarchy (negative = top of canvas); `x` bounds
     * the horizontal spread. The simulation seeds nodes inside their bands on
     * creation, so the structure is visible before the first tick — which
     * also makes this the seeding function, not only the gravity target.
     */
    band?: { x?: Band; y?: Band }
  }
  /**
   * What a dependency edge touching a HIDDEN node of this value does:
   * `ascend` re-points the endpoint to the node's nearest visible ancestor;
   * `splice` follows the node's own dependency edges through to the far
   * side, so caller → hidden → callee draws as caller → callee.
   */
  whenHidden?: 'ascend' | 'splice'
  /**
   * The glanceable summary for a node of this value: the children it contains,
   * counted per style value and named by that value's abbreviation
   * (`2 Wk · 1 Ep`); its dependency degree (`→3 ←2`); or nothing.
   */
  summaryKind?: 'children' | 'degree' | 'none'
}

/**
 * A node style with every default filled in — what `Ontology.styleOf` answers.
 *
 * Reached through `Ontology.resolveNodeStyle`, never by key lookup from the
 * engine — a miss has to resolve to the fallback rather than throw, because
 * the resolution happens per node per frame inside the draw loop where an
 * exception stops the canvas repainting for good.
 */
export interface ResolvedNodeStyle {
  id: DimensionValue
  label: string
  abbreviation: string
  /** Empty when the style declares none: nothing is drawn. */
  icon: string
  color: ThemedColor
  size: { r: number; iconSize: number }
  physics: { charge: number; coreRadius: number; band: { x: Band; y: Band } }
  whenHidden: 'ascend' | 'splice'
  summaryKind: 'children' | 'degree' | 'none'
}

// ── Edge types ──────────────────────────────────────────────────────────────

/**
 * Stable id for one edge type.
 *
 * A string, not a union, and that is the library's whole position on edge
 * vocabulary: it is the override key in the spring tuning and the hover-link
 * key across the spring map, curves, and canvas, so it has to be something a
 * host can extend. A host narrows it to its own union.
 */
export type EdgeTypeId = string

/** One spring: stiffness (k) and rest length. */
export interface SpringPhysics {
  strength: number
  distance: number
}

/**
 * One kind of edge, as a host declares it: which values it runs between and
 * which relation it expresses, and — optionally — how it is stroked, its
 * spring and its hover text. An edge is classified as the one declared type
 * whose relation and endpoint values match its own, in either orientation,
 * unless the taxonomy's `classifyEdge` says otherwise. A stroke left out is
 * the neutral stroke, field by field; a spring left out starts from the
 * typical spring, the mean of the declared ones (or a middling one when none
 * is declared); a tooltip left out is the label.
 */
export interface EdgeType {
  /** Stable id — also the override key in the spring tuning. */
  id: EdgeTypeId
  /** Short control-panel label. */
  label: string
  /**
   * The endpoint values on the style axis this type runs between — read off
   * the edge's original endpoint nodes when an edge is classified, and the
   * two halves of the split-colour token. Values, not types: the engine
   * resolves an edge's type from where its nodes sit.
   */
  sourceType: DimensionValue
  targetType: DimensionValue
  /** Which relation an edge of this type expresses; an edge is classified only as a type of its own relation. */
  relation: 'containment' | 'dependency'
  /** Declared stiffness / rest length — what the type resolves to until tuned. */
  physics?: SpringPhysics
  /** How the canvas strokes an edge of this type, in both themes; any field left out is the neutral stroke's. */
  style?: Partial<EdgeStroke>
  tooltip?: string
}

/** An edge type with its defaults filled in — what `Ontology.edgeTypes` carries. */
export interface ResolvedEdgeType extends EdgeType {
  physics: SpringPhysics
  style: EdgeStroke
  tooltip: string
}

/** The stroke an edge type starts from, and the stroke of an edge no type claims: a quiet, solid grey. */
export const NEUTRAL_STROKE: EdgeStroke = { color: { light: '#94A3B8', dark: '#64748B' }, alpha: 0.7, dash: [], width: 1.2 }

// ── Defaults ────────────────────────────────────────────────────────────────

/**
 * The frame the default rest bands are laid in, in world units: the
 * hierarchy axis runs from `top` (the first declared value) to `bottom` (the
 * last), and every value spreads across `x`. A host that declares a band of
 * its own writes it in these units.
 */
export const BAND_FRAME = { top: -300, bottom: 400, x: { min: 0, max: 380 } as Band } as const
const DEFAULT_RADIUS = 12
/** The spring a type starts from when no declared type carries one. */
export const MIDDLING_SPRING: SpringPhysics = { strength: 0.5, distance: 120 }

/**
 * The rest band on the hierarchy axis for the value at position `i` of `n`:
 * centres spread evenly down the stack, each band wide enough to overlap its
 * neighbours by a fifth, so the structure reads as tiers without a gap a node
 * could never rest in. One value alone takes the whole stack.
 */
export function stackBand(i: number, n: number): Band {
  if (n <= 1) return { min: BAND_FRAME.top, max: BAND_FRAME.bottom }
  const gap = (BAND_FRAME.bottom - BAND_FRAME.top) / (n - 1)
  const centre = BAND_FRAME.top + gap * i
  const half = gap * 0.6
  return { min: Math.round(centre - half), max: Math.round(centre + half) }
}

/**
 * A declared style with every default filled in, given its position in the
 * declaration order. Pure: the same inputs give the same object, so the
 * taxonomy resolves each value once and hands out that one object.
 */
export function resolveNodeStyle(style: NodeStyle, i: number, n: number): ResolvedNodeStyle {
  const r = style.size?.r ?? DEFAULT_RADIUS
  return {
    ...style,
    abbreviation: style.abbreviation ?? style.label.slice(0, 2),
    icon: style.icon ?? '',
    size: { r, iconSize: style.size?.iconSize ?? Math.max(9, Math.round(r * 0.9)) },
    physics: {
      charge: style.physics?.charge ?? -40 * r,
      coreRadius: style.physics?.coreRadius ?? 4 * r,
      band: {
        x: style.physics?.band?.x ?? { ...BAND_FRAME.x },
        y: style.physics?.band?.y ?? stackBand(i, n),
      },
    },
    whenHidden: style.whenHidden ?? 'ascend',
    summaryKind: style.summaryKind ?? 'degree',
  }
}

/**
 * The spring a type starts from when it declares none: the mean of the
 * declared springs, so the undeclared one is tuned from this host's scale
 * rather than from a number out of another's; the middling spring when no
 * type declares one.
 */
export function typicalSpringOf(types: readonly EdgeType[]): SpringPhysics {
  let strength = 0, distance = 0, n = 0
  for (const t of types) {
    if (!t.physics) continue
    strength += t.physics.strength; distance += t.physics.distance; n++
  }
  return n === 0 ? { ...MIDDLING_SPRING } : { strength: strength / n, distance: distance / n }
}

export function resolveEdgeType(type: EdgeType, typical: SpringPhysics): ResolvedEdgeType {
  return {
    ...type,
    physics: type.physics ?? { ...typical },
    style: { ...NEUTRAL_STROKE, ...type.style, color: { ...NEUTRAL_STROKE.color, ...type.style?.color } },
    tooltip: type.tooltip ?? type.label,
  }
}
