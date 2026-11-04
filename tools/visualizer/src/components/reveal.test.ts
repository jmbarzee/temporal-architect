import { describe, expect, it } from 'vitest'
import { childReveal, NO_REVEAL, revealReducer, scrollBlockFor, type RevealState } from './reveal'

const reveal = (state: RevealState, key: string, child?: string) => revealReducer(state, { type: 'reveal', key, child })

// #293: a repeat Show in Tree re-scrolls and restarts the flash, and the first
// reveal's timer does not put out the second's flash.
describe('revealReducer', () => {
  it('lights the revealed row', () => {
    const s = reveal(NO_REVEAL, 'nexusServiceDef:Payments:', 'GetStatus')
    expect(s.lit).toMatchObject({ key: 'nexusServiceDef:Payments:', child: 'GetStatus' })
  })

  it('gives a repeat reveal of the same row a new nonce', () => {
    const first = reveal(NO_REVEAL, 'workflowDef:Order:')
    const again = reveal(first, 'workflowDef:Order:')
    expect(again.lit).not.toBe(first.lit)
    expect(again.lit!.nonce).not.toBe(first.lit!.nonce)
  })

  it('never hands out a nonce twice, across an end', () => {
    const first = reveal(NO_REVEAL, 'workflowDef:Order:')
    const ended = revealReducer(first, { type: 'end', nonce: first.lit!.nonce })
    expect(reveal(ended, 'workflowDef:Order:').lit!.nonce).not.toBe(first.lit!.nonce)
  })

  it("leaves a later reveal lit at an earlier reveal's end", () => {
    const first = reveal(NO_REVEAL, 'workflowDef:Order:')
    const again = reveal(first, 'workflowDef:Order:')
    const s = revealReducer(again, { type: 'end', nonce: first.lit!.nonce })
    expect(s.lit).toBe(again.lit)
  })

  it('marks a reveal of the row still lit as a repeat, and no other', () => {
    const first = reveal(NO_REVEAL, 'nexusServiceDef:Payments:', 'GetStatus')
    expect(first.lit!.repeat).toBe(false)
    expect(reveal(first, 'nexusServiceDef:Payments:', 'GetStatus').lit!.repeat).toBe(true)
    expect(reveal(first, 'nexusServiceDef:Payments:').lit!.repeat).toBe(false)
    expect(reveal(first, 'nexusServiceDef:Payments:', 'Refund').lit!.repeat).toBe(false)
    const ended = revealReducer(first, { type: 'end', nonce: first.lit!.nonce })
    expect(reveal(ended, 'nexusServiceDef:Payments:', 'GetStatus').lit!.repeat).toBe(false)
  })

  it('puts out the current reveal at its own end', () => {
    const s = reveal(NO_REVEAL, 'workflowDef:Order:')
    expect(revealReducer(s, { type: 'end', nonce: s.lit!.nonce }).lit).toBeNull()
  })
})

// #249: a nested row is revealed by name, and a repeat reveal re-fires it.
describe('childReveal', () => {
  it('names the nested row the reveal targets', () => {
    const s = reveal(NO_REVEAL, 'namespaceDef:notifications:', 'NotificationsEndpoint')
    expect(childReveal(s.lit!, 'NotificationsEndpoint')).toBe(s.lit)
    expect(childReveal(s.lit!, 'OtherEndpoint')).toBeUndefined()
  })

  it('names no row for a reveal of the definition itself, or no reveal', () => {
    const s = reveal(NO_REVEAL, 'nexusServiceDef:Payments:')
    expect(childReveal(s.lit!, 'GetStatus')).toBeUndefined()
    expect(childReveal(undefined, 'GetStatus')).toBeUndefined()
  })

  it('changes for a repeat reveal of the same row', () => {
    const first = reveal(NO_REVEAL, 'nexusServiceDef:Payments:', 'GetStatus')
    const again = reveal(first, 'nexusServiceDef:Payments:', 'GetStatus')
    expect(childReveal(again.lit!, 'GetStatus')!.nonce).not.toBe(childReveal(first.lit!, 'GetStatus')!.nonce)
  })
})

// #293 review: a row taller than the room below the filter bar aligns its top
// there; 'nearest' would align its bottom and leave its header under the bar.
describe('scrollBlockFor', () => {
  // A 462px scroller under a 140px bar, padded 8px below it.
  const view = 462, pad = 148

  it('moves a row that fits the least distance', () => {
    expect(scrollBlockFor(40, view, pad)).toBe('nearest')
    expect(scrollBlockFor(view - pad, view, pad)).toBe('nearest')
  })

  it('aligns the top of a row taller than the room below the bar', () => {
    expect(scrollBlockFor(view - pad + 1, view, pad)).toBe('start')
    expect(scrollBlockFor(339, view, pad)).toBe('start')
  })
})
