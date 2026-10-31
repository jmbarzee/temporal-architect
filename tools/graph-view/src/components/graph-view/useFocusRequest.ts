// useFocusRequest — a focus request a host raises by node id, each ask new.

import React from 'react'
import type { FocusRequest } from './focus'

/**
 * A focus request and the function that raises one: `requestFocus(id)` is a
 * new request every time, for the same node too, so the view acts on each
 * ask; `requestFocus(null)` withdraws a waiting one. Pass the request as the
 * view's `focus`. A host with two views through `useLinkedViews` has this in
 * `linked.focus(view, node)` and needs none of its own.
 */
export function useFocusRequest(): [FocusRequest | null, (id: string | null) => void] {
  const [request, setRequest] = React.useState<FocusRequest | null>(null)
  const seq = React.useRef(0)
  const requestFocus = React.useCallback((id: string | null) => setRequest(id === null ? null : { id, key: ++seq.current }), [])
  return [request, requestFocus]
}
