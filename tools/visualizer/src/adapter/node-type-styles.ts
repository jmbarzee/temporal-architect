// Runtime CSS generator for node-type variables and component rules.
//
// Called once at app mount to inject a <style> element derived entirely from
// NODE_TYPE_REGISTRY. Deletes the need for hand-maintained per-type blocks in
// index.css: adding a new node type to the registry automatically produces
// its CSS variables, dual-range fill, dual-range thumb border, and
// graph-control-typed-* colour assignment.

import { ALL_NODE_TYPES, NODE_TYPE_REGISTRY } from './node-types'

/**
 * Generate the CSS string that should be injected at mount time.
 * Produces:
 *   :root { --color-<suffix>: <fill>; --color-<suffix>-border: <border>; ... }
 *   [data-theme="dark"], .vscode-dark { ... dark overrides ... }
 *   .graph-control-typed-<nodeType> { --type-color: var(--color-<suffix>); }
 *   .dual-range-<nodeType> .dual-range-fill { background: <fill>; }
 *   .dual-range-<nodeType> .dual-range-input::-webkit-slider-thumb { border-color: <fill>; }
 *   .dual-range-<nodeType> .dual-range-input::-moz-range-thumb { border-color: <fill>; }
 */
export function buildNodeTypeCSS(): string {
  const lightVars: string[] = []
  const darkVars: string[] = []
  const typedClasses: string[] = []
  const dualRangeRules: string[] = []

  for (const t of ALL_NODE_TYPES) {
    const def = NODE_TYPE_REGISTRY[t]
    const s = def.color.cssVarSuffix
    const fill       = def.color.fill
    const border     = def.color.border
    const fillDark   = def.color.fillDark   ?? fill
    const borderDark = def.color.borderDark ?? border

    // Light theme CSS variables
    lightVars.push(`  --color-${s}: ${fill};`)
    lightVars.push(`  --color-${s}-border: ${border};`)

    // Dark theme overrides (only emit if different from light)
    if (fillDark !== fill)     darkVars.push(`  --color-${s}: ${fillDark};`)
    if (borderDark !== border) darkVars.push(`  --color-${s}-border: ${borderDark};`)

    // Control panel typed row: maps nodeType class → CSS var
    typedClasses.push(`.graph-control-typed-${t} { --type-color: var(--color-${s}); }`)

    // Dual-range fill and thumb colours
    const rangeColor = fillDark  // use dark-theme fill as the range accent (more visible on white)
    dualRangeRules.push(`.dual-range-${t} .dual-range-fill { background: ${fill}; }`)
    dualRangeRules.push(`.dual-range-${t} .dual-range-input::-webkit-slider-thumb { border-color: ${rangeColor}; }`)
    dualRangeRules.push(`.dual-range-${t} .dual-range-input::-moz-range-thumb { border-color: ${rangeColor}; }`)
  }

  const parts: string[] = [
    `:root {\n${lightVars.join('\n')}\n}`,
  ]
  if (darkVars.length > 0) {
    parts.push(`.vscode-dark,\n[data-theme="dark"] {\n${darkVars.join('\n')}\n}`)
  }
  parts.push(...typedClasses)
  parts.push(...dualRangeRules)

  return parts.join('\n')
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
