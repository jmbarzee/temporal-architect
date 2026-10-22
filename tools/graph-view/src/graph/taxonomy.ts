// The definition *shapes* a taxonomy is expressed in.
//
// This is the library half of the registries. The shapes live here; the entries
// — which node types exist, what they are called, what colour they are — live
// with the host, and reach the engine through an `Ontology`. That split is the
// whole point: a host declares its own values against these shapes and gets the
// full graph engine, without the library knowing a single one of its type names.
//
// What that means concretely, and what it cost to get here: the fields below are
// the ones with no domain in them. Two fields did have a domain and are *not*
// here — `ladder` and `tier`, both of which named tiers of one specific
// deployment model. Each already documented itself as docs-only or
// registry-private, so neither had a reader in the engine to break; a host that
// wants them declares them on its own entry type, which extends these.

import type { DimensionValue } from './dimension'
import type { EdgeStroke, ThemedColor } from './scheme'

// ── Node styles ─────────────────────────────────────────────────────────────

/**
 * How one value on the style axis is drawn, sized, and physically weighted.
 *
 * Reached through `Ontology.resolveNodeStyle`, never by key lookup from the
 * engine — a miss has to resolve to a declared fallback rather than throw,
 * because the resolution happens per node per frame inside the draw loop where
 * an exception stops the canvas repainting for good (T4).
 */
export interface NodeTypeDefinition {
  /** Display name, e.g. "Endpoint". */
  label: string
  /** Single glyph shown inside the canvas node and in tree-view chips. */
  icon: string
  /** Whether this value is visible when the graph first loads. */
  defaultVisible: boolean
  /**
   * What a dependency edge touching a HIDDEN node of this value does (D59):
   * `ascend` re-points the endpoint to the node's nearest visible ancestor;
   * `splice` follows the node's own dependency edges through to the far
   * side, so caller → hidden → callee draws as caller → callee.
   */
  whenHidden: 'ascend' | 'splice'

  // --- Visual ---
  /** Fill and border in both themes; the canvas reads `color[theme]`. */
  color: ThemedColor
  size: {
    /** Circle radius in world units. Hit-test radius = r + 4. */
    r: number
    /** Font size for the icon glyph (px). */
    iconSize: number
  }

  // --- Physics ---
  physics: {
    /**
     * Default repulsion charge. Negative = repulsion. The starting point for
     * the value the user tunes at runtime via the control panel.
     */
    charge: number
    /**
     * Default core radius (charge softening, as a length). A pair of nodes
     * softens its charge by the squared average of the two endpoints'
     * effective core radii (`coreRadiusMultiplier × coreRadius`), added to d².
     * Larger = gentler, wider plateau.
     */
    coreRadius: number
    /**
     * Default rest bands, one per layout axis, inside which this value feels
     * no gravity. `y` is the hierarchy (negative = top of canvas); `x` bounds
     * the horizontal spread. The simulation seeds nodes inside their bands on
     * creation, so the structure is visible before the first tick — which also
     * makes this the seeding function, not only the gravity target (T2).
     */
    band: { x: { min: number; max: number }; y: { min: number; max: number } }
  }

  // --- Summary ---
  /**
   * The glanceable summary for a node of this value: the children it contains,
   * counted per style value and named by that value's abbreviation
   * (`2 Wk · 1 Ep`); its dependency degree (`→3 ←2`); or nothing.
   */
  summaryKind: 'children' | 'degree' | 'none'
}

// ── Edge types ──────────────────────────────────────────────────────────────

export type EdgeCategoryKind = 'containment' | 'dependency'

/**
 * Stable id for one edge category.
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

export interface EdgeTypeDefinition {
  /** Stable id — also the override key in the spring tuning. */
  id: EdgeTypeId
  /** Short control-panel label. */
  label: string
  /**
   * Canonical endpoint values on the style axis — these drive the split-colour
   * token (source | target). Values rather than declared types, because the
   * engine resolves an edge's category from where its endpoint *nodes* sit,
   * not from anything cached on the edge (B14).
   */
  sourceType: DimensionValue
  targetType: DimensionValue
  category: EdgeCategoryKind
  /** Declared stiffness / rest length — what the category resolves to until tuned. */
  physics: SpringPhysics
  /** How the canvas strokes an edge of this type, in both themes (D57). */
  style: EdgeStroke
  tooltip: string
}
