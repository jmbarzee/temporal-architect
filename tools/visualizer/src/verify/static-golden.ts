// Tier A rows that do not depend on any fixture.
//
// Three things live here. The generated stylesheet, because a vocabulary grep
// can see neither a custom-property *name* that is correct-but-domain-specific
// nor this file at all once the ratchet reads zero. The registries, because
// later units relocate them and identical values are the proof a move was a
// move. And the two filter behaviours that are pure functions of a FilterState:
// the reconciler's transition matrix, and the Set-identity trace that is the
// only detector for the memoization trap (T5).

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, sliderLabelFor, DEFAULT_TAXONOMY } from '../adapter/node-types'
import { DEFAULT_NODE_SCALE } from '@temporal-architect/graph-view/graph/node-scale'
import { defaultParamsFor, mappedTuning } from '@temporal-architect/graph-view/graph/simulation'
import type { LayoutTuning } from '@temporal-architect/graph-view/graph/simulation'
import { isScalarTuning } from '@temporal-architect/graph-view/graph/scalar'
import { isScalarAxis, mappedAxis, resolvePhysics } from '@temporal-architect/graph-view/graph/forces'
import type { ResolvedLayoutAxis } from '@temporal-architect/graph-view/graph/forces'
import { scalarProbes } from './scalar-probes'
import { schemeProbes } from './scheme-probes'
import { viewProbes } from './view-probes'
import { seamProbes } from './seam-probes'
import { hostProbes } from './host-probes'
import { integrityProbes } from './integrity-probes'
import { defaultsProbes } from './defaults-probes'
import { contractProbes } from './contract-probes'
import { forceProbes } from './force-probes'
import { syntheticVisible } from './synthetic-visible'
import { taxonomyProbes } from './taxonomy-probes'
import { tuningProbes } from './tuning-probes'
import { ALL_EDGE_TYPES } from '../adapter/edge-types'
import { buildNodeTypeCSS } from '../adapter/node-type-styles'
import { VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'
import { reconcileFilter } from '@temporal-architect/graph-view/filter/reconcile'
import { toggleValue, toggleGroup } from '@temporal-architect/graph-view/filter/toggle'
import type { FilterState, AxisLocks, ViewTransition } from '@temporal-architect/graph-view/filter/types'
import { selectionFor } from '@temporal-architect/graph-view/filter/types'
import type { Json } from './snapshot'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import { sorted, sortedRecord } from './snapshot'

// ── Registries ──────────────────────────────────────────────────────────────

function nodeTypeRows(): Json {
  // Colour is deliberately absent: it is Gate 5's job, and pinning it here
  // would make the palette work a golden diff instead of a visual one. The
  // generated stylesheet below still carries the values, which is the one row
  // that has to.
  return sortedRecord(
    ALL_NODE_TYPES.map(t => {
      // The host's own fields off the registry; everything the library may
      // default, resolved through the taxonomy as the engine reads it.
      const h = NODE_TYPE_REGISTRY[t]
      const d = DEFAULT_TAXONOMY.styleOf(t)
      return [t, {
        label: d.label,
        icon: d.icon,
        defType: h.defType,
        ladder: h.ladder,
        tier: h.tier,
        defaultVisible: h.defaultVisible,
        sliderLabel: sliderLabelFor(t),
        size: { r: d.size.r, iconSize: d.size.iconSize },
        physics: {
          charge: d.physics.charge,
          coreRadius: d.physics.coreRadius,
          band: { x: { min: d.physics.band.x.min, max: d.physics.band.x.max }, y: { min: d.physics.band.y.min, max: d.physics.band.y.max } },
        },
        summaryKind: d.summaryKind,
      }] as const
    }),
  )
}

function edgeTypeRows(): Json {
  return sortedRecord(
    ALL_EDGE_TYPES.map(e => [e.id, {
      label: e.label,
      sourceValue: e.sourceValue,
      targetValue: e.targetValue,
      relation: e.relation,
      physics: { strength: e.physics.strength, distance: e.physics.distance },
    }] as const),
  )
}

/**
 * The chip layer over the filter-key vocabulary.
 *
 * The lossy bridge this also used to pin is gone. Two module-load maps turned a
 * value on the style axis into a filter key and back, each with a silent
 * fallback that resolved an unrecognized input to a *real* type (T19) — so an
 * unknown node was filtered and focused as though it were a workflow. Nothing
 * calls them any more: every consumer resolves `defType` through the taxonomy,
 * which answers a miss with the declared neutral style and warns once.
 *
 * The chip rows stay, because the folding is the half that is still live and
 * still surprising: five chips cover seven filter keys, and one chip carries
 * three of them.
 */
function filterChipLayer(): Json {
  return {
    filterChips: VIEW_FILTER_ENTRIES.map(e => ({
      id: e.id,
      label: e.label,
      types: [...e.types],
    })),
  }
}

// ── The reconciler's transition matrix ──────────────────────────────────────

const FILE_A = 'topics/a.twf'
const FILE_B = 'topics/b.twf'

const filterOf = (files: string[], types: string[]): FilterState =>
  new Map([[SOURCE_FILE_DIMENSION, new Set(files)], [DEF_TYPE_DIMENSION, new Set(types)]])

const DEST_STATES: [string, FilterState][] = [
  ['dest:noFiles', filterOf([], ['workerDef', 'workflowDef'])],
  ['dest:oneFile', filterOf([FILE_A], ['namespaceDef'])],
  ['dest:noTypes', filterOf([FILE_A], [])],
]

const SOURCE_STATE = filterOf([FILE_B], ['activityDef', 'nexusServiceDef'])

// Axis-keyed. Naming these `files`/`types` still TYPECHECKS against
// `Record<AxisId, boolean>` — it just pins two axes that do not exist, so
// every real pin reads false and the whole matrix collapses to its unpinned
// rows. The golden shrinking by 186 lines is what caught it.
const pinsOf = (files: boolean, types: boolean): AxisLocks =>
  new Map([[SOURCE_FILE_DIMENSION, files], [DEF_TYPE_DIMENSION, types]])

const PIN_STATES: [string, AxisLocks][] = [
  ['pins:none', pinsOf(false, false)],
  ['pins:files', pinsOf(true, false)],
  ['pins:types', pinsOf(false, true)],
  ['pins:both', pinsOf(true, true)],
]

const NO_PINS: AxisLocks = new Map()

const INTENTS: [string, ViewTransition][] = [
  ['manual', { kind: 'manual' }],
  // A focus onto a hidden type carrying a file the dest does not have. The
  // asymmetry this exists to pin: the type expands unconditionally, the file
  // expands only when the file filter is already active (T8).
  ['focus:newType+newFile', { kind: 'focus', target: { values: { [DEF_TYPE_DIMENSION]: 'activityDef', [SOURCE_FILE_DIMENSION]: FILE_B } } }],
  // A focus onto a type that is already visible in every dest state above but
  // one — the "nothing to do" path, which must return the dest object itself.
  ['focus:existingType', { kind: 'focus', target: { values: { [DEF_TYPE_DIMENSION]: 'workflowDef' } } }],
  ['focus:noSourceFile', { kind: 'focus', target: { values: { [DEF_TYPE_DIMENSION]: 'activityDef' } } }],
]

const DEFAULT_AXES = DEFAULT_TAXONOMY.filterAxes.map(d => d.id)

function reconcileMatrix(): Json {
  const rows: [string, Json][] = []
  for (const [destName, dest] of DEST_STATES) {
    for (const [pinName, pins] of PIN_STATES) {
      for (const [intentName, intent] of INTENTS) {
        const result = reconcileFilter({ destination: dest, source: SOURCE_STATE, locks: pins, transition: intent, taxonomy: DEFAULT_TAXONOMY, axes: DEFAULT_AXES })
        rows.push([`${destName} · ${pinName} · ${intentName}`, {
          selectedFiles: sorted(selectionFor(result.filter, SOURCE_FILE_DIMENSION)),
          visibleTypes: sorted(selectionFor(result.filter, DEF_TYPE_DIMENSION)),
          overriddenLocks: sorted(result.overriddenLocks),
          // The reconciler returns the dest object itself when nothing changed.
          // Consumers memoize on that identity, so it is behaviour, not detail.
          returnedDestUnchanged: result.filter === dest,
        }])
      }
    }
  }
  return sortedRecord(rows)
}

// ── Per-axis Set identity ──────────────────────────────────────────────

/**
 * A scripted sequence of single-axis edits, recording which axis's
 * Set changed identity at each step.
 *
 * The expected shape is the whole point: an edit to one axis must leave
 * every other axis's Set reference untouched. Consumers key their memos
 * and their reheat decisions on Set identity, so a reducer that rebuilt both
 * would re-run edge graduation and reheat the layout on every unrelated edit —
 * with no type error and no visible symptom other than the graph twitching.
 */
function filterSetIdentity(): Json {
  const steps: Json[] = []
  let current = filterOf([], ['workerDef', 'workflowDef'])

  const record = (op: string, next: FilterState) => {
    steps.push({
      op,
      // Compared through `selectionFor`, not by reading a named field. The
      // named-field version survived the axis-keyed migration by TYPECHECKING
      // against `Record<AxisId, …>` and then reading `undefined` on both
      // sides — so every row reported `false`, and the golden asserted the T5
      // fix while measuring nothing. The fix was real and the probe was blind:
      // two halves, each individually plausible (F12).
      filesIdentityChanged:
        selectionFor(next, SOURCE_FILE_DIMENSION) !== selectionFor(current, SOURCE_FILE_DIMENSION),
      typesIdentityChanged:
        selectionFor(next, DEF_TYPE_DIMENSION) !== selectionFor(current, DEF_TYPE_DIMENSION),
      selectedFiles: sorted(selectionFor(next, SOURCE_FILE_DIMENSION)),
      visibleTypes: sorted(selectionFor(next, DEF_TYPE_DIMENSION)),
    })
    current = next
  }

  record(`toggleFile(${FILE_A})`, toggleValue(current, SOURCE_FILE_DIMENSION, FILE_A))
  record(`toggleFile(${FILE_B})`, toggleValue(current, SOURCE_FILE_DIMENSION, FILE_B))
  for (const chip of VIEW_FILTER_ENTRIES) {
    record(`toggleTypeGroup(${chip.id})`, toggleGroup(current, DEF_TYPE_DIMENSION, chip.types))
  }
  record(`toggleFile(${FILE_A}) [off]`, toggleValue(current, SOURCE_FILE_DIMENSION, FILE_A))
  record('reconcile(manual, unpinned)', reconcileFilter({
    destination: current, source: SOURCE_STATE, locks: NO_PINS, transition: { kind: 'manual' }, taxonomy: DEFAULT_TAXONOMY, axes: DEFAULT_AXES,
  }).filter)
  // Reconciling against itself changes nothing, so the dest object comes back
  // by reference and no axis's identity moves.
  record('reconcile(manual, self)', reconcileFilter({
    destination: current, source: current, locks: NO_PINS, transition: { kind: 'manual' }, taxonomy: DEFAULT_TAXONOMY, axes: DEFAULT_AXES,
  }).filter)

  return steps
}

// ── Assembly ────────────────────────────────────────────────────────────────

/** A layout axis as a golden row: its buckets' bands, or the scalar, its resolved span and whether the user set it. */
function layoutRow(tuning: LayoutTuning, resolved: ResolvedLayoutAxis): Json {
  if (isScalarTuning(tuning) && isScalarAxis(resolved)) {
    return { scalar: tuning.scalar, span: { zero: resolved.span.zero, one: resolved.span.one }, spanIsUsers: tuning.span !== undefined }
  }
  const t = mappedTuning(tuning)
  return { axis: t.mapping.axis, buckets: sortedRecord([...mappedAxis(resolved).byBucket].map(([k, v]) => [k, { min: v.min, max: v.max }] as const)) }
}

export function staticGolden(): Json {
  return {
    nodeTypes: nodeTypeRows(),
    edgeTypes: edgeTypeRows(),
    // The whole tuned parameter set. Without it a wholesale retune — every
    // scalar changed — is a change no gate can see, and the per-value maps are
    // the thing later units re-key by axis.
    defaultForceParams: (() => {
      const p = defaultParamsFor(DEFAULT_TAXONOMY)
      const r = resolvePhysics(p, DEFAULT_TAXONOMY)
      const { pair, bandX, bandY, ...scalars } = p
      // Scalars verbatim; the tunings as the dense tables they resolve to,
      // which is what the kernels consume and what the old `charge` /
      // `coreRadius` / `band` / `link` / `dist` records held. Same numbers,
      // one shape. The declared spring table is enumerated from the taxonomy,
      // through the resolved physics, since the pair rule enumerates nothing.
      return {
        ...scalars,
        push: { axis: pair.mapping.axis, buckets: sortedRecord([...r.push.byBucket].map(([k, v]) => [k, { charge: v.charge, coreRadius: v.coreRadius }] as const)) },
        bandX: layoutRow(bandX, r.bandX),
        bandY: layoutRow(bandY, r.bandY),
        spring: { axis: pair.mapping.axis, categories: sortedRecord(DEFAULT_TAXONOMY.edgeTypes.map(e => { const v = r.spring.physicsFor(e.id); return [e.id, { strength: v.strength, distance: v.distance }] as const })) },
      }
    })() as unknown as Json,
    defaultNodeScale: { ...DEFAULT_NODE_SCALE },
    forceProbes: forceProbes(),
    taxonomyProbes: taxonomyProbes(),
    tuningProbes: tuningProbes(),
    scalarProbes: scalarProbes(),
    schemeProbes: schemeProbes(),
    viewProbes: viewProbes(),
    seamProbes: seamProbes(),
    hostProbes: hostProbes(),
    integrityProbes: integrityProbes(),
    defaultsProbes: defaultsProbes(),
    contractProbes: contractProbes(),
    syntheticVisible: syntheticVisible(),
    filterChipLayer: filterChipLayer(),
    reconcileMatrix: reconcileMatrix(),
    filterSetIdentity: filterSetIdentity(),
    // Split into lines so a one-rule change is a one-line diff.
    generatedCss: buildNodeTypeCSS().split('\n'),
  }
}
