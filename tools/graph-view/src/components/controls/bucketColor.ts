// The colour a control surface paints one bucket of an axis.
//
// On the style axis, bucketed by identity, a bucket IS a styled value and takes
// that value's colour — the `--gv-node-<suffix>` the pane carries inline in its
// resolved theme, so a token and its nodes match across themes. Any other
// bucketing has no declared colour (there is no palette for arbitrary axes
// yet), and says so with one neutral tone rather than warning its way to the
// fallback style once per bucket.

import type { DimensionalMapping } from '../../graph/axis'
import { isIdentityMapping } from '../../graph/axis'
import type { Taxonomy } from '../../graph/taxonomy'

export const NEUTRAL_BUCKET_COLOR = 'var(--gv-color-text-muted)'

export function bucketColor(taxonomy: Taxonomy, mapping: DimensionalMapping, bucketId: string): string {
  const styled = mapping.dimension === taxonomy.styleAxis() && isIdentityMapping(mapping)
  return styled ? `var(${taxonomy.colorVar(bucketId)})` : NEUTRAL_BUCKET_COLOR
}
