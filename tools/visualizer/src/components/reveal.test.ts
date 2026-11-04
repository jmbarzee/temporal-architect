import { describe, expect, it } from 'vitest'
import { childReveal, NO_REVEAL, revealReducer, type RevealState } from './reveal'

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

  it('puts out the current reveal at its own end', () => {
    const s = reveal(NO_REVEAL, 'workflowDef:Order:')
    expect(revealReducer(s, { type: 'end', nonce: s.lit!.nonce }).lit).toBeNull()
  })
})

// #249: a nested row is revealed by name, and a repeat reveal re-fires it.
describe('childReveal', () => {
  it('names the nested row the reveal targets', () => {
    const s = reveal(NO_REVEAL, 'namespaceDef:notifications:', 'NotificationsEndpoint')
    expect(childReveal(s.lit!, 'NotificationsEndpoint')).toBe(s.lit!.nonce)
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
    expect(childReveal(again.lit!, 'GetStatus')).not.toBe(childReveal(first.lit!, 'GetStatus'))
  })
})
