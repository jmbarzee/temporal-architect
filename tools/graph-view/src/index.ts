// Public entry point for the graph-view library.
//
// A force-directed graph view with composable axes. A host declares its
// taxonomy — the axes its nodes carry, the values on each, their colours, sizes
// and physics, how edges classify — through `createTaxonomy(spec)`, builds a
// `Graph` of nodes carrying their axis values, and mounts `GraphView`. The view
// lays out, filters, highlights and tunes the graph without knowing what any of
// it means. The surface is what a host needs to declare a taxonomy, build
// a graph and mount the view: what a host imports plus the types its spec
// names. Named re-exports, not `export *`, so the surface is grep-able in
// one place and the surface gate can read it; the harness in the host package
// reaches internals by deep path, which the published `exports` map does not
// offer.

import './styles/tokens.css'

export { FilterBar } from './components/FilterBar'
export type { FilterBarChrome, FilterBarProps } from './components/FilterBar'
export { GraphView } from './components/GraphView'
export type { GraphViewChrome, GraphViewHandle, GraphViewProps, GroupsControl, NodeAction, Position, SearchState } from './components/GraphView'
export { GroupLegend } from './components/GroupLegend'
export type { GroupLegendProps } from './components/GroupLegend'
export { useLinkedViews } from './components/graph-view/useLinkedViews'
export type { LinkedViewProps, LinkedViewState, LinkedViews, LinkedViewsOptions } from './components/graph-view/useLinkedViews'
export type { FocusRequest } from './components/graph-view/focus'
export type { RecentlyChanged } from './components/graph-view/useRecentlyChanged'
export { TaxonomyContext, useTaxonomy } from './components/graph-view/useTaxonomy'
export { themeChoiceOf, useHostTheme } from './components/graph-view/useTheme'
export type { ThemeChoice } from './components/graph-view/useTheme'
export { reconcileFilter } from './filter/reconcile'
export type { ReconcileInput } from './filter/reconcile'
export { toggleGroup, toggleValue } from './filter/toggle'
export { initialFilter, filterFromJSON, filterStatesEqual, filterToJSON, hiddenMatchesOf, locksFromJSON, locksToJSON, matchesFocus, passesSelection, lockedFor, selectionFor, withLock, withSelection } from './filter/types'
export type { FilterState, FocusTarget, HiddenMatches, HiddenMatchesInput, AxisLocks, ReconcileResult, AxisSelection, ViewTransition } from './filter/types'
export { countsOn, valuesOn } from './graph/axis'
export type { AxisDescriptor, AxisId, AxisNamer, AxisValues, AxisValue, FilterChip, Relation, ResolvedAxisDescriptor } from './graph/axis'
export type { ActiveGroup, NodeGroup } from './graph/groups'
export { copyGroups, isContainment, nodesById, payloadNumber, payloadString } from './graph/model'
export type { Graph, GraphEdge, GraphNode, ReadableGraph } from './graph/model'
export { createTaxonomy } from './graph/taxonomy'
export type { ContextLine, Highlight, HighlightDirection, HighlightGraph, StyleSubject, Taxonomy, TaxonomySpec } from './graph/taxonomy'
export { schemeStylesheet, schemeVars } from './graph/scheme'
export type { ColorPair, EdgeStroke, Theme, ThemedColor } from './graph/scheme'
export type { ScalarAxis } from './graph/scalar'
export { validateGraph } from './graph/validate'
export type { GraphDiagnostic, GraphDiagnosticCode } from './graph/validate'
export { BAND_FRAME, NEUTRAL_STROKE } from './graph/shapes'
export type { Band, EdgeType, EdgeTypeId, NodeStyle, ResolvedEdgeType, ResolvedNodeStyle, SpringPhysics } from './graph/shapes'
