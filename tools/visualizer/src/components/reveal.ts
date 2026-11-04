// The Tree's reveal — Show in Tree and in-tree navigation: the definition it
// scrolls to and flashes, or a row nested inside it (#249). Each reveal takes a
// new nonce, so a repeat reveal of the row already lit re-fires the effects that
// scroll it and replay its flash, and an earlier reveal's end leaves a later one
// lit (#293). Every Tree scroll lands its row below the sticky filter bar.

/** How long a revealed row stays lit: the length of the `flash-target` animation. */
export const FLASH_MS = 1000

export interface Reveal {
  /** The revealed definition's key. */
  key: string
  /** The nested row revealed in place of the definition (a nexus operation or endpoint), by name. */
  child?: string
  nonce: number
  /** Whether the reveal lands on the row still lit by the one before it. */
  repeat: boolean
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
      const { key, child } = action
      const nonce = state.nonce + 1
      const repeat = state.lit?.key === key && state.lit.child === child
      return { lit: { key, child, nonce, repeat }, nonce }
    }
    case 'end':
      return state.lit?.nonce === action.nonce ? { ...state, lit: null } : state
  }
}

/** The reveal, if it names the nested row `name`. */
export function childReveal(reveal: Reveal | undefined, name: string): Reveal | undefined {
  return reveal?.child === name ? reveal : undefined
}

/**
 * Where a Tree row scrolls to. A row that fits in the room below the bar
 * (`padTop`, the scroller's scroll padding) moves the least distance; a taller
 * one aligns its top there, since aligning to the nearest edge would leave its
 * header under the bar.
 */
export function scrollBlockFor(rowHeight: number, viewHeight: number, padTop: number): ScrollLogicalPosition {
  return rowHeight > viewHeight - padTop ? 'start' : 'nearest'
}

const TREE_SCROLLER = '.workflow-canvas'

/** Records the filter bar's height for the scroller's padding; a hidden bar measures zero and is not recorded. */
export function measureFilterBar(scroller: HTMLElement): void {
  const bar = scroller.querySelector<HTMLElement>(':scope > .gv-canvas-header')
  if (bar?.offsetHeight) scroller.style.setProperty('--tree-filter-bar-height', `${bar.offsetHeight}px`)
}

/**
 * Scrolls a Tree row into view below the filter bar. The bar is measured first:
 * a reveal may just have shown the Tree, before its observer reports the bar.
 */
export function scrollRowIntoView(row: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  const scroller = row.closest<HTMLElement>(TREE_SCROLLER)
  if (!scroller) return
  measureFilterBar(scroller)
  const padTop = parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0
  row.scrollIntoView({ behavior, block: scrollBlockFor(row.getBoundingClientRect().height, scroller.clientHeight, padTop) })
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
