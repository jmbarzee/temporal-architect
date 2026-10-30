// useControllable — a prop that a host may control or leave to the view.
//
// The React convention: a value with its change callback is controlled, the
// host owning the state; the value absent, the view keeps its own, seeded
// once from `initial`, and still tells the host about changes through the
// callback when one is given. A one-view host passes nothing; a host that
// shares state between views passes both.

import React from 'react'

export function useControllable<T>(
  value: T | undefined,
  onChange: ((next: T) => void) | undefined,
  initial: () => T,
): [T, (next: T) => void] {
  const [own, setOwn] = React.useState(initial)
  const controlled = value !== undefined
  const onChangeRef = React.useRef(onChange)
  onChangeRef.current = onChange
  const set = React.useCallback((next: T) => {
    if (!controlled) setOwn(next)
    onChangeRef.current?.(next)
  }, [controlled])
  return [controlled ? value : own, set]
}

/**
 * The previous value for as long as the next is equal to it, so a host that
 * rebuilds a value each render (a filter parsed from a URL) does not read as
 * a change downstream: memos and effects key on the object this returns.
 */
export function useStable<T>(value: T, equals: (a: T, b: T) => boolean): T {
  const ref = React.useRef(value)
  if (ref.current !== value && !equals(ref.current, value)) ref.current = value
  return ref.current
}

/** The latest value of a callback prop, read from an effect or a handler without being a dependency. */
export function useLatest<T>(value: T): React.MutableRefObject<T> {
  const ref = React.useRef(value)
  ref.current = value
  return ref
}
