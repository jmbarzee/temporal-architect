// Host ⇄ visualizer message protocol.
//
// This module is the shared *vocabulary* every host transport speaks — the
// language, not an implementation. It is deliberately **framework-free** (no
// React import): the dist TypeScript transport producer imports these shapes
// directly, and the Go producer mirrors them, so nothing here may depend on
// React or the DOM.
//
// Two directions:
//   - inbound  (host/transport → shell): `HostMessage` — the payload the shell
//     consumes to drive its render (`ast` / `error`).
//   - outbound (shell → host/transport): `OutboundMessageType` + `OutboundMessage`
//     — the user-intent vocabulary a transport carries back to its host. The
//     shell itself never emits these (it invokes `HostActions` callbacks); they
//     are canonicalized here so every transport agrees on the wire type, ahead
//     of any toolchain code emitting them (upstream-before-downstream).

/**
 * A message a `PayloadSource` delivers to the shell.
 *
 * - `ast`   — a raw inbound payload (any of the parser wire shapes); the shell
 *   runs it through `normalizePayload`.
 * - `error` — a transport-level failure the shell should surface verbatim.
 */
export type HostMessage =
  | { type: 'ast'; data: unknown }
  | { type: 'error'; message: string }

/**
 * Outbound message-type constants — the wire `type` values a transport uses to
 * carry user intent from the shell's environment back to its host.
 *
 *  - `ready`    — the visualizer has mounted and is ready to receive payloads.
 *  - `openFile` — the user asked to focus a file (carries the file path).
 *  - `refocus`  — the user interacted in a way that implies "return focus to the editor".
 */
export const OutboundMessageType = {
  Ready: 'ready',
  OpenFile: 'openFile',
  Refocus: 'refocus',
} as const

export type OutboundMessageType =
  (typeof OutboundMessageType)[keyof typeof OutboundMessageType]

/** A message a transport carries from the shell's environment back to its host. */
export type OutboundMessage =
  | { type: typeof OutboundMessageType.Ready }
  | { type: typeof OutboundMessageType.OpenFile; file: string }
  | { type: typeof OutboundMessageType.Refocus }
