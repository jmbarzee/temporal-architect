// This host's filter axes, by id. The library declares only `relation`, the
// edge axis its engine reads; every node axis is the host's own, and these
// two are the ones this host filters on. The ids are the strings the
// persisted filter state is keyed by, so they are unchanged from when the
// library declared them.

import type { AxisId } from '@temporal-architect/graph-view'

/**
 * The axis the visibility chips select node kinds on: a projection of the
 * type axis (`temporalType`), written onto each node by the adapter, so one
 * chip can cover several declared types.
 */
export const DEF_TYPE_DIMENSION: AxisId = 'defType'

/**
 * The axis a node's originating `.twf` file sits on. Empty shows everything,
 * the opposite of the kind axis: adding the first file chip while the filter
 * is off would otherwise hide every other file.
 */
export const SOURCE_FILE_DIMENSION: AxisId = 'sourceFile'
