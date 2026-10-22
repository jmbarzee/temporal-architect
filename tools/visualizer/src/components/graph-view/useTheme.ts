// The pane's theme (D57, D58, R21). The user's choice is system, light or
// dark; the resolved theme is that choice, or — for system — the host's, read
// from the nearest ancestor that says (a `data-theme`, or VS Code's body
// classes) and otherwise from `prefers-color-scheme`, observed so a host that
// switches mid-session is followed. The pane then carries the resolved theme
// as its own `data-theme`, so its stylesheet tokens follow the same answer
// the canvas draws with — one resolver, not two.

import React from 'react'
import type { Theme } from '../../graph/scheme'

export type ThemeChoice = 'system' | Theme

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** A persisted or host-supplied choice, or system for anything outside the three (D4: discard the field, not the state). */
export function themeChoiceOf(value: unknown): ThemeChoice {
  return (THEME_CHOICES as readonly unknown[]).includes(value) ? (value as ThemeChoice) : 'system'
}

/** What an element that marks a theme says: a `data-theme`, or a VS Code body class. */
export interface ThemeMarker {
  getAttribute(name: string): string | null
  classList: { contains(name: string): boolean }
}

export const THEME_MARKER_SELECTOR = '[data-theme], .vscode-dark, .vscode-light, .vscode-high-contrast, .vscode-high-contrast-light'

/**
 * The theme a marker declares. VS Code adds `vscode-high-contrast` to a
 * high-contrast LIGHT webview too (beside `vscode-high-contrast-light`), so the
 * light class is read first; a marker with a `data-theme` outside light/dark
 * declares nothing.
 */
export function themeOfMarker(marker: ThemeMarker | null): Theme | undefined {
  if (!marker) return undefined
  const attr = marker.getAttribute('data-theme')
  if (attr === 'dark' || attr === 'light') return attr
  if (marker.classList.contains('vscode-high-contrast-light') || marker.classList.contains('vscode-light')) return 'light'
  if (marker.classList.contains('vscode-dark') || marker.classList.contains('vscode-high-contrast')) return 'dark'
  return undefined
}

/** What the host has decided ABOVE `el`: the nearest marking ancestor, else the OS. */
export function hostTheme(el: Element | null): Theme {
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
 * class or `data-theme` changes and when the OS preference changes.
 */
export function useHostTheme(ref: React.RefObject<HTMLElement | null>): Theme {
  const [host, setHost] = React.useState<Theme>(() => hostTheme(ref.current))
  React.useEffect(() => {
    const read = () => setHost(hostTheme(ref.current))
    read()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'], subtree: true })
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
