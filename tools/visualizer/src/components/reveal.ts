// The Tree's reveal — Show in Tree and in-tree navigation: the definition it
// scrolls to and flashes, or a row nested inside it (#249). Each reveal takes a
// new nonce, so a repeat reveal of the row already lit re-fires the effects that
// scroll it and replay its flash, and an earlier reveal's end leaves a later one
// lit (#293).

/** How long a revealed row stays lit: the length of the `flash-target` animation. */
export const FLASH_MS = 1000

export interface Reveal {
  /** The revealed definition's key. */
  key: string
  /** The nested row revealed in place of the definition (a nexus operation or endpoint), by name. */
  child?: string
  nonce: number
}

export interface RevealState {
  /** The reveal now lit. */
  lit: Reveal | null
  /** The last nonce handed out. */
  nonce: number
}

export type RevealAction =
  | { type: 'reveal'; key: string; child?: string }
  | { type: 'end'; nonce: number }

export const NO_REVEAL: RevealState = { lit: null, nonce: 0 }

export function revealReducer(state: RevealState, action: RevealAction): RevealState {
  switch (action.type) {
    case 'reveal': {
      const nonce = state.nonce + 1
      return { lit: { key: action.key, child: action.child, nonce }, nonce }
    }
    case 'end':
      return state.lit?.nonce === action.nonce ? { ...state, lit: null } : state
  }
}

/** The nonce of the reveal that names the nested row `name`, if one does. */
export function childReveal(reveal: Reveal | undefined, name: string): number | undefined {
  return reveal?.child === name ? reveal.nonce : undefined
}

/**
 * Replays the flash on a row a repeat reveal lands on: the row keeps its
 * `flash-target` class, so the CSS animation would not restart on its own.
 */
export function replayFlash(el: Element): void {
  for (const a of el.getAnimations()) {
    if (a instanceof CSSAnimation && a.animationName === 'flash-target') a.currentTime = 0
  }
}
