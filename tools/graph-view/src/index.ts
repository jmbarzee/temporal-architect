// Public entry point for the graph-view library.
//
// A force-directed graph view with composable dimensions. A host declares its
// taxonomy — the axes its nodes carry, the values on each, their colours, sizes
// and physics, how edges classify — through `createOntology(spec)`, builds a
// `Graph` of nodes carrying dimension maps, and mounts `GraphView`. The view
// lays out, filters, highlights and tunes the graph without knowing what any of
// it means (D62). Named re-exports, not `export *`, so the surface is grep-able
// in one place; the harness in the host package reaches internals by deep path,
// which the published `exports` map does not offer.

import './styles/tokens.css'

export { FilterBar } from './components/FilterBar'
export { GraphView } from './components/GraphView'
export { OntologyContext, useOntology } from './components/graph-view/useOntology'
export { useRecentlyChanged } from './components/graph-view/useRecentlyChanged'
export { themeChoiceOf, useHostTheme } from './components/graph-view/useTheme'
export type { ThemeChoice } from './components/graph-view/useTheme'
export { InterlockingGearsIcon, SingleGearIcon } from './components/icons/GearIcons'
export { reconcileFilter } from './filter/reconcile'
export { loadState, saveState } from './filter/storage'
export type { PersistedFilter, PersistedPins, StorageConfig } from './filter/storage'
export { passesSelection, pinnedFor, selectionFor, withSelection } from './filter/types'
export type { FilterDimension, FilterState, FocusTarget, PinState, ViewTransition } from './filter/types'
export { DEF_TYPE_DIMENSION, DISPATCH_DIMENSION, RELATION_DIMENSION, SOURCE_FILE_DIMENSION } from './graph/dimension'
export type { DimensionDescriptor, DimensionMap, DimensionValue, FilterChip } from './graph/dimension'
export { HOVER_STRENGTH } from './graph/groups'
export type { ActiveGroup, NodeGroup } from './graph/groups'
export { dispatchOf, isContainment, payloadString } from './graph/model'
export type { Graph, GraphEdge, GraphNode } from './graph/model'
export { createOntology } from './graph/ontology'
export type { Highlight, HighlightGraph, Ontology, OntologySpec } from './graph/ontology'
export { schemeStylesheet, schemeVars } from './graph/scheme'
export type { EdgeStroke } from './graph/scheme'
export type { EdgeCategoryKind, EdgeTypeDefinition, NodeTypeDefinition } from './graph/taxonomy'
