// Canonicalization for the golden snapshot.
//
// A golden is only useful if a three-line change shows up as three lines. That
// needs a total order on every object key and a fixed float precision, applied
// once, at the emit boundary — not sprinkled through the producers.

/** JSON-shaped values the snapshot may contain. */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

/** Decimal places every float in the snapshot is rounded to. */
export const FLOAT_PRECISION = 6

function roundFloat(n: number): number {
  if (!Number.isFinite(n)) return n
  const f = 10 ** FLOAT_PRECISION
  // `+ 0` normalizes -0 to 0 so a sign flip on a zero is not a golden diff.
  return Math.round(n * f) / f + 0
}

/**
 * Deep-copy with object keys sorted and floats rounded. Arrays keep their order
 * — producers are responsible for sorting those, because the right key differs
 * per collection (id, then endpoints, then edge type).
 */
export function canonical(value: Json): Json {
  if (typeof value === 'number') return roundFloat(value)
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    const out: { [k: string]: Json } = {}
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k])
    return out
  }
  return value
}

/** A plain object from entries, sorted by key. */
export function sortedRecord(entries: Iterable<readonly [string, Json]>): { [k: string]: Json } {
  const out: { [k: string]: Json } = {}
  for (const [k, v] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    out[k] = v
  }
  return out
}

/** Counts of each distinct value, keyed by value. */
export function histogram(values: Iterable<string>): { [k: string]: Json } {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return sortedRecord([...counts].map(([k, n]) => [k, n] as const))
}

/** Sort a string array in place and return it, so call sites read as one step. */
export function sorted(values: Iterable<string>): string[] {
  return [...values].sort()
}
