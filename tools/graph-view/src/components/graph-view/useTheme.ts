// The pane's theme. The user's choice is system, light or dark; the resolved
// theme is that choice, or — for system — the host's, read from the nearest
// ancestor that declares one with `data-theme`, and otherwise from
// `prefers-color-scheme`, observed so a host that switches mid-session is
// followed. A host embedded somewhere that signals its theme another way (an
// editor's body classes, a settings store) translates that signal into a
// `data-theme` on an ancestor; the library reads nothing else. The pane then
// carries the resolved theme as its own `data-theme`, so its stylesheet tokens
// follow the same answer the canvas draws with — one resolver, not two.

import React from 'react'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'
import type { Theme } from '../../graph/scheme'

export type ThemeChoice = 'system' | Theme

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** A persisted or host-supplied choice, or system for anything outside the three: discard the field, not the state. */
export function themeChoiceOf(value: unknown): ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value) ? (value as ThemeChoice) : 'system'
}

/** What an element that marks a theme says: its `data-theme`. */
export interface ThemeMarker {
  getAttribute(name: string): string | null
}

export const THEME_MARKER_SELECTOR = '[data-theme]'

/** The theme a marker declares; a `data-theme` outside light and dark declares nothing. */
export function themeOfMarker(marker: ThemeMarker | null): Theme | undefined {
  if (!marker) return undefined
  const attr = marker.getAttribute('data-theme')
  return attr === 'dark' || attr === 'light' ? attr : undefined
}

/** What the host has decided ABOVE `el`: the nearest marking ancestor, else the OS. */
export function hostTheme(el: Element | null): Theme {
  // No window (a server render, the harness): light, the same answer as a host that declares nothing.
  if (typeof window === 'undefined') return 'light'
  let marker: Element | null = el?.parentElement?.closest(THEME_MARKER_SELECTOR) ?? null
  while (marker) {
    const theme = themeOfMarker(marker)
    if (theme) return theme
    marker = marker.parentElement?.closest(THEME_MARKER_SELECTOR) ?? null
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The host's theme for the element at `ref`, re-read when any ancestor's
 * `data-theme` changes and when the OS preference changes.
 */
export function useHostTheme(ref: React.RefObject<HTMLElement | null>): Theme {
  const [host, setHost] = React.useState<Theme>(() => hostTheme(ref.current))
  // A layout effect: the ref is empty on the first render, so the first
  // answer is read once the element exists and before anything is painted.
  useIsomorphicLayoutEffect(() => {
    const read = () => setHost(hostTheme(ref.current))
    read()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'], subtree: true })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener?.('change', read)
    return () => { observer.disconnect(); media?.removeEventListener?.('change', read) }
  }, [ref])
  return host
}

/** The resolved theme for the pane rooted at `ref`, given the user's choice. */
export function useTheme(ref: React.RefObject<HTMLElement | null>, choice: ThemeChoice): Theme {
  const host = useHostTheme(ref)
  return choice === 'system' ? host : choice
}
