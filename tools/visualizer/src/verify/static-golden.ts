// Tier A rows that do not depend on any fixture.
//
// Three things live here. The generated stylesheet, because a vocabulary grep
// can see neither a custom-property *name* that is correct-but-domain-specific
// nor this file at all once the ratchet reads zero. The registries, because
// later units relocate them and identical values are the proof a move was a
// move. And the two filter behaviours that are pure functions of a FilterState:
// the reconciler's transition matrix, and the Set-identity trace that is the
// only detector for the memoization trap (T5).

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, sliderLabelFor, DEFAULT_ONTOLOGY } from '../adapter/node-types'
import { DEFAULT_NODE_SCALE } from '../graph/node-scale'
import { defaultParamsFor } from '../graph/simulation'
import { forceProbes } from './force-probes'
import { syntheticVisible } from './synthetic-visible'
import { ontologyProbes } from './ontology-probes'
import { ALL_EDGE_TYPES } from '../adapter/edge-types'
import { buildNodeTypeCSS } from '../adapter/node-type-styles'
import { VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'
import { reconcileFilter } from '../filter/reconcile'
import { toggleValue, toggleGroup } from '../filter/toggle'
import type { FilterState, PinState, ViewTransition } from '../filter/types'
import { selectionFor } from '../filter/types'
import type { Json } from './snapshot'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { sorted, sortedRecord } from './snapshot'

// ── Registries ──────────────────────────────────────────────────────────────

function nodeTypeRows(): Json {
  // Colour is deliberately absent: it is Gate 5's job, and pinning it here
  // would make the palette work a golden diff instead of a visual one. The
  // generated stylesheet below still carries the values, which is the one row
  // that has to.
  return sortedRecord(
    ALL_NODE_TYPES.map(t => {
      const d = NODE_TYPE_REGISTRY[t]
      return [t, {
        label: d.label,
        icon: d.icon,
        defType: d.defType,
        ladder: d.ladder,
        tier: d.tier,
        defaultVisible: d.defaultVisible,
        sliderLabel: sliderLabelFor(t),
        size: { r: d.size.r, iconSize: d.size.iconSize },
        physics: {
          charge: d.physics.charge,
          coreRadius: d.physics.coreRadius,
          yBand: { min: d.physics.yBand.min, max: d.physics.yBand.max },
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
      sourceType: e.sourceType,
      targetType: e.targetType,
      category: e.category,
      directional: e.directional,
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

const filterOf = (files: string[], types: string[]): FilterState => ({
  [SOURCE_FILE_DIMENSION]: new Set(files),
  [DEF_TYPE_DIMENSION]: new Set(types),
})

const DEST_STATES: [string, FilterState][] = [
  ['dest:noFiles', filterOf([], ['workerDef', 'workflowDef'])],
  ['dest:oneFile', filterOf([FILE_A], ['namespaceDef'])],
  ['dest:noTypes', filterOf([FILE_A], [])],
]

const SOURCE_STATE = filterOf([FILE_B], ['activityDef', 'nexusServiceDef'])

// Axis-keyed. Naming these `files`/`types` still TYPECHECKS against
// `Record<DimensionId, boolean>` — it just pins two axes that do not exist, so
// every real pin reads false and the whole matrix collapses to its unpinned
// rows. The golden shrinking by 186 lines is what caught it.
const PIN_STATES: [string, PinState][] = [
  ['pins:none', { [SOURCE_FILE_DIMENSION]: false, [DEF_TYPE_DIMENSION]: false }],
  ['pins:files', { [SOURCE_FILE_DIMENSION]: true, [DEF_TYPE_DIMENSION]: false }],
  ['pins:types', { [SOURCE_FILE_DIMENSION]: false, [DEF_TYPE_DIMENSION]: true }],
  ['pins:both', { [SOURCE_FILE_DIMENSION]: true, [DEF_TYPE_DIMENSION]: true }],
]

const NO_PINS: PinState = {}

const INTENTS: [string, ViewTransition][] = [
  ['manual', { kind: 'manual' }],
  // A focus onto a hidden type carrying a file the dest does not have. The
  // asymmetry this exists to pin: the type expands unconditionally, the file
  // expands only when the file filter is already active (T8).
  ['focus:newType+newFile', { kind: 'focus', target: { name: 'X', values: { [DEF_TYPE_DIMENSION]: 'activityDef', [SOURCE_FILE_DIMENSION]: FILE_B } } }],
  // A focus onto a type that is already visible in every dest state above but
  // one — the "nothing to do" path, which must return the dest object itself.
  ['focus:existingType', { kind: 'focus', target: { name: 'X', values: { [DEF_TYPE_DIMENSION]: 'workflowDef' } } }],
  ['focus:noSourceFile', { kind: 'focus', target: { name: 'X', values: { [DEF_TYPE_DIMENSION]: 'activityDef' } } }],
]

function reconcileMatrix(): Json {
  const rows: [string, Json][] = []
  for (const [destName, dest] of DEST_STATES) {
    for (const [pinName, pins] of PIN_STATES) {
      for (const [intentName, intent] of INTENTS) {
        const result = reconcileFilter(dest, SOURCE_STATE, pins, intent, DEFAULT_ONTOLOGY.filterDimensions)
        rows.push([`${destName} · ${pinName} · ${intentName}`, {
          selectedFiles: sorted(selectionFor(result.filter, SOURCE_FILE_DIMENSION)),
          visibleTypes: sorted(selectionFor(result.filter, DEF_TYPE_DIMENSION)),
          overriddenPins: sorted(result.overriddenPins),
          // The reconciler returns the dest object itself when nothing changed.
          // Consumers memoize on that identity, so it is behaviour, not detail.
          returnedDestUnchanged: result.filter === dest,
        }])
      }
    }
  }
  return sortedRecord(rows)
}

// ── Per-dimension Set identity ──────────────────────────────────────────────

/**
 * A scripted sequence of single-dimension edits, recording which dimension's
 * Set changed identity at each step.
 *
 * The expected shape is the whole point: an edit to one dimension must leave
 * every other dimension's Set reference untouched. Consumers key their memos
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
      // against `Record<DimensionId, …>` and then reading `undefined` on both
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
  record('reconcile(manual, unpinned)', reconcileFilter(
    current, SOURCE_STATE, NO_PINS, { kind: 'manual' }, DEFAULT_ONTOLOGY.filterDimensions,
  ).filter)
  // Reconciling against itself changes nothing, so the dest object comes back
  // by reference and no dimension's identity moves.
  record('reconcile(manual, self)', reconcileFilter(
    current, current, NO_PINS, { kind: 'manual' }, DEFAULT_ONTOLOGY.filterDimensions,
  ).filter)

  return steps
}

// ── Assembly ────────────────────────────────────────────────────────────────

export function staticGolden(): Json {
  return {
    nodeTypes: nodeTypeRows(),
    edgeTypes: edgeTypeRows(),
    // The whole tuned parameter set. Without it a wholesale retune — every
    // scalar changed — is a change no gate can see, and the per-value maps are
    // the thing later units re-key by dimension.
    defaultForceParams: defaultParamsFor(DEFAULT_ONTOLOGY) as unknown as Json,
    defaultNodeScale: { ...DEFAULT_NODE_SCALE },
    forceProbes: forceProbes(),
    ontologyProbes: ontologyProbes(),
    syntheticVisible: syntheticVisible(),
    filterChipLayer: filterChipLayer(),
    reconcileMatrix: reconcileMatrix(),
    filterSetIdentity: filterSetIdentity(),
    // Split into lines so a one-rule change is a one-line diff.
    generatedCss: buildNodeTypeCSS().split('\n'),
  }
}
