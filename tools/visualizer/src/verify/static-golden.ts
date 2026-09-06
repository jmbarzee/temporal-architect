// Tier A rows that do not depend on any fixture.
//
// Three things live here. The generated stylesheet, because a vocabulary grep
// can see neither a custom-property *name* that is correct-but-domain-specific
// nor this file at all once the ratchet reads zero. The registries, because
// later units relocate them and identical values are the proof a move was a
// move. And the two filter behaviours that are pure functions of a FilterState:
// the reconciler's transition matrix, and the Set-identity trace that is the
// only detector for the memoization trap (T5).

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY, sliderLabelFor, DEFAULT_NODE_SCALE } from '../graph/node-types'
import { DEFAULT_PARAMS } from '../graph/simulation'
import { forceProbes } from './force-probes'
import { syntheticVisible } from './synthetic-visible'
import { ontologyProbes } from './ontology-probes'
import { ALL_EDGE_TYPES } from '../graph/edge-types'
import { buildNodeTypeCSS } from '../graph/node-type-styles'
import { nodeTypeToDefType, defTypeToNodeType } from '../components/graph-view/nodeDefType'
import { VIEW_FILTER_ENTRIES } from '../theme/temporal-theme'
import { reconcileFilter } from '../filter/reconcile'
import { toggleFileSelection, toggleTypeGroupSelection } from '../filter/toggle'
import type { FilterState, PinState, ViewTransition } from '../filter/types'
import type { Json } from './snapshot'
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
 * The lossy bridge between the two type vocabularies, including both silent
 * fallbacks. An unmapped key does not throw here — it quietly resolves to a
 * default, and that behaviour is now pinned rather than merely known (T19).
 */
function defTypeBridge(): Json {
  return {
    nodeTypeToDefType: sortedRecord(ALL_NODE_TYPES.map(t => [t, nodeTypeToDefType(t)] as const)),
    defTypeToNodeType: sortedRecord(
      ALL_NODE_TYPES.map(t => [NODE_TYPE_REGISTRY[t].defType, defTypeToNodeType(NODE_TYPE_REGISTRY[t].defType)] as const),
    ),
    unmappedFallbacks: {
      nodeTypeToDefType: nodeTypeToDefType('no-such-node-type'),
      defTypeToNodeType: defTypeToNodeType('noSuchDef'),
    },
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
  selectedFiles: new Set(files),
  visibleTypes: new Set(types),
})

const DEST_STATES: [string, FilterState][] = [
  ['dest:noFiles', filterOf([], ['workerDef', 'workflowDef'])],
  ['dest:oneFile', filterOf([FILE_A], ['namespaceDef'])],
  ['dest:noTypes', filterOf([FILE_A], [])],
]

const SOURCE_STATE = filterOf([FILE_B], ['activityDef', 'nexusServiceDef'])

const PIN_STATES: [string, PinState][] = [
  ['pins:none', { files: false, types: false }],
  ['pins:files', { files: true, types: false }],
  ['pins:types', { files: false, types: true }],
  ['pins:both', { files: true, types: true }],
]

const INTENTS: [string, ViewTransition][] = [
  ['manual', { kind: 'manual' }],
  // A focus onto a hidden type carrying a file the dest does not have. The
  // asymmetry this exists to pin: the type expands unconditionally, the file
  // expands only when the file filter is already active (T8).
  ['focus:newType+newFile', { kind: 'focus', target: { name: 'X', defType: 'activityDef', sourceFile: FILE_B } }],
  // A focus onto a type that is already visible in every dest state above but
  // one — the "nothing to do" path, which must return the dest object itself.
  ['focus:existingType', { kind: 'focus', target: { name: 'X', defType: 'workflowDef' } }],
  ['focus:noSourceFile', { kind: 'focus', target: { name: 'X', defType: 'activityDef' } }],
]

function reconcileMatrix(): Json {
  const rows: [string, Json][] = []
  for (const [destName, dest] of DEST_STATES) {
    for (const [pinName, pins] of PIN_STATES) {
      for (const [intentName, intent] of INTENTS) {
        const result = reconcileFilter(dest, SOURCE_STATE, pins, intent)
        rows.push([`${destName} · ${pinName} · ${intentName}`, {
          selectedFiles: sorted(result.filter.selectedFiles),
          visibleTypes: sorted(result.filter.visibleTypes),
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
      filesIdentityChanged: next.selectedFiles !== current.selectedFiles,
      typesIdentityChanged: next.visibleTypes !== current.visibleTypes,
      selectedFiles: sorted(next.selectedFiles),
      visibleTypes: sorted(next.visibleTypes),
    })
    current = next
  }

  record(`toggleFile(${FILE_A})`, toggleFileSelection(current, FILE_A))
  record(`toggleFile(${FILE_B})`, toggleFileSelection(current, FILE_B))
  for (const chip of VIEW_FILTER_ENTRIES) {
    record(`toggleTypeGroup(${chip.id})`, toggleTypeGroupSelection(current, chip.types))
  }
  record(`toggleFile(${FILE_A}) [off]`, toggleFileSelection(current, FILE_A))
  record('reconcile(manual, unpinned)', reconcileFilter(
    current, SOURCE_STATE, { files: false, types: false }, { kind: 'manual' },
  ).filter)
  // Reconciling against itself changes nothing, so the dest object comes back
  // by reference and no dimension's identity moves.
  record('reconcile(manual, self)', reconcileFilter(
    current, current, { files: false, types: false }, { kind: 'manual' },
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
    defaultForceParams: { ...DEFAULT_PARAMS } as unknown as Json,
    defaultNodeScale: { ...DEFAULT_NODE_SCALE },
    forceProbes: forceProbes(),
    ontologyProbes: ontologyProbes(),
    syntheticVisible: syntheticVisible(),
    defTypeBridge: defTypeBridge(),
    reconcileMatrix: reconcileMatrix(),
    filterSetIdentity: filterSetIdentity(),
    // Split into lines so a one-rule change is a one-line diff.
    generatedCss: buildNodeTypeCSS().split('\n'),
  }
}
