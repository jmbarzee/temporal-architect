// What stored data may be trusted to be: the two shape checks every
// `fromJSON` reader shares, so none guesses.

/** What JSON.parse produces for an object: a plain record, not a Map, a Set, a Date or an instance — whose entries are its own keys. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** A number a layout can use: finite, not NaN. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
