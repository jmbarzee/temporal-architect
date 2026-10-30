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
export type AxisId = string

/**
 * One value on an axis. A stable interned string: two nodes on the same value
 * must produce keys that are `===` equal, not merely equivalent.
 */
export type AxisValue = string

/** Where a node sits on every axis it has a value for. */
export type AxisValues = Readonly<Record<AxisId, AxisValue>>

/**
 * Fold anything into a stable value key.
 *
 * Composite selections are the trap this exists for. Passing an array or an
 * object gives a deterministic string rather than a new object each call, so a
 * `Set` of these deduplicates the way the caller expects.
 */
export function internValue(parts: string | readonly string[]): AxisValue {
  return typeof parts === 'string' ? parts : parts.join('\u0000')
}

/** One button in a filter bar: a label, an optional glyph, and the values it toggles. */
export interface FilterChip {
  id: string
  label: string
  icon?: string
  /** A style value whose colour this chip wears, in the pane's theme; none means neutral. */
  tint?: AxisValue
  /**
   * Hover text, when the label alone is not enough to identify the chip.
   *
   * A chip for a path shows its last segment and needs the whole path here:
   * two paths with the same last segment are otherwise indistinguishable.
   * Omitted means "Show/Hide <label>", which is right for a chip whose label is
   * already the whole identity.
   */
  tooltip?: string
  /** Toggled as a unit — "any on" turns the whole group off. */
  values: readonly AxisValue[]
}

/**
 * How an axis names itself and its values — the part of a descriptor a control
 * surface needs, split out so the style axis (which is not a filter and has no
 * descriptor) can supply one too and share the identity-mapping builder.
 */
export interface AxisNamer {
  id: AxisId
  /** Human label for the axis itself, e.g. for a dropdown or a chip group. */
  label: string
  labelFor(value: AxisValue): string
  /** One or two characters for a token. */
  abbreviationFor(value: AxisValue): string
}

/** What a filter change asks of the running simulation. */
export interface ReheatPolicy {
  /** Alpha to reheat to. */
  alpha: number
  /** Seed newly-revealed nodes at their nearest visible ancestor first. */
  seedRevealed: boolean
  /** Clear the initial-fit guard, so the camera refits to the new extent. */
  refit: boolean
  /** Resume ticking. */
  resume: boolean
}

/**
 * One filter axis, as a host declares it: its id, its label, and what an
 * empty selection on it means. Everything else is policy with a default that
 * follows from `emptyMeans`, because the two kinds of axis want opposite
 * answers to each question:
 *
 *   - an **allow-list** (`emptyMeans: 'none'`): a node with no value is
 *     hidden, a focus always expands the selection, a change reseeds the
 *     revealed nodes at their ancestors, refits the camera and reheats to
 *     0.5, and the initial selection is every value;
 *   - a **narrowing** axis (`emptyMeans: 'all'`): a node with no value stays
 *     visible, a focus expands only an already-active selection (adding the
 *     first value would narrow everything to one thing — the opposite of
 *     focus), a change reheats to 0.3 in place and keeps the user's pan and
 *     zoom, and the initial selection is empty.
 *
 * **It does not carry the values.** Those are derived, not declared: the style
 * axis's values come from the taxonomy, and an origin axis's from scanning the
 * graph. Declaring them here too would be the same fact in two places with
 * nothing enforcing agreement, free to drift apart unnoticed.
 */
export interface AxisDescriptor {
  id: AxisId
  /** Human label for the axis itself, e.g. for a dropdown or a chip group. */
  label: string
  /**
   * What an EMPTY selection on this axis means: `none` hides everything (the
   * chips are an allow-list), `all` shows everything (the chips narrow).
   */
  emptyMeans: 'all' | 'none'
  /** What happens to a node carrying NO value on this axis while a selection is active. */
  absentMeans?: 'visible' | 'hidden'
  /**
   * How far a focus transition expands this axis to reveal its target:
   * `always` adds the target's value unconditionally; `whenActive` adds it
   * only if a selection is already active.
   */
  focus?: 'always' | 'whenActive'
  /**
   * Whether a change on this axis keeps the user's pan and zoom. Default: an
   * allow-list refits the camera to the new extent (and seeds revealed nodes
   * at their ancestors); a narrowing axis keeps the camera and reheats in
   * place.
   */
  keepCamera?: boolean
  /**
   * How this axis's available values group into chips. Not one chip per
   * value: a chip may cover several values. Takes the available values
   * rather than reading a declared list, because an axis's values are
   * derived from the graph. Absent, one chip per value, labelled by
   * `labelFor` and, on the style axis, wearing the value's icon and tint.
   */
  chipsFor?(values: readonly AxisValue[]): readonly FilterChip[]
  /** A value's display name. Absent: the style's label on the style axis, else the value itself. */
  labelFor?(value: AxisValue): string
  /** One or two characters for a token. Absent: the style's abbreviation on the style axis, else the first two characters of `labelFor`'s answer. */
  abbreviationFor?(value: AxisValue): string
  /** A chip's hover text, when the label alone does not identify the value (a file's full path under its basename). Absent: none. */
  tooltipFor?(value: AxisValue): string
  /**
   * The values selected when the view first opens, given the values the
   * graph presents on this axis. Absent: every value on an allow-list,
   * none on a narrowing axis. `defaultFilter` reads it.
   */
  initialSelection?(values: readonly AxisValue[]): readonly AxisValue[]
  /**
   * How the bar draws this axis's chips. `chip` (the default) is a tinted,
   * glyph-led button that reads as a category; `tag` is a quieter, neutral
   * label that reads as an origin — a file, a source, a place — and shows an
   * "everything included" state when the selection is empty on an
   * `emptyMeans: 'all'` axis.
   */
  presentation?: 'chip' | 'tag'
}

/** A filter axis with every policy filled in — what `Taxonomy.filterAxes` carries. */
export interface ResolvedAxisDescriptor extends AxisNamer {
  emptyMeans: 'all' | 'none'
  absentMeans: 'visible' | 'hidden'
  focus: 'always' | 'whenActive'
  /** What a change on this axis asks of the simulation — derived from `emptyMeans` and `keepCamera`. */
  reheat: ReheatPolicy
  tooltipFor?(value: AxisValue): string
  chipsFor(values: readonly AxisValue[]): readonly FilterChip[]
  initialSelection(values: readonly AxisValue[]): readonly AxisValue[]
  presentation: 'chip' | 'tag'
}

/** How the style axis names and adorns its values, for a descriptor's defaults. */
export interface StyleNamer {
  axis: AxisId
  labelFor(value: AxisValue): string
  abbreviationFor(value: AxisValue): string
  iconFor(value: AxisValue): string
}

/**
 * A declared axis with every default filled in. The policies follow from
 * `emptyMeans`; the names follow from the style axis when this is it, and
 * from the value itself otherwise.
 */
export function resolveDescriptor(d: AxisDescriptor, style: StyleNamer): ResolvedAxisDescriptor {
  const allow = d.emptyMeans === 'none'
  const onStyle = d.id === style.axis
  const labelFor = d.labelFor ?? (onStyle ? style.labelFor : (v: AxisValue) => v)
  const abbreviationFor = d.abbreviationFor ?? (onStyle ? style.abbreviationFor : (v: AxisValue) => labelFor(v).slice(0, 2))
  const keepCamera = d.keepCamera ?? !allow
  return {
    id: d.id,
    label: d.label,
    emptyMeans: d.emptyMeans,
    absentMeans: d.absentMeans ?? (allow ? 'hidden' : 'visible'),
    focus: d.focus ?? (allow ? 'always' : 'whenActive'),
    reheat: { alpha: allow ? 0.5 : 0.3, seedRevealed: !keepCamera, refit: !keepCamera, resume: true },
    labelFor,
    abbreviationFor,
    tooltipFor: d.tooltipFor,
    chipsFor: d.chipsFor ?? (values => values.map(v => ({
      id: v,
      label: labelFor(v),
      icon: onStyle ? style.iconFor(v) || undefined : undefined,
      tint: onStyle ? v : undefined,
      tooltip: d.tooltipFor?.(v),
      values: [v],
    }))),
    initialSelection: d.initialSelection ?? (values => (allow ? values : [])),
    presentation: d.presentation ?? 'chip',
  }
}

/** Where a node sits on one axis, or undefined when it carries no value there. */
export function valueOf(
  dimensions: AxisValues,
  dimension: AxisId,
): AxisValue | undefined {
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
  values: readonly AxisValue[]
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
  dimension: AxisId
  buckets: readonly MappingBucket[]
  /** The bucket a value belongs to, or undefined if the mapping omits it. */
  bucketFor(value: AxisValue | undefined): MappingBucket | undefined
}

export interface DimensionalMappingSpec {
  id: string
  label: string
  dimension: AxisId
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
  const owner = new Map<AxisValue, string>()
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

  const byValue = new Map<AxisValue, MappingBucket>()
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
  values: readonly AxisValue[],
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
  subjects: Iterable<{ dimensions: AxisValues }>,
  dimension: AxisId,
): AxisValue[] {
  const seen = new Set<AxisValue>()
  for (const s of subjects) {
    const v = s.dimensions[dimension]
    if (v !== undefined) seen.add(v)
  }
  return [...seen]
}

/**
 * How many subjects carry each value on each of the given axes — the chip
 * badges' numbers when a host does not supply its own reading. An axis no
 * subject has a value on gets an empty map, never a missing one.
 */
export function countsOn(
  subjects: Iterable<{ dimensions: AxisValues }>,
  dimensions: readonly AxisId[],
): ReadonlyMap<AxisId, ReadonlyMap<AxisValue, number>> {
  const out = new Map<AxisId, Map<AxisValue, number>>(dimensions.map(d => [d, new Map()]))
  for (const s of subjects) {
    for (const d of dimensions) {
      const v = s.dimensions[d]
      if (v === undefined) continue
      const m = out.get(d)!
      m.set(v, (m.get(v) ?? 0) + 1)
    }
  }
  return out
}

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

/** What a filter change asks of the running simulation, folded across axes. */
export interface ReheatPlan extends ReheatPolicy {
  /** The axes that actually changed — empty means "do nothing". */
  changed: readonly AxisId[]
}

/**
 * Fold the per-axis reheat policies of every axis that changed.
 *
 * Pure and outside React so it can be goldened. It was inline in the loop hook,
 * where **no gate could reach it**: all four fields of a descriptor's `reheat`
 * could be inverted — including `resume: false`, which freezes the canvas after
 * every toggle — and every check stayed green. Declared policy nothing reads is
 * not policy.
 *
 * Several axes can move at once (a view switch does exactly that), so the
 * policies combine rather than the last one winning: the strongest reheat, and
 * any axis that wants seeding, refitting or resuming gets it.
 */
export function foldReheatPolicy(
  changedDimensions: readonly ResolvedAxisDescriptor[],
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
 * The structural meaning of an edge — the one fact about an edge the engine
 * reads for itself (graduation, highlighting and spring resolution branch on
 * it). It is a field of the edge, not an axis: every axis, on nodes and on
 * edges, is the host's own.
 */
export type Relation = 'containment' | 'dependency'
