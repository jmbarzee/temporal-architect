// Dimensions — the axes a node's identity is expressed on.
//
// A node used to be one string. It is now a map of axis → value, and every
// feature (colour, push/pull, each gravity axis, each filter in the chain)
// elects exactly ONE axis to operate on. Features never sum, compose or rank
// across axes: that is what keeps the model explainable, and it is why nothing
// here offers a way to combine two dimensions.
//
// **Values are strings, and that is load-bearing rather than lazy.** Selections
// end up as `Set` and `Map` keys in the force kernels, and a `Set` deduplicates
// by value for a string and by *identity* for an object. A composite value —
// an object, a tuple, a freshly-built key — silently degenerates to one entry
// per node, which shifts the band stack and produces no type error and no
// crash. Anything that would be composite has to be interned to a stable string
// before it reaches this type; `internValue` is that step.

/** A named axis of node identity, e.g. the type axis or the source-file axis. */
export type DimensionId = string

/**
 * One value on an axis. A stable interned string: two nodes on the same value
 * must produce keys that are `===` equal, not merely equivalent.
 */
export type DimensionValue = string

/** Where a node sits on every axis it has a value for. */
export type DimensionMap = Readonly<Record<DimensionId, DimensionValue>>

/**
 * Fold anything into a stable value key.
 *
 * Composite selections are the trap this exists for. Passing an array or an
 * object gives a deterministic string rather than a new object each call, so a
 * `Set` of these deduplicates the way the caller expects.
 */
export function internValue(parts: string | readonly string[]): DimensionValue {
  return typeof parts === 'string' ? parts : parts.join('\u0000')
}

/**
 * Everything the view layer needs to know about one axis, beyond its values.
 *
 * **It does not carry the values.** Those are derived, not declared: the style
 * axis's values come from the taxonomy, and the source-file axis's come from
 * scanning the graph. Declaring them here too would be the same fact in two
 * places with nothing enforcing agreement — the shape PLAN §6.6 exists to warn
 * about, and it would have been introduced on the very unit that recorded it.
 *
 * What it does carry is **policy**, and the policies are per-axis because the
 * two existing axes genuinely disagree on all three. A shared loop over
 * dimensions flattens them and silently changes behaviour (T7, T8, T9).
 */
/** One button in a filter bar: a label, an optional glyph, and the values it toggles. */
export interface FilterChip {
  id: string
  label: string
  icon?: string
  /** A style value whose colour this chip wears, in the pane's theme (D57); none means neutral. */
  tint?: DimensionValue
  /**
   * Hover text, when the label alone is not enough to identify the chip.
   *
   * A file chip shows its basename and needs its full path here: two files
   * with the same basename in different directories are otherwise
   * indistinguishable.
   * Omitted means "Show/Hide <label>", which is right for a chip whose label is
   * already the whole identity.
   */
  tooltip?: string
  /** Toggled as a unit — "any on" turns the whole group off. */
  values: readonly DimensionValue[]
}

/**
 * How an axis names itself and its values — the part of a descriptor a control
 * surface needs, split out so the style axis (which is not a filter and has no
 * descriptor) can supply one too and share the identity-mapping builder.
 */
export interface AxisNamer {
  id: DimensionId
  /** Human label for the axis itself, e.g. for a dropdown or a chip group. */
  label: string
  labelFor(value: DimensionValue): string
  /** One or two characters for a token. */
  abbreviationFor(value: DimensionValue): string
}

export interface DimensionDescriptor extends AxisNamer {
  /**
   * What an EMPTY selection on this axis means.
   *
   * The two existing axes disagree, deliberately: an empty type selection hides
   * everything, while an empty file selection shows everything — because adding
   * a file chip while the filter is off would otherwise activate the filter and
   * hide every file but that one (T7).
   */
  emptyMeans: 'all' | 'none'
  /**
   * What happens to a node carrying NO value on this axis while a selection is
   * active. Also per-axis: a node with no source file is visible under any file
   * filter today.
   */
  absentMeans: 'visible' | 'hidden'
  /**
   * How far a focus transition expands this axis to reveal its target (T8).
   *
   *   'always'     — add the target's value unconditionally (the type axis).
   *   'whenActive' — add it only if a selection is already active, because on an
   *                  `emptyMeans: 'all'` axis adding the first value *narrows*
   *                  from everything to one thing. Expanding to reveal a target
   *                  would hide everything else — the opposite of focus.
   */
  focus: 'always' | 'whenActive'
  /**
   * What a change on this axis does to the running simulation (T9).
   *
   * Four independent fields rather than one "strength", because the two axes
   * differ on three of them and a descriptor derived from a careless reading of
   * "types reheat harder" would drop `resume` and leave the canvas frozen after
   * every toggle.
   */
  reheat: {
    /** Alpha to reheat to. */
    alpha: number
    /** Seed newly-revealed nodes at their nearest visible ancestor first. */
    seedRevealed: boolean
    /** Clear the initial-fit guard, so the camera refits to the new extent. */
    refit: boolean
    /** Resume ticking. Never false today — and it is written out per axis
     *  precisely so that stays a decision rather than an omission. */
    resume: boolean
  }
  /**
   * How this axis's available values group into chips.
   *
   * Not one chip per value: a chip may cover several values, which is how one
   * one chip may front several declared kinds. Host-declared because the grouping
   * is a domain choice — but the *shape* is not, so the bar renders any axis
   * without knowing which one it is.
   *
   * Takes the available values rather than reading a declared list, because an
   * axis's values are derived: files come from scanning the graph, kinds from
   * the taxonomy. See the note on this interface about not storing them twice.
   */
  chipsFor(values: readonly DimensionValue[]): readonly FilterChip[]
}

/** Where a node sits on one axis, or undefined when it carries no value there. */
export function valueOf(
  dimensions: DimensionMap,
  dimension: DimensionId,
): DimensionValue | undefined {
  return dimensions[dimension]
}

// ── Dimensional mappings ────────────────────────────────────────────────────

/** One bucket of a mapping: a named group of source values. */
export interface MappingBucket {
  id: string
  /** Display name — a tooltip, a column header. */
  label: string
  /**
   * One or two characters for a token. Required rather than derived: a control
   * surface has no room for a name, and truncating one is a guess the host can
   * answer better.
   */
  abbreviation: string
  values: readonly DimensionValue[]
}

/**
 * A function from an axis's values to an equal-or-smaller set.
 *
 * The point is to bound a control surface. Push/pull renders one draggable
 * token per mapped pair, so an axis with fifty values has no usable control
 * surface until something collapses it — and a mapping is that something. The
 * existing example is three separate kinds folded into one filter chip.
 */
export interface DimensionalMapping {
  id: string
  label: string
  dimension: DimensionId
  buckets: readonly MappingBucket[]
  /** The bucket a value belongs to, or undefined if the mapping omits it. */
  bucketFor(value: DimensionValue | undefined): MappingBucket | undefined
}

export interface DimensionalMappingSpec {
  id: string
  label: string
  dimension: DimensionId
  buckets: readonly MappingBucket[]
}

/**
 * Build a mapping, refusing to build an incoherent one.
 *
 * **Buckets must not intersect.** A value in two buckets has no answer to "which
 * token tunes this node", and the failure would otherwise surface as a layout
 * that depends on bucket declaration order — the kind of bug that is found
 * months later by someone reordering a list for readability. So it throws here,
 * loudly, at construction, rather than resolving arbitrarily per lookup.
 */
export function createDimensionalMapping(spec: DimensionalMappingSpec): DimensionalMapping {
  const owner = new Map<DimensionValue, string>()
  const collisions: string[] = []
  const ids = new Set<string>()
  for (const bucket of spec.buckets) {
    // Two buckets with one id are one override key for two sets of values, and
    // an empty bucket is a token that tunes nothing; both are refused here
    // rather than resolved arbitrarily per lookup.
    if (ids.has(bucket.id)) collisions.push(`bucket id ${JSON.stringify(bucket.id)} is declared twice`)
    ids.add(bucket.id)
    if (bucket.values.length === 0) collisions.push(`bucket ${JSON.stringify(bucket.id)} has no values`)
    for (const value of bucket.values) {
      const existing = owner.get(value)
      if (existing !== undefined && existing !== bucket.id) {
        collisions.push(`${JSON.stringify(value)} is in both ${existing} and ${bucket.id}`)
      } else {
        owner.set(value, bucket.id)
      }
    }
  }
  if (collisions.length > 0) {
    throw new Error(
      `dimensional mapping ${JSON.stringify(spec.id)} is incoherent: ` +
      collisions.join('; ') +
      '. A value in two buckets has no defined answer for which one tunes it.',
    )
  }

  const byValue = new Map<DimensionValue, MappingBucket>()
  for (const bucket of spec.buckets) {
    for (const value of bucket.values) byValue.set(value, bucket)
  }
  return {
    id: spec.id,
    label: spec.label,
    dimension: spec.dimension,
    buckets: spec.buckets,
    bucketFor: value => (value === undefined ? undefined : byValue.get(value)),
  }
}

/**
 * The identity mapping for an axis — one bucket per value.
 *
 * Useful as the default for an axis that is already small enough to control
 * directly, so a consumer never has to special-case "no mapping".
 */
export function identityMapping(
  axis: AxisNamer,
  values: readonly DimensionValue[],
): DimensionalMapping {
  // A namer answers per value and cannot see its neighbours, so two values may
  // abbreviate alike (two files whose names share a prefix). A token label that
  // is not unique within its own mapping is useless, so duplicates are numbered
  // here, where the whole set is visible.
  const seen = new Map<string, number>()
  return createDimensionalMapping({
    id: `${axis.id}:identity`,
    label: axis.label,
    dimension: axis.id,
    buckets: values.map(value => {
      const base = axis.abbreviationFor(value)
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      return {
        id: value,
        label: axis.labelFor(value),
        abbreviation: n === 1 ? base : `${base}${n}`,
        values: [value],
      }
    }),
  })
}

/**
 * True when every bucket is one value named after itself — the shape under
 * which bucket ids ARE the axis's values, so a rule written over values applies
 * to buckets unchanged. Structural, not a flag: a flag would be a second fact
 * about the buckets with nothing holding it to the first.
 */
export function isIdentityMapping(mapping: DimensionalMapping): boolean {
  return mapping.buckets.every(b => b.values.length === 1 && b.values[0] === b.id)
}

/**
 * The distinct values a set of subjects carries on one axis, in first-encounter
 * order. The domain of an axis is whatever the graph presents on it — the
 * engine declares no value vocabulary of its own — so this is how a control
 * surface or a filter learns what an axis can take.
 */
export function valuesOn(
  subjects: Iterable<{ dimensions: DimensionMap }>,
  dimension: DimensionId,
): DimensionValue[] {
  const seen = new Set<DimensionValue>()
  for (const s of subjects) {
    const v = s.dimensions[dimension]
    if (v !== undefined) seen.add(v)
  }
  return [...seen]
}

/**
 * The axis a node's originating file sits on.
 *
 * Declared by the library, unlike the axes a host invents, because the library
 * ships the filter that reads it: a chain that offers "filter by file" has to
 * agree with the host on which axis that is. Nothing about a file is
 * domain-specific — this is shared vocabulary, not borrowed vocabulary.
 *
 * Note its empty-set semantics are the *opposite* of the type axis's: an empty
 * file selection shows everything, because adding a file chip while the filter
 * is off would otherwise activate the filter and hide every file but that one
 * (T7).
 */
export const SOURCE_FILE_DIMENSION: DimensionId = 'sourceFile'

/**
 * Does this table declare `key` itself, rather than inheriting it?
 *
 * Every keyed lookup on a dimension value must go through this. Values are
 * host-supplied strings, so a plain `table[key]` read walks the prototype chain
 * and a value named `constructor`, `toString` or `__proto__` resolves to an
 * inherited member. That member is not `undefined`, which means every
 * `?? default` and `!== undefined` guard downstream silently accepts it.
 *
 * Spelled with `Object.prototype.hasOwnProperty.call` rather than the tidier
 * `Object.hasOwn` so it needs no lib bump, and called on the prototype rather
 * than the table so a table that itself declares a key named `hasOwnProperty`
 * cannot shadow the check.
 */
export function hasOwn(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key)
}

/**
 * The axis the visibility filter selects node kinds on.
 *
 * Its values are a host projection of the style axis — a style's kind, written
 * onto each node by the host's adapter when it builds the graph — which is what
 * lets two styles share a filter key, and one chip cover three declared kinds.
 * The engine reads it off the node like any other axis and never learns it is
 * derived. Library-declared for the same reason as the file axis: the library
 * ships the filter that reads it, so both halves have to agree on which axis
 * it is.
 */
export const DEF_TYPE_DIMENSION: DimensionId = 'defType'

/** What a filter change asks of the running simulation, folded across axes. */
export interface ReheatPlan {
  alpha: number
  seedRevealed: boolean
  refit: boolean
  resume: boolean
  /** The axes that actually changed — empty means "do nothing". */
  changed: readonly DimensionId[]
}

/**
 * Fold the per-axis reheat policies of every axis that changed.
 *
 * Pure and outside React so it can be goldened. It was inline in the loop hook,
 * where **no gate could reach it**: all four fields of a descriptor's `reheat`
 * could be inverted — including `resume: false`, the exact failure T9 names,
 * which freezes the canvas after every toggle — and typecheck, all six gates and
 * 7/7 goldens stayed green. Declared policy nothing reads is not policy.
 *
 * Several axes can move at once (a view switch does exactly that), so the
 * policies combine rather than the last one winning: the strongest reheat, and
 * any axis that wants seeding, refitting or resuming gets it.
 */
export function foldReheatPolicy(
  changedDimensions: readonly DimensionDescriptor[],
): ReheatPlan {
  let alpha = 0, seedRevealed = false, refit = false, resume = false
  for (const dim of changedDimensions) {
    alpha = Math.max(alpha, dim.reheat.alpha)
    seedRevealed = seedRevealed || dim.reheat.seedRevealed
    refit = refit || dim.reheat.refit
    resume = resume || dim.reheat.resume
  }
  return { alpha, seedRevealed, refit, resume, changed: changedDimensions.map(d => d.id) }
}

/**
 * The one axis every edge carries. Library-declared, like the file and kind
 * axes, because the engine ships the code that reads it: edge graduation,
 * highlighting and spring resolution all branch on `relation`.
 *
 *   relation — 'containment' | 'dependency'. The structural meaning of the edge.
 *
 * Anything else an edge carries is the host's. The first host adds `dispatch`,
 * its call kind, which only its own edge rules read — D48 said the engine read
 * it, and it no longer does (D64).
 */
export const RELATION_DIMENSION: DimensionId = 'relation'
