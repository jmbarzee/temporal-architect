// @vitest-environment happy-dom

// #293 / #249: the Tree's reveal wiring, rendered. Scrolling, element sizes
// and CSS animations are stubbed (happy-dom lays nothing out), and recorded.

import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { TaxonomyContext, useLinkedViews } from '@temporal-architect/graph-view'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TAXONOMY } from '../adapter/node-types'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../adapter/dimensions'
import type { TWFFile } from '../types/ast'
import { TreeView, type TreeFocus } from './TreeView'

const at = (line: number) => ({ line, column: 1 })
const AST = {
  definitions: [
    { type: 'workerDef', name: 'payments-worker', sourceFile: 'a.twf', ...at(1), workflows: [{ name: 'Charge', ...at(2) }], activities: [], services: [{ name: 'Payments', ...at(3) }] },
    { type: 'workflowDef', name: 'Charge', sourceFile: 'a.twf', ...at(5), params: '', body: [] },
    {
      type: 'nexusServiceDef', name: 'Payments', sourceFile: 'a.twf', ...at(8),
      operations: [{ name: 'GetStatus', opType: 'sync', ...at(9) }, { name: 'Refund', opType: 'sync', ...at(10) }],
    },
    { type: 'namespaceDef', name: 'payments', sourceFile: 'a.twf', ...at(12), workers: [{ workerName: 'payments-worker', ...at(13) }], endpoints: [{ endpointName: 'PaymentsEndpoint', ...at(14) }] },
  ],
} as unknown as TWFFile

const focusOn = (name: string, type: string, child?: string): TreeFocus =>
  ({ name, child, values: { [DEF_TYPE_DIMENSION]: type, [SOURCE_FILE_DIMENSION]: 'a.twf' } })

// The host's half of a Show in Tree, as WorkflowCanvas does it: widen the
// Tree's filter to the target and hand the Tree the focus.
let show: (target: TreeFocus) => void
function Host({ active = true, ast = AST }: { active?: boolean; ast?: TWFFile }) {
  const linked = useLinkedViews({ taxonomy: DEFAULT_TAXONOMY, views: ['tree', 'graph'] as const })
  const [pending, setPending] = React.useState<TreeFocus | null>(null)
  show = target => {
    linked.switchTo('tree', { kind: 'focus', target })
    setPending(target)
  }
  return (
    <TaxonomyContext.Provider value={DEFAULT_TAXONOMY}>
      <TreeView
        active={active}
        ast={ast}
        {...linked.of('tree')}
        systemTheme="light"
        pendingFocus={pending}
        onFocusConsumed={() => setPending(null)}
      />
    </TaxonomyContext.Provider>
  )
}

// The page under test: a 462px scroller padded 148px below its filter bar.
const VIEW = 462, PAD = 148
let sizes: { row: number; nested: number }
let scrolls: { el: Element; block?: ScrollLogicalPosition }[]
const animations = new WeakMap<Element, { animationName: string; currentTime: number }>()

class FakeCSSAnimation {
  animationName = 'flash-target'
  currentTime = 400
}

beforeEach(() => {
  vi.useFakeTimers()
  sizes = { row: 40, nested: 30 }
  scrolls = []
  vi.stubGlobal('CSSAnimation', FakeCSSAnimation)
  const realStyle = getComputedStyle
  vi.stubGlobal('getComputedStyle', (el: Element) =>
    el.classList.contains('workflow-canvas') ? ({ scrollPaddingTop: `${PAD}px` } as CSSStyleDeclaration) : realStyle(el))
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element, opts?: boolean | ScrollIntoViewOptions) {
    scrolls.push({ el: this, block: typeof opts === 'object' ? opts.block : undefined })
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.getAttribute('role') === 'treeitem' ? sizes.row
      : this.matches('.block-nexus-operation, .namespace-entry-endpoint') ? sizes.nested : 0
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) }
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('gv-canvas-header') ? PAD - 8 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('workflow-canvas') ? VIEW : 0
  })
  // A lit row's flash, already 400ms in; a replay resets it.
  Element.prototype.getAnimations = function (this: Element) {
    if (!this.classList.contains('flash-target')) return []
    if (!animations.has(this)) animations.set(this, new FakeCSSAnimation())
    return [animations.get(this)!] as unknown as Animation[]
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const reveal = async (target: TreeFocus) => {
  act(() => show(target))
  await tick(120) // the focus's defer, then the reveal's scroll
}
const lit = (root: HTMLElement) => [...root.querySelectorAll('.flash-target')]
const rowOf = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(r => r.textContent?.includes(text))!
const opRow = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('.block-nexus-operation')].find(r => r.textContent?.includes(name))!

describe('Tree reveal', () => {
  it("keeps a repeat reveal lit past the first reveal's end", async () => {
    const { container } = render(<Host />)
    await reveal(focusOn('Charge', 'workflowDef'))
    await tick(500)
    await reveal(focusOn('Charge', 'workflowDef'))
    await tick(1000 - 500 - 120 + 100) // past the first reveal's end
    expect(lit(container)).toEqual([rowOf(container, 'Charge')])
    await tick(1000)
    expect(lit(container)).toEqual([])
  })

  it('scrolls a nested row again on a repeat reveal of it', async () => {
    const { container } = render(<Host />)
    await reveal(focusOn('Payments', 'nexusServiceDef', 'GetStatus'))
    await reveal(focusOn('Payments', 'nexusServiceDef', 'GetStatus'))
    const op = opRow(container, 'GetStatus')
    expect(scrolls.filter(s => s.el === op)).toHaveLength(2)
    expect(lit(container)).toEqual([op])
  })

  it('replays the flash on a repeat reveal only', async () => {
    const { container } = render(<Host />)
    await reveal(focusOn('Charge', 'workflowDef'))
    const row = rowOf(container, 'Charge')
    expect(row.getAnimations()[0].currentTime).toBe(400)
    await reveal(focusOn('Charge', 'workflowDef'))
    expect(row.getAnimations()[0].currentTime).toBe(0)

    await reveal(focusOn('Payments', 'nexusServiceDef', 'Refund'))
    const op = opRow(container, 'Refund')
    expect(op.getAnimations()[0].currentTime).toBe(400)
    await reveal(focusOn('Payments', 'nexusServiceDef', 'Refund'))
    expect(op.getAnimations()[0].currentTime).toBe(0)
  })
})

describe('Tree filter bar', () => {
  const barHeight = (root: HTMLElement) =>
    root.querySelector<HTMLElement>('.workflow-canvas')!.style.getPropertyValue('--tree-filter-bar-height')

  it('measures the bar as the view is shown, before any scroll', () => {
    const { container, rerender } = render(<Host active={false} />)
    expect(barHeight(container)).toBe('')
    rerender(<Host active />)
    expect(barHeight(container)).toBe(`${PAD - 8}px`)
  })
})

// The review's case: a row taller than the room below the bar aligns its top
// there ('start'); a short one moves the least distance ('nearest').
describe('Tree scroll alignment', () => {
  const tall = VIEW - PAD + 1, short = 40
  const lastScrollOf = (el: Element) => scrolls.filter(s => s.el === el).pop()?.block

  for (const [label, height, block] of [['tall', tall, 'start'], ['short', short, 'nearest']] as const) {
    it(`a ${label} top-level row revealed by Show in Tree scrolls to '${block}'`, async () => {
      sizes.row = height
      const { container } = render(<Host />)
      await reveal(focusOn('payments-worker', 'workerDef'))
      expect(lastScrollOf(rowOf(container, 'payments-worker'))).toBe(block)
    })

    it(`a ${label} row reached by in-tree navigation scrolls to '${block}'`, async () => {
      sizes.row = height
      const { container } = render(<Host />)
      fireEvent.click(within(rowOf(container, 'Charge')).getByText('Worker'))
      await tick(120)
      expect(lastScrollOf(rowOf(container, 'payments-worker'))).toBe(block)
    })

    it(`a ${label} row reached by ArrowUp scrolls to '${block}'`, async () => {
      sizes.row = height
      const { container } = render(<Host />)
      act(() => rowOf(container, 'Charge').focus())
      fireEvent.keyDown(container.querySelector('[role="tree"]')!, { key: 'ArrowUp' })
      expect(lastScrollOf(rowOf(container, 'payments-worker'))).toBe(block)
    })

    it(`a ${label} nested operation row revealed by Show in Tree scrolls to '${block}'`, async () => {
      sizes.nested = height
      const { container } = render(<Host />)
      await reveal(focusOn('Payments', 'nexusServiceDef', 'GetStatus'))
      expect(lastScrollOf(opRow(container, 'GetStatus'))).toBe(block)
    })

    it(`a ${label} nested endpoint row revealed by Show in Tree scrolls to '${block}'`, async () => {
      sizes.nested = height
      const { container } = render(<Host />)
      await reveal(focusOn('payments', 'namespaceDef', 'PaymentsEndpoint'))
      const endpoint = container.querySelector<HTMLElement>('.namespace-entry-endpoint')!
      expect(endpoint.textContent).toContain('PaymentsEndpoint')
      expect(lastScrollOf(endpoint)).toBe(block)
    })
  }
})

// A row declared twice in one definition (DUPLICATE_NEXUS_OPERATION,
// DUPLICATE_ENDPOINT) is its first declaration's, as the resolver keeps it: a
// Show in Tree scrolls to and lights only the first row of the name.
describe('Tree reveal of a duplicated row', () => {
  const DUPLICATES = {
    definitions: [
      { type: 'workflowDef', name: 'W', sourceFile: 'a.twf', ...at(1), params: '', body: [] },
      {
        type: 'nexusServiceDef', name: 'S', sourceFile: 'a.twf', ...at(4),
        operations: [{ name: 'Op', opType: 'sync', ...at(5) }, { name: 'Op', opType: 'async', workflowName: 'W', ...at(7) }],
      },
      { type: 'namespaceDef', name: 'n', sourceFile: 'a.twf', ...at(9), workers: [], endpoints: [{ endpointName: 'e', ...at(10) }, { endpointName: 'e', ...at(13) }] },
    ],
  } as unknown as TWFFile

  for (const [label, focus, selector] of [
    ['operation', focusOn('S', 'nexusServiceDef', 'Op'), '.block-nexus-operation'],
    ['endpoint', focusOn('n', 'namespaceDef', 'e'), '.namespace-entry-endpoint'],
  ] as const) {
    it(`scrolls to and lights only the first ${label} of a name`, async () => {
      const { container } = render(<Host ast={DUPLICATES} />)
      await reveal(focus)
      const rows = [...container.querySelectorAll(selector)]
      expect(rows).toHaveLength(2)
      expect(scrolls.map(s => s.el).filter(el => rows.includes(el))).toEqual([rows[0]])
      expect(lit(container)).toEqual([rows[0]])
    })
  }
})
