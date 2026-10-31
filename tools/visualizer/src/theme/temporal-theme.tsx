import React from 'react'
import { SingleGearIcon, InterlockingGearsIcon } from '../components/icons/GearIcons'
import { ALL_NODE_TYPES, DEFAULT_ONTOLOGY } from '../adapter/node-types'
import type { NodeType } from '../adapter/node-types'

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

// The three nexus def types are consolidated into a single "Nexus" filter
// chip in both the graph view and the tree view. This constant names the group
// so chip-toggle and recentlyChanged tracking can reference them without
// repeating the literal strings. The individual entries remain in
// DEF_TYPE_CONFIGS so the tree-view sort order and the shared filter
// contract (visibleTypes Set) continue to use individual type keys.
export const NEXUS_GROUP_DEF_TYPES = [
  'nexusEndpointDef', 'nexusServiceDef', 'nexusOperationDef',
] as const

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
 * The icon a chip borrows from the value it fronts.
 *
 * Typed `NodeType`, not `string`, and that is the whole point of the parameter.
 * Resolving through the container was the B36 fix; taking a bare `string` while
 * doing it would have been a regression, because the five call sites below are
 * literals and `styleForKey` swallows an unknown key into a placeholder plus a
 * `console.warn`. A typo would then survive typecheck, leak, boundary, pattern
 * and every golden — its only trace a warning printed next to two intentional
 * ones from the fixtures, which is indistinguishable from expected noise.
 *
 * Narrowing the parameter keeps the compile-time key check the direct property
 * access used to give, without going back to indexing the registry object.
 */
const chipIcon = (key: NodeType): string => DEFAULT_ONTOLOGY.styleForKey(key).icon

// Which chips exist, and how they group, is a domain choice — five chips over
// seven filter keys, with the three nexus keys folded into one. That grouping
// stays declared here. What changed is the *lookup*: these were five direct
// property accesses (`NODE_TYPE_REGISTRY.namespace.icon`), which is the one
// shape a dynamic-key generalization cannot follow, because the key is spelled
// into the expression rather than passed to it (T16).
export const VIEW_FILTER_ENTRIES: readonly ViewFilterEntry[] = [
  { id: 'namespaceDef', icon: chipIcon('namespace'),     label: 'Namespaces', types: ['namespaceDef'] },
  { id: 'workerDef',    icon: chipIcon('worker'),        label: 'Workers',    types: ['workerDef'] },
  { id: 'nexus',        icon: chipIcon('nexusEndpoint'), label: 'Nexus',      types: NEXUS_GROUP_DEF_TYPES },
  { id: 'workflowDef',  icon: chipIcon('workflow'),      label: 'Workflows',  types: ['workflowDef'] },
  { id: 'activityDef',  icon: chipIcon('activity'),      label: 'Activities', types: ['activityDef'] },
]

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
