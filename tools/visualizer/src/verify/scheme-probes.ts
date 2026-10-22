// The colour scheme's declared invariants, each with a reader (D57): the
// custom-property naming rule, the colour normaliser's table, the inline
// variables a pane carries under the default palette and under a second one,
// and the stroke every edge type declares. Colour values appear here as a
// host's declaration — what the pane publishes — not as a rendering claim;
// what the canvas does with them is Gate 5's.

import { DEFAULT_ONTOLOGY, DEFAULT_ONTOLOGY_SPEC, NODE_TYPE_REGISTRY, ALL_NODE_TYPES } from '../adapter/node-types'
import { createOntology } from '../graph/ontology'
import type { NodeTypeDefinition } from '../graph/taxonomy'
import { THEMES, cssSuffix, colorVar, rgbOf, schemeVars, withAlpha } from '../graph/scheme'
import { themeChoiceOf, themeOfMarker } from '../components/graph-view/useTheme'
import type { ThemeMarker } from '../components/graph-view/useTheme'
import type { Json } from './snapshot'
import { sortedRecord } from './snapshot'

/** What a call threw, as the row records it; 'returned' when it did not. */
function thrown(run: () => unknown): string {
  try { run(); return 'returned' } catch (e) { return (e as Error).message }
}

/** A marker stand-in: what an element with these classes and this attribute would say. */
function marker(classes: string[], dataTheme?: string): ThemeMarker {
  return { getAttribute: name => (name === 'data-theme' ? dataTheme ?? null : null), classList: { contains: c => classes.includes(c) } }
}

/** The shipped palette with every colour replaced: the same keys, a second scheme. */
function restyled(): Record<string, NodeTypeDefinition> {
  const out: Record<string, NodeTypeDefinition> = {}
  ALL_NODE_TYPES.forEach((t, i) => {
    const hex = (n: number) => `#${(0x101010 * (i + 1) + n).toString(16).padStart(6, '0')}`
    out[t] = { ...NODE_TYPE_REGISTRY[t], color: { light: { fill: hex(0), border: hex(1) }, dark: { fill: hex(2), border: hex(3) } } }
  })
  return out
}

export function schemeProbes(): Json {
  const second = createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeStyles: restyled() as typeof NODE_TYPE_REGISTRY })
  const defaults = Object.fromEntries(THEMES.map(th => [th, schemeVars(DEFAULT_ONTOLOGY, th)]))
  const seconds = Object.fromEntries(THEMES.map(th => [th, schemeVars(second, th)]))
  const sameNames = THEMES.every(th => JSON.stringify(Object.keys(defaults[th]).sort()) === JSON.stringify(Object.keys(seconds[th]).sort()))
  const allDiffer = THEMES.every(th => Object.keys(defaults[th]).every(k => defaults[th][k] !== seconds[th][k]))
  return {
    // The naming rule: kebab-case of the value id, so `--color-nexus-endpoint`
    // is derived, never stored.
    suffixes: sortedRecord(['namespace', 'nexusEndpoint', 'nexusService', 'twoWords', 'ALLCAPS', 'with space', 'a1B2'].map(v => [v, cssSuffix(v)] as const)),
    variableFor: colorVar('nexusEndpoint'),
    // What the canvas can read, and what it does with what it cannot (T6):
    // never a throw, a neutral instead.
    normaliser: sortedRecord(['#abc', '#AABBCC', 'rgb(1, 2, 3)', 'rgba(4,5,6,0.5)', 'rgb(7 8 9 / 50%)', 'not-a-colour', 'var(--x)', ''].map(c => {
      const rgb = rgbOf(c)
      return [c || '<empty>', { rgb: rgb ? [...rgb] : null, withAlpha: withAlpha(c, 0.5) }] as const
    })),
    // The inline variables under the shipped palette, per theme; the dark half
    // differs from the light one for every value that declares a different one.
    defaultVars: defaults,
    // A second palette publishes the same names with other values: swapping
    // the scheme is swapping the taxonomy's colours, nothing else (R10, R15).
    secondScheme: { sameNames, allDiffer },
    // Every edge type's stroke, as declared, per theme.
    strokes: sortedRecord(DEFAULT_ONTOLOGY.edgeTypes.map(e => [e.id, {
      light: e.style.color.light, dark: e.style.color.dark, alpha: e.style.alpha, dash: [...e.style.dash], width: e.style.width,
    }] as const)),
    strokeForUnknown: (() => { try { DEFAULT_ONTOLOGY.edgeStrokeFor('not-a-type'); return 'returned' } catch (e) { return (e as Error).message } })(),
    // What the taxonomy refuses at construction (D58): two values sharing a
    // custom-property name, a value with none, a colour no reader can parse.
    refusals: {
      sharedSuffix: thrown(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeTypeKeys: [...ALL_NODE_TYPES, 'nexus-endpoint'], nodeStyles: { ...NODE_TYPE_REGISTRY, 'nexus-endpoint': NODE_TYPE_REGISTRY.nexusEndpoint } as typeof NODE_TYPE_REGISTRY })),
      emptySuffix: thrown(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeTypeKeys: [...ALL_NODE_TYPES, '工作流'], nodeStyles: { ...NODE_TYPE_REGISTRY, '工作流': NODE_TYPE_REGISTRY.workflow } as typeof NODE_TYPE_REGISTRY })),
      namedColour: thrown(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, nodeStyles: { ...NODE_TYPE_REGISTRY, worker: { ...NODE_TYPE_REGISTRY.worker, color: { light: { fill: 'slategray', border: '#000' }, dark: NODE_TYPE_REGISTRY.worker.color.dark } } } as typeof NODE_TYPE_REGISTRY })),
      cssVariableColour: thrown(() => createOntology({ ...DEFAULT_ONTOLOGY_SPEC, edgeTypes: DEFAULT_ONTOLOGY_SPEC.edgeTypes.map((e, i) => (i === 0 ? { ...e, style: { ...e.style, color: { light: 'var(--x)', dark: e.style.color.dark } } } : e)) })),
    },
    // The theme a marker declares (D58): VS Code's high-contrast LIGHT webview
    // carries the plain high-contrast class too, so light is read first.
    markers: {
      lightHost: themeOfMarker(marker(['vscode-light'])) ?? null,
      darkHost: themeOfMarker(marker(['vscode-dark'])) ?? null,
      highContrastDark: themeOfMarker(marker(['vscode-high-contrast'])) ?? null,
      highContrastLight: themeOfMarker(marker(['vscode-high-contrast', 'vscode-high-contrast-light'])) ?? null,
      dataThemeDark: themeOfMarker(marker([], 'dark')) ?? null,
      dataThemeOther: themeOfMarker(marker([], 'sepia')) ?? null,
      none: themeOfMarker(null) ?? null,
    },
    // A persisted choice outside the three is system, not a throw in render (D4).
    choices: { dark: themeChoiceOf('dark'), light: themeChoiceOf('light'), bogus: themeChoiceOf('bogus'), absent: themeChoiceOf(undefined) },
    // Sizes ride the same object: the registry's, per value (R11, D14).
    sizes: sortedRecord(ALL_NODE_TYPES.map(t => [t, { r: NODE_TYPE_REGISTRY[t].size.r, iconSize: NODE_TYPE_REGISTRY[t].size.iconSize }] as const)),
  }
}
