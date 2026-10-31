// The harness's seeded generator. Lives here, not in `src/graph/`, because the
// library has no business shipping a deterministic RNG: production draws from
// the platform generator and only this side of the fence ever seeds one (D11).

import type { Rng } from '../graph/rng'

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. Chosen because it
 * is a dozen lines with no state beyond one integer, so a golden run is
 * reproducible from the seed alone with nothing to install.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
