// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import type { Execution } from '@temporal-architect/wire-types'
import { describe, expect, it } from 'vitest'
import { usePlayback } from './usePlayback'

const run = (n: number): Execution => ({ lanes: [], events: Array.from({ length: n }, (_, i) => ({ id: `${i}`, lane: 'l', kind: 'occur' })) })

describe('usePlayback', () => {
  it('shows an execution whole, and a new one whole from its first render', () => {
    const { result, rerender } = renderHook(({ e }) => usePlayback(e), { initialProps: { e: run(3) } })
    expect(result.current[0]).toBe(3)
    act(() => result.current[1](1))
    expect(result.current[0]).toBe(1)
    rerender({ e: run(5) })
    expect(result.current[0]).toBe(5)
  })

  it('has played nothing of no execution', () => {
    expect(renderHook(() => usePlayback(undefined)).result.current[0]).toBe(0)
  })
})
