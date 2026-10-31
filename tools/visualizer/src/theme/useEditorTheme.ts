// The editor's theme, when this host runs as a VS Code webview. VS Code marks
// the body with `vscode-light`, `vscode-dark`, `vscode-high-contrast` (and
// `vscode-high-contrast-light` beside it for a light high-contrast theme);
// this hook reads those classes and follows them when they change. The
// library knows nothing of the editor (D67): the shell turns the answer into
// a `data-theme` on its root, which is the one signal the library reads.

import React from 'react'
import type { Theme } from '@temporal-architect/graph-view'

const EDITOR_CLASSES = ['vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light']

/** What the editor's body classes declare, or undefined outside the editor. */
export function editorTheme(body: { classList: { contains(name: string): boolean } } | null): Theme | undefined {
  if (!body) return undefined
  if (body.classList.contains('vscode-high-contrast-light') || body.classList.contains('vscode-light')) return 'light'
  if (body.classList.contains('vscode-dark') || body.classList.contains('vscode-high-contrast')) return 'dark'
  return undefined
}

export function useEditorTheme(): Theme | undefined {
  const [theme, setTheme] = React.useState<Theme | undefined>(() =>
    typeof document === 'undefined' ? undefined : editorTheme(document.body))
  React.useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const read = () => setTheme(editorTheme(document.body))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

export { EDITOR_CLASSES }
