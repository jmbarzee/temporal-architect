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
  /** Display name, e.g. "Nexus Endpoint". */
  label: string
  /** Single glyph shown inside the canvas node and in tree-view chips. */
  icon: string
  /**
   * The key the visibility filter tests against.
   *
   * A plain string on purpose. The engine compares it and groups by it; it never
   * parses it or enumerates the legal values, so a host is free to use its own
   * vocabulary — including synthetic keys for values that have no first-class
   * declaration of their own.
   */
  defType: string
  /** Whether this value is visible when the graph first loads. */
  defaultVisible: boolean

  // --- Visual ---
  color: {
    /** Canvas fill colour (light theme). */
    fill: string
    /** Canvas border colour (light theme), ~3 stops darker than fill. */
    border: string
    /** Fill override for dark theme. Omitted when same as light fill. */
    fillDark?: string
    /** Border override for dark theme. Omitted when same as light border. */
    borderDark?: string
    /**
     * CSS variable name stem. Generates `--color-<cssVarSuffix>` and
     * `--color-<cssVarSuffix>-border` in the runtime style block.
     */
    cssVarSuffix: string
  }
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
     * Default Y band where this value feels zero gravity. Negative Y = top of
     * canvas. The simulation seeds nodes inside their band on creation, so the
     * hierarchy is visible before the first tick — which also makes this the
     * seeding function, not only the gravity target (T2).
     */
    yBand: { min: number; max: number }
  }

  // --- Summary ---
  /**
   * Which summary strategy to use for a node carrying this value.
   *   'containerCount'    — count contained children
   *   'hostRegistrations' — count contained registrations
   *   'degree'            — count incoming + outgoing dependency edges
   *   'none'              — no summary
   */
  summaryKind: 'containerCount' | 'hostRegistrations' | 'degree' | 'none'
}

// ── Edge types ──────────────────────────────────────────────────────────────

export type EdgeCategoryKind = 'containment' | 'dependency'

/**
 * Stable id for one edge category.
 *
 * A string, not a union, and that is the library's whole position on edge
 * vocabulary: it doubles as the key into the `link` / `dist` param maps and as
 * the hover-link key across the spring map, curves, and canvas, so it has to be
 * something a host can extend. A host narrows it to its own union.
 */
export type EdgeTypeId = string

export interface EdgeTypeDefinition {
  /** Stable id — also the key into the `link` / `dist` param maps. */
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
  /** True = the two directions are distinct categories. */
  directional: boolean
  /** Default stiffness / rest length. */
  physics: { strength: number; distance: number }
  tooltip: string
}
