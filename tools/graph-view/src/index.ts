// Public entry point for the graph-view library.
//
// A force-directed graph view with composable dimensions. A host declares its
// taxonomy — the axes its nodes carry, the values on each, their colours, sizes
// and physics, how edges classify — through `createOntology(spec)`, builds a
// `Graph` of nodes carrying dimension maps, and mounts `GraphView`. The view
// lays out, filters, highlights and tunes the graph without knowing what any of
// it means. The surface is what a host needs to declare a taxonomy, build
// a graph and mount the view: what a host imports plus the types its spec
// names. Named re-exports, not `export *`, so the surface is grep-able in
// one place and the surface gate can read it; the harness in the host package
// reaches internals by deep path, which the published `exports` map does not
// offer.

import './styles/tokens.css'

export { FilterBar } from './components/FilterBar'
export type { FilterBarProps } from './components/FilterBar'
export { GraphView } from './components/GraphView'
export type { GraphViewHandle, GraphViewProps, Position, SearchState } from './components/GraphView'
export { OntologyContext, useOntology } from './components/graph-view/useOntology'
export { themeChoiceOf, useHostTheme } from './components/graph-view/useTheme'
export type { ThemeChoice } from './components/graph-view/useTheme'
export { reconcileFilter } from './filter/reconcile'
export { toggleGroup, toggleValue } from './filter/toggle'
export { defaultFilter, passesSelection, pinnedFor, selectionFor, withPin, withSelection } from './filter/types'
export type { FilterState, FocusTarget, PinState, ReconcileResult, Selection, ViewTransition } from './filter/types'
export { valuesOn } from './graph/dimension'
export type { DimensionDescriptor, DimensionId, DimensionMap, DimensionValue, FilterChip, ReheatPolicy, Relation, ResolvedDimensionDescriptor } from './graph/dimension'
export type { ActiveGroup, NodeGroup } from './graph/groups'
export { copyGroups, copyKeyOf, isContainment, payloadNumber, payloadString } from './graph/model'
export type { Graph, GraphEdge, GraphNode, ReadableGraph } from './graph/model'
export { createOntology } from './graph/ontology'
export type { Highlight, HighlightDirection, HighlightGraph, Ontology, OntologySpec } from './graph/ontology'
export { schemeStylesheet, schemeVars } from './graph/scheme'
export type { ColorPair, EdgeStroke, Theme, ThemedColor } from './graph/scheme'
export type { ScalarAxis } from './graph/scalar'
export { validateGraph } from './graph/validate'
export type { GraphDiagnostic, GraphDiagnosticCode } from './graph/validate'
export { BAND_FRAME, NEUTRAL_STROKE } from './graph/taxonomy'
export type { Band, EdgeType, EdgeTypeId, NodeStyle, ResolvedEdgeType, ResolvedNodeStyle, SpringPhysics } from './graph/taxonomy'
