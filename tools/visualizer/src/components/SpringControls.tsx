// Pull-section controls: a 2D "spring map" (the control) and a read-only
// force-curve visualization (the read-out), linked by a shared hovered-edge
// state (keyed by the edge category's k-field). Both are thin wrappers over
// the shared ForceMap2D / ForceCurves primitives — this file owns only the
// spring-specific math (split-colour tokens from PULL_EDGES, signed-response
// curves) and feeds presentational data into the primitives.
// See GRAPH_VIEW.md § Control Panel.

import React from 'react'
import type { ForceParams } from '../graph/simulation'
import type { NodeType } from '../graph/model'
import { NODE_TYPE_REGISTRY } from '../graph/node-types'
import { ForceMap2D, ForceCurves, CURVE_W, CURVE_H, CURVE_SAMPLES } from './ForceMap'
import type { MapToken, CurveItem } from './ForceMap'

// Shared k / rest ranges. The map plots every edge category on these common
// axes so their relative stiffness / length is directly comparable.
export const EDGE_K_MIN = 0
export const EDGE_K_MAX = 2
export const EDGE_K_STEP = 0.05
export const EDGE_REST_MIN = 0
export const EDGE_REST_MAX = 1000
export const EDGE_REST_STEP = 10

export interface PullEdgeDef {
  label: string
  kKey: keyof ForceParams
  restKey: keyof ForceParams
  // Endpoint node types — drive the split-colour token (source | target).
  sourceType: NodeType
  targetType: NodeType
  // Containment edges get a dashed token outline, dependency edges a solid
  // one — mirroring the dashed/solid edge styling on the canvas.
  edgeType: 'containment' | 'dependency'
  tooltip: string
}

// One entry per edge category. `kKey` doubles as the category's stable id (used
// to link hover across the map, the curves, and the canvas active-edge
// highlight). Order is irrelevant — the map positions tokens by value.
export const PULL_EDGES: PullEdgeDef[] = [
  { label: 'NS↔NS', kKey: 'linkNsToNs', restKey: 'distNsToNs',
    sourceType: 'namespace', targetType: 'namespace', edgeType: 'dependency',
    tooltip: 'Namespace ↔ Namespace dependency' },
  { label: 'NS↔Wk', kKey: 'linkNsToWorker', restKey: 'distNsToWorker',
    sourceType: 'namespace', targetType: 'worker', edgeType: 'containment',
    tooltip: 'Namespace ↔ Worker containment' },
  { label: 'Wk↔Wk', kKey: 'linkWorkerToWorker', restKey: 'distWorkerToWorker',
    sourceType: 'worker', targetType: 'worker', edgeType: 'dependency',
    tooltip: 'Worker ↔ Worker dependency' },
  { label: 'Wk↔Wf', kKey: 'linkWorkerToWorkflow', restKey: 'distWorkerToWorkflow',
    sourceType: 'worker', targetType: 'workflow', edgeType: 'containment',
    tooltip: 'Worker ↔ Workflow containment' },
  { label: 'Wk↔Act', kKey: 'linkWorkerToActivity', restKey: 'distWorkerToActivity',
    sourceType: 'worker', targetType: 'activity', edgeType: 'containment',
    tooltip: 'Worker ↔ Activity containment' },
  { label: 'Wk↔Nx', kKey: 'linkWorkerToNexus', restKey: 'distWorkerToNexus',
    sourceType: 'worker', targetType: 'nexusService', edgeType: 'containment',
    tooltip: 'Worker ↔ Nexus service containment' },
  { label: 'Nx↔Op', kKey: 'linkNexusToOperation', restKey: 'distNexusToOperation',
    sourceType: 'nexusService', targetType: 'nexusOperation', edgeType: 'containment',
    tooltip: 'Nexus service ↔ Nexus operation containment' },
  { label: 'Ep↔NS', kKey: 'linkEndpointToNamespace', restKey: 'distEndpointToNamespace',
    sourceType: 'nexusEndpoint', targetType: 'namespace', edgeType: 'containment',
    tooltip: 'Nexus endpoint ↔ Namespace containment' },
  { label: 'Wf↔Wf', kKey: 'linkWorkflowToWorkflow', restKey: 'distWorkflowToWorkflow',
    sourceType: 'workflow', targetType: 'workflow', edgeType: 'dependency',
    tooltip: 'Workflow ↔ Workflow dependency' },
  { label: 'Wf↔Act', kKey: 'linkWorkflowToActivity', restKey: 'distWorkflowToActivity',
    sourceType: 'workflow', targetType: 'activity', edgeType: 'dependency',
    tooltip: 'Workflow ↔ Activity dependency' },
  { label: 'Wf→Op', kKey: 'linkWorkflowToOperation', restKey: 'distWorkflowToOperation',
    sourceType: 'workflow', targetType: 'nexusOperation', edgeType: 'dependency',
    tooltip: 'Workflow → Nexus operation (the nexus call)' },
  { label: 'Op→Wf', kKey: 'linkOperationToWorkflow', restKey: 'distOperationToWorkflow',
    sourceType: 'nexusOperation', targetType: 'workflow', edgeType: 'dependency',
    tooltip: 'Nexus operation → Workflow (backing workflow / sync-op call)' },
  { label: 'Op↔Act', kKey: 'linkOperationToActivity', restKey: 'distOperationToActivity',
    sourceType: 'nexusOperation', targetType: 'activity', edgeType: 'dependency',
    tooltip: 'Nexus operation ↔ Activity dependency (sync-op body call)' },
  { label: 'Ep↔Op', kKey: 'linkEndpointToOperation', restKey: 'distEndpointToOperation',
    sourceType: 'nexusEndpoint', targetType: 'nexusOperation', edgeType: 'containment',
    tooltip: 'Nexus endpoint ↔ Nexus operation (the endpoint fronts the operation)' },
]

// Theme-aware fill for a node type. mountNodeTypeStyles() emits --color-<suffix>
// with a dark-theme override, so this stays correct across themes.
function typeColor(t: NodeType): string {
  return `var(--color-${NODE_TYPE_REGISTRY[t].color.cssVarSuffix})`
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface SpringControlProps {
  params: ForceParams
  // Routes through the panel's emitParamChange → live reheat.
  onParamChange: (key: keyof ForceParams, value: number) => void
  // The hovered/active edge category, identified by its k-field key.
  hoveredEdge: string | null
  onHoverEdge: (key: string | null) => void
}

// ── 2D Spring Map ───────────────────────────────────────────────────────────
//
// x = rest length, y = stiffness (k). Each edge category is a draggable
// split-colour token; dragging sets both rest and k at once.
export function SpringMap({ params, onParamChange, hoveredEdge, onHoverEdge }: SpringControlProps) {
  const tokens: MapToken[] = PULL_EDGES.map(edge => ({
    id: edge.kKey as string,
    x: params[edge.restKey] as number,
    y: params[edge.kKey] as number,
    colorA: typeColor(edge.sourceType),
    colorB: typeColor(edge.targetType),
    outline: edge.edgeType === 'containment' ? 'dashed' : 'solid',
    label: edge.label,
    tooltip: edge.tooltip,
  }))

  // Drag id is the kKey; map back to the edge def to set both fields.
  const handleDrag = (id: string, x: number, y: number) => {
    const edge = PULL_EDGES.find(e => (e.kKey as string) === id)
    if (!edge) return
    onParamChange(edge.restKey, x)
    onParamChange(edge.kKey, y)
  }

  return (
    <ForceMap2D
      tokens={tokens}
      xAxis={{ min: EDGE_REST_MIN, max: EDGE_REST_MAX, step: EDGE_REST_STEP, label: 'length' }}
      yAxis={{ min: EDGE_K_MIN, max: EDGE_K_MAX, step: EDGE_K_STEP, label: 'stiffness' }}
      onDrag={handleDrag}
      hoveredId={hoveredEdge}
      onHover={onHoverEdge}
      ariaLabel="Spring map: rest length versus stiffness"
      xSlider={{
        value: params.distanceMultiplier, min: 0.05, max: 3, step: 0.05,
        onChange: v => onParamChange('distanceMultiplier', v),
        title: 'Scale every spring’s rest length', ariaLabel: 'Scale all length',
        popId: 'distanceMultiplier',
      }}
      ySlider={{
        value: params.pullMultiplier, min: 0, max: 3, step: 0.1,
        onChange: v => onParamChange('pullMultiplier', v),
        title: 'Scale every spring’s stiffness', ariaLabel: 'Scale all stiffness',
        popId: 'pullMultiplier',
      }}
    />
  )
}

// ── Force-curve visualization (read-only) ────────────────────────────────────
//
// Plots each spring's displacement response stiffness·sign(Δ)|Δ|^exp around its
// rest length (the /d direction term from the sim is dropped — this shows the
// spring *shape*, not the per-tick force vector). Zero crossing = length. The
// baseline sits low so the readable tension side gets most of the height and
// the compression side is cropped.

// Baseline at 78% down: tension (positive) above gets the bulk of the height.
const ZERO_Y = CURVE_H * 0.78

function springResponse(d: number, kEff: number, restEff: number, exp: number): number {
  const disp = d - restEff
  return kEff * Math.sign(disp) * Math.pow(Math.abs(disp), exp)
}

export function SpringCurves({ params, onParamChange, hoveredEdge, onHoverEdge }: SpringControlProps) {
  const pull = params.pullMultiplier
  const dist = params.distanceMultiplier
  const exp = params.linkExponent

  const { curves, dMax } = React.useMemo<{ curves: CurveItem[]; dMax: number }>(() => {
    const restEffs = PULL_EDGES.map(e => (params[e.restKey] as number) * dist)
    const dMax = Math.max(60, Math.max(...restEffs) * 2.2)

    let maxMag = 0
    const sampled = PULL_EDGES.map(edge => {
      const kEff = (params[edge.kKey] as number) * pull
      const restEff = (params[edge.restKey] as number) * dist
      const pts: { d: number; v: number }[] = []
      for (let i = 0; i <= CURVE_SAMPLES; i++) {
        const d = (i / CURVE_SAMPLES) * dMax
        const v = springResponse(d, kEff, restEff, exp)
        if (Math.abs(v) > maxMag) maxMag = Math.abs(v)
        pts.push({ d, v })
      }
      return { edge, restEff, pts }
    })

    const norm = maxMag > 0 ? maxMag : 1
    const ampH = ZERO_Y // tension amplitude spans baseline → top edge (y=0)
    const xFor = (d: number) => (d / dMax) * CURVE_W
    // Symmetric scale by the tension amplitude; the compression side simply
    // clips at the bottom (intentional crop).
    const yFor = (v: number) => clamp(ZERO_Y - (v / norm) * ampH, 0, CURVE_H)

    const built = sampled.map(({ edge, restEff, pts }) => ({
      id: edge.kKey as string,
      color: typeColor(edge.sourceType),
      markerX: xFor(restEff),
      points: pts.map(p => `${xFor(p.d).toFixed(1)},${yFor(p.v).toFixed(1)}`).join(' '),
    }))
    return { curves: built, dMax }
  }, [params, pull, dist, exp])

  return (
    <ForceCurves
      curves={curves}
      xMax={dMax}
      baselineY={ZERO_Y}
      hoveredId={hoveredEdge}
      onHover={onHoverEdge}
      xLabel="distance"
      yLabel="force"
      ariaLabel="Spring force response curves"
      exp={{
        value: exp, min: 0.5, max: 3, step: 0.1,
        onChange: v => onParamChange('linkExponent', v),
        title: 'Power of displacement in the spring force. 1 = linear (Hooke); higher = softer near rest, stiffer far out.',
        popId: 'linkExponent',
      }}
    />
  )
}
