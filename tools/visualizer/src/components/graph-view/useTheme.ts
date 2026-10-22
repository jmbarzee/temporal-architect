// The pane's theme (D57, R21). The user's choice is system, light or dark;
// the resolved theme is that choice, or — for system — the host's, read from
// an ancestor's `.vscode-dark` / `[data-theme]` and otherwise from
// `prefers-color-scheme`, and observed so a host that switches mid-session is
// followed.

import React from 'react'
import type { Theme } from '../../graph/scheme'

export type ThemeChoice = 'system' | Theme

export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/** What the host has decided for `el`: the nearest ancestor that says, else the OS. */
export function hostTheme(el: Element | null): Theme {
  if (typeof window === 'undefined') return 'light'
  const themed = el?.closest('[data-theme], .vscode-dark, .vscode-light, .vscode-high-contrast')
  if (themed) {
    const attr = themed.getAttribute('data-theme')
    if (attr === 'dark' || attr === 'light') return attr
    if (themed.classList.contains('vscode-dark') || themed.classList.contains('vscode-high-contrast')) return 'dark'
    return 'light'
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The resolved theme for the pane rooted at `ref`, given the user's choice.
 * Re-reads the host when any ancestor's class or `data-theme` changes and
 * when the OS preference changes.
 */
export function useTheme(ref: React.RefObject<HTMLElement | null>, choice: ThemeChoice): Theme {
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
  return choice === 'system' ? host : choice
}
