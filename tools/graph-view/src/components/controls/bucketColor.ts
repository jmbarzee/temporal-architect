// The colour a control surface paints one bucket of an axis.
//
// On the style axis, bucketed by identity, a bucket IS a styled value and takes
// that value's colour — the `--gv-node-<suffix>` the pane carries inline in its
// resolved theme (D57), so a token and its nodes match across themes. Any other
// bucketing has no declared colour (a palette for arbitrary axes is a filed
// issue), and says so with one neutral tone rather than warning its way to the
// fallback style once per bucket.

import type { DimensionalMapping } from '../../graph/dimension'
import { isIdentityMapping } from '../../graph/dimension'
import type { Ontology } from '../../graph/ontology'
import { colorVar } from '../../graph/scheme'

export const NEUTRAL_BUCKET_COLOR = 'var(--gv-color-text-muted)'

export function bucketColor(ontology: Ontology, mapping: DimensionalMapping, bucketId: string): string {
  const styled = mapping.dimension === ontology.styleAxis() && isIdentityMapping(mapping)
  return styled ? `var(${colorVar(bucketId)})` : NEUTRAL_BUCKET_COLOR
}
