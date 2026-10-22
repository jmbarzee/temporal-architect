// Runtime CSS for a host's own stylesheets: every style value's colour, in
// both themes, published on :root as `--node-<suffix>` / `-border`.
//
// The library's own components no longer read these — the graph pane carries
// the same variables inline, in its resolved theme (D57) — so this exists for
// a host whose CSS styles something of its own by node type. Mounted once at
// app start; idempotent. The text is the scheme's (`schemeStylesheet`); this
// module only mounts it for the shipped taxonomy.

import { DEFAULT_ONTOLOGY } from './node-types'
import { schemeStylesheet } from '@temporal-architect/graph-view'
/** The CSS string to inject for the shipped taxonomy. */
export function buildNodeTypeCSS(): string {
  return schemeStylesheet(DEFAULT_ONTOLOGY)
}

/** Mount (or refresh) the node-type stylesheet. Idempotent — reuses the same <style> element on re-calls. */
export function mountNodeTypeStyles(): void {
  if (typeof document === 'undefined') return
  const ID = 'twf-node-type-styles'
  let el = document.getElementById(ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = ID
    document.head.appendChild(el)
  }
  el.textContent = buildNodeTypeCSS()
}
