import { describe, expect, it, vi } from 'vitest'
import { screenToWorld } from '../../graph/viewport'
import type { Viewport } from '../../graph/viewport'
import { listenWheelZoom } from './wheelZoom'

// #212: the wheel zoom's preventDefault must take effect, so its listener is
// registered non-passive. A stand-in canvas records the registration.
function fakeCanvas() {
  const listeners: { type: string; fn: EventListener; options: unknown }[] = []
  const canvas = {
    addEventListener: (type: string, fn: EventListener, options: unknown) => listeners.push({ type, fn, options }),
    removeEventListener: (type: string, fn: EventListener) => {
      const i = listeners.findIndex(l => l.type === type && l.fn === fn)
      if (i >= 0) listeners.splice(i, 1)
    },
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
  }
  return { canvas: canvas as unknown as HTMLElement, listeners }
}

const wheel = (clientX: number, clientY: number, deltaY: number) =>
  ({ clientX, clientY, deltaY, preventDefault: vi.fn() }) as unknown as WheelEvent

describe('listenWheelZoom', () => {
  it('listens non-passive and prevents the page scroll', () => {
    const { canvas, listeners } = fakeCanvas()
    listenWheelZoom(canvas, () => ({ x: 0, y: 0, scale: 1 }), () => {})
    expect(listeners).toHaveLength(1)
    expect(listeners[0].type).toBe('wheel')
    expect(listeners[0].options).toEqual({ passive: false })
    const e = wheel(50, 60, -1)
    listeners[0].fn(e)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('zooms about the pointer, in canvas coordinates', () => {
    const { canvas, listeners } = fakeCanvas()
    const vp: Viewport = { x: 30, y: -15, scale: 2 }
    let next: Viewport | undefined
    listenWheelZoom(canvas, () => vp, v => { next = v })
    listeners[0].fn(wheel(110, 220, -1))
    expect(next!.scale).toBeCloseTo(2 * 1.15)
    const [wx, wy] = screenToWorld(next!, 100, 200)
    const [ex, ey] = screenToWorld(vp, 100, 200)
    expect(wx).toBeCloseTo(ex)
    expect(wy).toBeCloseTo(ey)
  })

  it('removes its listener on cleanup', () => {
    const { canvas, listeners } = fakeCanvas()
    const stop = listenWheelZoom(canvas, () => ({ x: 0, y: 0, scale: 1 }), () => {})
    stop()
    expect(listeners).toHaveLength(0)
  })
})
