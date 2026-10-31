// The simulation's source of randomness, as an injectable seam.
//
// The layout uses randomness in exactly two situations — breaking a degenerate
// coincident-node frame, and jittering initial/seeded positions — and both are
// unreproducible by construction, which makes the whole engine impossible to
// characterize. Every such call site now reads a `Rng` passed in rather than
// calling the global directly.
//
// The production default is the global generator, unchanged: nothing about the
// running app becomes deterministic, and no consumer sees a new knob. Only the
// verification harness supplies a seeded generator.

/** A source of uniformly-distributed numbers in [0, 1). */
export type Rng = () => number

/**
 * The production default — the platform generator itself. Referenced, not
 * wrapped, so this module is the one place the name appears and the
 * forbidden-pattern check keeps meaning "no unreproducible draw inside a force".
 * `Math.random` reads no `this`, so an unbound reference is safe.
 */
export const defaultRng: Rng = Math.random
