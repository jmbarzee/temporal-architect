import React from 'react'
import { SingleGearIcon, InterlockingGearsIcon } from '../components/icons/GearIcons'
import { ALL_NODE_TYPES, DEFAULT_ONTOLOGY } from '../adapter/node-types'
import { DEF_TYPE_DIMENSION } from '../graph/dimension'

// --- Core types ---

export interface PrimitiveTheme {
  icon: string
  label: string
  cssVarPrefix: string
  /** Font-size (px) override for the text glyph. Defaults to the CSS base. */
  iconSize?: number
  SvgIcon?: React.ComponentType<{ size?: number }>
}

export type PrimitiveKind =
  | 'workflow' | 'activity' | 'worker' | 'namespace'
  | 'nexusService' | 'nexusOperation' | 'nexusEndpoint' | 'nexusCall'
  | 'signal' | 'query' | 'update'
  | 'timer' | 'conditionSet' | 'conditionUnset'
  | 'promise' | 'return'
  | 'closeComplete' | 'closeFail' | 'closeContinueAsNew'
  | 'forLoop' | 'awaitAll' | 'raw' | 'breakContinue' | 'error'

// --- Central theme map ---

export const THEME: Record<PrimitiveKind, PrimitiveTheme> = {
  workflow:           { icon: '⚙⚙', label: 'Workflow',              cssVarPrefix: 'workflow',         SvgIcon: InterlockingGearsIcon },
  activity:           { icon: '⚙',   label: 'Activity',              cssVarPrefix: 'activity',         SvgIcon: SingleGearIcon },
  worker:             { icon: '□',   label: 'Worker',                cssVarPrefix: 'worker' },
  namespace:          { icon: '⧉',   label: 'Namespace',             cssVarPrefix: 'namespace',        iconSize: 16 },
  nexusService:       { icon: '★',   label: 'Nexus Service',         cssVarPrefix: 'nexus-service',    iconSize: 16 },
  nexusOperation:     { icon: '☆',   label: 'Nexus Operation',       cssVarPrefix: 'nexus-operation' },
  nexusEndpoint:      { icon: '⌖',   label: 'Nexus Endpoint',        cssVarPrefix: 'nexus-endpoint' },
  nexusCall:          { icon: '☆',   label: 'Nexus Call',            cssVarPrefix: 'nexus' },
  signal:             { icon: '↪',   label: 'Signal',                cssVarPrefix: 'signal' },
  query:              { icon: '↩',   label: 'Query',                 cssVarPrefix: 'query' },
  update:             { icon: '⇄',   label: 'Update',                cssVarPrefix: 'update' },
  timer:              { icon: '⏱',   label: 'Timer',                 cssVarPrefix: 'timer' },
  conditionSet:       { icon: '◉',   label: 'Set Condition',         cssVarPrefix: 'subtle' },
  conditionUnset:     { icon: '○',   label: 'Unset Condition',       cssVarPrefix: 'subtle' },
  promise:            { icon: '◇',   label: 'Promise',               cssVarPrefix: 'promise' },
  return:             { icon: '↩',   label: 'Return',                cssVarPrefix: 'return' },
  closeComplete:      { icon: '✓',   label: 'Close (Complete)',      cssVarPrefix: 'return' },
  closeFail:          { icon: '✕',   label: 'Close (Fail)',          cssVarPrefix: 'signal' },
  closeContinueAsNew: { icon: '⟳',   label: 'Close (Continue As New)', cssVarPrefix: 'continue-new' },
  forLoop:            { icon: '↻',   label: 'For Loop',              cssVarPrefix: 'control' },
  awaitAll:           { icon: '⫴',   label: 'Await All',             cssVarPrefix: 'control' },
  raw:                { icon: '≡',   label: 'Raw Code',              cssVarPrefix: 'raw' },
  breakContinue:      { icon: '•',   label: 'Break/Continue',        cssVarPrefix: 'subtle' },
  error:              { icon: '⚠',   label: 'Error',                 cssVarPrefix: 'signal' },
}

// --- Derived lookup tables ---

export interface DefTypeConfig {
  type: string
  icon: string
  label: string
  defaultOn: boolean
}

// Generate DEF_TYPE_CONFIGS from the taxonomy so icon, label, and defaultOn
// stay in sync with the entries without a separate hand-maintained list.
//
// Resolved through the ontology rather than by indexing the registry object.
// The difference is not cosmetic: `styleForKey` answers a key it does not know
// with the declared neutral style, where `REGISTRY[t]` returns `undefined` and
// the failure surfaces later as a blank icon or an unreadable label (T16).
//
// The plural label follows standard English: 'y' → 'ies', else append 's'.
function pluralize(label: string): string {
  const last = label.split(' ').pop() ?? label
  if (last.endsWith('y')) return label.slice(0, -1) + 'ies'
  return label + 's'
}

export const DEF_TYPE_CONFIGS: DefTypeConfig[] = ALL_NODE_TYPES.map(t => {
  const style = DEFAULT_ONTOLOGY.styleForKey(t)
  return {
    type:      style.defType,
    icon:      style.icon,
    label:     pluralize(style.label),
    defaultOn: style.defaultVisible,
  }
})

export const DEF_TYPE_ORDER = new Map(DEF_TYPE_CONFIGS.map((cfg, i) => [cfg.type, i]))

/**
 * One entry per filter chip shown in both the Tree and Graph filter bars.
 * The nexus types are consolidated into a single 'nexus' group chip so both
 * views stay in sync. This is the single source of truth for the chip layout —
 * TreeView and GraphView both import and render from this list.
 */
export interface ViewFilterEntry {
  /** CSS class suffix: `header-type-<id>`. Also used as the React key. */
  id: string
  icon: string
  label: string
  /**
   * The defTypes this chip controls. For single-type chips this is a
   * one-element array; for the Nexus group chip it covers all three nexus
   * def types. Toggling the chip adds/removes ALL of these from visibleTypes.
   */
  types: readonly string[]
}

/**
 * The chip layer, derived from the kind axis's descriptor.
 *
 * Declared once, in `adapter/node-types.ts`, and projected here into the shape
 * the tree view already consumes. It was briefly declared in BOTH places, and
 * the total-vocabulary ceiling caught that within a minute (+23) — a grouping
 * stored twice is exactly the shape PLAN §6.6 is about, and having a counter
 * notice it is the point of D40.
 */
export const VIEW_FILTER_ENTRIES: readonly ViewFilterEntry[] =
  (DEFAULT_ONTOLOGY.descriptorFor(DEF_TYPE_DIMENSION)?.chipsFor([]) ?? []).map(chip => ({
    id: chip.id,
    icon: chip.icon ?? '',
    label: chip.label,
    types: chip.values,
  }))

export const HANDLER_CONFIG = {
  signalDecl: { icon: THEME.signal.icon, keyword: 'signal', cssClass: 'declaration-signal' },
  queryDecl:  { icon: THEME.query.icon,  keyword: 'query',  cssClass: 'declaration-query' },
  updateDecl: { icon: THEME.update.icon, keyword: 'update', cssClass: 'declaration-update' },
} as const

export const CLOSE_REASON_THEME: Record<string, PrimitiveTheme> = {
  complete:        THEME.closeComplete,
  fail:            THEME.closeFail,
  continue_as_new: THEME.closeContinueAsNew,
}

export const AWAIT_TARGET_THEME: Record<string, PrimitiveTheme> = {
  timer:    THEME.timer,
  signal:   THEME.signal,
  update:   THEME.update,
  activity: THEME.activity,
  workflow: THEME.workflow,
  nexus:    THEME.nexusCall,
  ident:    THEME.conditionSet,
}

export const WORKER_REF_THEME: Record<string, PrimitiveTheme> = {
  workflow: THEME.workflow,
  activity: THEME.activity,
  service:  THEME.nexusService,
}

// --- Helper component ---

/**
 * Central block-header icon. Renders inside a fixed 16px square so the glyph
 * never changes the row height or shifts the toggle/keyword alignment, and
 * workflow/activity always render their SVG gears (no text fallback) so they
 * look identical everywhere. This is the single place that owns icon
 * formatting — call sites just pass a `kind`.
 */
export function BlockIcon({ kind }: { kind: PrimitiveKind }) {
  const entry = THEME[kind]
  return (
    <span
      className="block-icon"
      style={entry.iconSize ? { fontSize: `${entry.iconSize}px` } : undefined}
    >
      {entry.SvgIcon ? <entry.SvgIcon size={14} /> : entry.icon}
    </span>
  )
}
