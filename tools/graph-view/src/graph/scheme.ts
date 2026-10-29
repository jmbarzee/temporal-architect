// The colour scheme — what a taxonomy's colours look like, in both themes at
// once, and the three readers that turn them into pixels: the custom-property
// name a value's colour is published under, the inline variables a pane
// carries for the resolved theme, and a colour normaliser for the canvas,
// which cannot throw (T4) and so reads only the forms the taxonomy admits (T6).

import type { DimensionValue } from './dimension'
import type { Ontology } from './ontology'

export type Theme = 'light' | 'dark'
export const THEMES: readonly Theme[] = ['light', 'dark']

export interface ColorPair {
  /** Canvas fill colour. */
  readonly fill: string
  /** Canvas border colour, a few stops darker than the fill. */
  readonly border: string
}

/** A value's colour in both themes — declared together, so no half can go missing. */
export interface ThemedColor {
  readonly light: ColorPair
  readonly dark: ColorPair
}

/** How an edge type is stroked: its colour per theme, base alpha, dash pattern and width. */
export interface EdgeStroke {
  readonly color: { readonly light: string; readonly dark: string }
  readonly alpha: number
  readonly dash: readonly number[]
  readonly width: number
}

/**
 * The stem of a value's custom-property name: the value id in kebab case
 * (`twoWords` → `two-words`). Derived, never stored.
 */
export function cssSuffix(value: DimensionValue): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/**
 * The custom property a value's fill is published under (`--gv-node-<suffix>`;
 * `-border` for its border). The `gv-` prefix keeps it from a host's own
 * properties, and its own `node-` stem apart from the chrome's tokens
 * (`--gv-color-*`): a value id may be anything a host names (D58).
 */
export const colorVar = (value: DimensionValue): string => `--gv-node-${cssSuffix(value)}`

/**
 * The inline custom properties a pane carries for one theme: every style
 * value's fill and border. Set on the pane's root, they are what tokens, chip
 * tints and typed rows read, and they follow the resolved theme by being
 * recomputed, not overridden.
 */
export function schemeVars(ontology: Ontology, theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const key of ontology.nodeTypeKeys) {
    const c = ontology.styleForKey(key).color[theme]
    vars[colorVar(key)] = c.fill
    vars[`${colorVar(key)}-border`] = c.border
  }
  return vars
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i

/**
 * The red, green and blue of a scheme colour, or undefined. A scheme colour
 * is hex of either length or `rgb()`/`rgba()` — a form every reader can parse
 * without a browser, so the taxonomy can refuse anything else at
 * construction (`isSchemeColor`) and no reader meets a colour it cannot read.
 */
export function rgbOf(color: string): readonly [number, number, number] | undefined {
  const c = color.trim()
  let m = HEX6.exec(c)
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
  m = HEX3.exec(c)
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)]
  m = RGB.exec(c)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return undefined
}

export const isSchemeColor = (color: string): boolean => rgbOf(color) !== undefined

const NEUTRAL: readonly [number, number, number] = [148, 163, 184]
const REFUSED = new Set<string>()

/**
 * A colour at an alpha, as `rgba()`, for a canvas gradient or fill. A colour
 * outside the scheme's forms becomes a neutral grey, said once per colour on
 * the console — never a throw, because this runs inside the draw loop (T4,
 * T6). Unreachable for a taxonomy's colours, which are refused at
 * construction; it guards the library's own group palette and any caller
 * that bypasses the taxonomy.
 */
export function withAlpha(color: string, alpha: number): string {
  let rgb = rgbOf(color)
  if (!rgb) {
    if (!REFUSED.has(color)) {
      REFUSED.add(color)
      console.error(`[scheme] ${JSON.stringify(color)} is not a colour the canvas can read; drawing it neutral`)
    }
    rgb = NEUTRAL
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

/**
 * A stylesheet for a host's own CSS: every style value's fill and border on
 * `:root`, and the dark values that differ under `[data-theme="dark"]` — the
 * one selector the library themes by. The pane does not read this — it
 * carries `schemeVars` inline — so a host that styles nothing of its own by
 * node value never needs it.
 */
export function schemeStylesheet(ontology: Ontology): string {
  const lightVars: string[] = []
  const darkVars: string[] = []
  for (const key of ontology.nodeTypeKeys) {
    const { light, dark } = ontology.styleForKey(key).color
    const v = colorVar(key)
    lightVars.push(`  ${v}: ${light.fill};`)
    lightVars.push(`  ${v}-border: ${light.border};`)
    if (dark.fill !== light.fill) darkVars.push(`  ${v}: ${dark.fill};`)
    if (dark.border !== light.border) darkVars.push(`  ${v}-border: ${dark.border};`)
  }
  const parts: string[] = [`:root {\n${lightVars.join('\n')}\n}`]
  if (darkVars.length > 0) parts.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`)
  return parts.join('\n')
}
