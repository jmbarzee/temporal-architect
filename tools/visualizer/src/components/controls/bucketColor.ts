// The colour a control surface paints one bucket of an axis.
//
// On the style axis, bucketed by identity, a bucket IS a styled value and takes
// that value's colour — the same `--color-<suffix>` the canvas uses, so a token
// and its nodes match across themes. Any other bucketing has no declared colour
// yet (a palette for arbitrary axes is Unit 6's), and says so with one neutral
// tone rather than warning its way to the fallback style once per bucket.

import type { DimensionalMapping } from '../../graph/dimension'
import { isIdentityMapping } from '../../graph/dimension'
import type { Ontology } from '../../graph/ontology'

export const NEUTRAL_BUCKET_COLOR = 'var(--color-text-muted)'

export function bucketColor(ontology: Ontology, mapping: DimensionalMapping, bucketId: string): string {
  const styled = mapping.dimension === ontology.styleAxis() && isIdentityMapping(mapping)
  return styled ? `var(--color-${ontology.styleForKey(bucketId).color.cssVarSuffix})` : NEUTRAL_BUCKET_COLOR
}
