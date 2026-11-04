import { describe, expect, it } from 'vitest'
import { followResize, screenToWorld } from './viewport'

// #210: the camera follows a pane resize.
describe('followResize', () => {
  const vp = { x: 120, y: -40, scale: 1.5 }
  const centre = (v: typeof vp, w: number, h: number) => screenToWorld(v, w / 2, h / 2)

  it('keeps the world point at the pane centre fixed', () => {
    const next = followResize(vp, { width: 1200, height: 813 }, { width: 600, height: 500 })
    expect(centre(next, 600, 500)).toEqual(centre(vp, 1200, 813))
    expect(next.scale).toBe(vp.scale)
  })

  it('leaves the camera alone on the first measurement', () => {
    expect(followResize(vp, null, { width: 600, height: 500 })).toBe(vp)
  })

  it('neither shifts to nor from a zero-sized (hidden) pane', () => {
    expect(followResize(vp, { width: 1200, height: 813 }, { width: 0, height: 0 })).toBe(vp)
    expect(followResize(vp, { width: 0, height: 0 }, { width: 1200, height: 813 })).toBe(vp)
  })

  it('returns the same camera when the size did not change', () => {
    expect(followResize(vp, { width: 600, height: 500 }, { width: 600, height: 500 })).toBe(vp)
  })
})
