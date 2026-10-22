// Shared filter bar for both the Tree and Graph views.
//
// Owns the markup that used to be duplicated in TreeView and GraphView: the
// file chips, the definition-type chips, the search control, and — at the
// bottom — the error/warning bars. Defining it once is what keeps the two
// views' toolbars in lockstep (spec § Unified Filter Bar / § Error Handling).
//
// View-specific extras (the Tree's "N of M" search counter, the Graph's
// hidden-match "+N" badge) are passed in as `searchExtra`; everything else
// is identical across views.

import { useOntology } from './graph-view/useOntology'
import { colorVar } from '../graph/scheme'
import type { DimensionValue } from '../graph/dimension'
import type { Ontology } from '../graph/ontology'

// A chip's tint names a style value; one that names nothing declared is a
// host bug, said once per chip on the console rather than thrown in render
// (T4), and the chip draws neutral.
const UNDECLARED_TINTS = new Set<string>()
function tintOf(chipId: string, tint: DimensionValue, ontology: Ontology): DimensionValue {
  if (ontology.nodeTypeKeys.includes(tint)) return tint
  if (!UNDECLARED_TINTS.has(chipId)) {
    UNDECLARED_TINTS.add(chipId)
    console.error(`[filter] chip ${JSON.stringify(chipId)} borrows the colour of ${JSON.stringify(tint)}, which the taxonomy does not declare`)
  }
  return tint
}
import { selectionFor } from '../filter/types'
import React from 'react'
import './FilterBar.css'
import { DEF_TYPE_DIMENSION, SOURCE_FILE_DIMENSION } from '../graph/dimension'
import { pinnedFor, withPin, withSelection } from '../filter/types'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { toggleGroup } from '../filter/toggle'
import { PinToggle } from './PinToggle'
import { SearchIcon } from './icons/SearchIcon'

const NO_COUNTS: ReadonlyMap<string, number> = new Map()

interface FilterBarProps {
  /** Chip badge counts per axis and value, read by the host off its own data. */
  counts: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** Unique source files driving the file chips (each view computes its own). */
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  pins: PinState
  onPinsChange: (next: PinState) => void
  /** Dimensions a recent focus transition bypassed — drives the pin flash. */
  overriddenPins: Set<FilterDimension>
  /** File/type keys that just turned on — drives the chip flash animation. */
  recentlyChanged: Set<string>
  searchQuery: string
  searchActive: boolean
  onSearchChange: (query: string, active: boolean) => void
  searchInputRef: React.RefObject<HTMLInputElement>
  searchTitle: string
  searchPlaceholder: string
  /** View-specific search adornment rendered inside the search control. */
  searchExtra?: React.ReactNode
  /** Per-chip hidden-match badges (Tree view search). Optional. */
  hiddenMatchByType?: Map<string, number>
  hiddenMatchByFile?: Map<string, number>
  /** The axes shown, in order. R17/R18/R19: editable, and may be empty. */
  chain: readonly string[]
  /**
   * Values available per axis, read off the data by the host — the one source
   * every axis's chips are built from, files and kinds included. Required:
   * when it was optional, one mount omitted it and the kind axis silently
   * stopped being re-addable there. An axis with no entry renders an empty,
   * explicitly-disabled section rather than vanishing.
   */
  valuesByDimension: ReadonlyMap<string, readonly string[]>
  /** Omitted by a host that does not want the chain edited in place. */
  onChainChange?: (next: readonly string[]) => void
  /** The host's findings bars, rendered under the chips. */
  findings?: React.ReactNode
  /** Tree view flashes the whole header on AST refresh. */
  refreshFlash?: boolean
}

export function FilterBar({
  counts,
  filter,
  onFilterChange,
  pins,
  onPinsChange,
  overriddenPins,
  recentlyChanged,
  searchQuery,
  searchActive,
  onSearchChange,
  searchInputRef,
  searchTitle,
  searchPlaceholder,
  searchExtra,
  hiddenMatchByType,
  hiddenMatchByFile,
  findings,
  refreshFlash,
  chain,
  onChainChange,
  valuesByDimension,
}: FilterBarProps) {
  const ontology = useOntology()

  // **The only place this bar names an axis.** Everything below loops over the
  // chain and reads the rest from descriptors. What is left here is presentation
  // and data-sourcing: which values exist, their counts, and the CSS classes the
  // current stylesheet keys on. Unit 6 owns the class names (B30's hand-written
  // chip tints) and Unit 7 replaces the value sourcing with the post-filter
  // visible set, so this table is where both land.
  const PRESENTATION = React.useMemo(() => new Map<string, {
    values: string[]
    counts: ReadonlyMap<string, number>
    hidden?: Map<string, number>
    sectionClass: string
    rowClass: string
    chipClass: string
    /** Per-chip modifier stem the stylesheet keys on, or '' for none. */
    modifierPrefix: string
    activeClass: string
    iconClass: string
    labelClass: string
  }>([
    [SOURCE_FILE_DIMENSION, {
      values: [...(valuesByDimension.get(SOURCE_FILE_DIMENSION) ?? [])],
      counts: counts.get(SOURCE_FILE_DIMENSION) ?? NO_COUNTS,
      hidden: hiddenMatchByFile,
      sectionClass: 'header-files-section',
      rowClass: 'header-files-row',
      chipClass: 'header-file-tag',
      // File chips have never had a per-file modifier class.
      modifierPrefix: '',
      activeClass: 'selected',
      iconClass: 'header-file-icon',
      labelClass: 'header-file-name',
    }],
    [DEF_TYPE_DIMENSION, {
      values: [...(valuesByDimension.get(DEF_TYPE_DIMENSION) ?? [])],
      counts: counts.get(DEF_TYPE_DIMENSION) ?? NO_COUNTS,
      hidden: hiddenMatchByType,
      sectionClass: 'header-types-section',
      rowClass: 'header-types-row',
      chipClass: 'header-type-tag',
      // `header-type-<id>`, NOT `header-type-tag-<id>`: FilterBar.css keys the
      // eight per-kind tints on the former, and deriving the modifier from
      // chipClass silently killed every one of them.
      modifierPrefix: 'header-type',
      activeClass: 'active',
      iconClass: 'header-type-icon',
      labelClass: 'header-type-label',
    }],
  ]), [counts, hiddenMatchByFile, hiddenMatchByType, valuesByDimension])

  /**
   * Presentation for an axis this bar has no entry for.
   *
   * A third declared axis used to be *silently* unrenderable: `PRESENTATION` had
   * two entries, an axis missing from it returned null, and the section simply
   * did not appear — while its selection kept filtering the graph. Invisible
   * filtering is the same failure D44 exists to prevent, so an unknown axis now
   * renders with neutral styling and whatever values the host supplied.
   */
  const lookFor = (dimension: string) => PRESENTATION.get(dimension) ?? {
    values: [...(valuesByDimension.get(dimension) ?? [])],
    counts: counts.get(dimension) ?? NO_COUNTS,
    hidden: undefined,
    sectionClass: 'header-types-section',
    rowClass: 'header-types-row',
    chipClass: 'header-type-tag',
    modifierPrefix: '',
    activeClass: 'active',
    iconClass: 'header-type-icon',
    labelClass: 'header-type-label',
  }

  // Axes the host declares that the chain is not already showing.
  const available = ontology.filterDimensions
    .map(d => d.id)
    .filter(id => !chain.includes(id) && lookFor(id).values.length > 0)

  const toggleSearch = () => {
    if (searchActive) {
      onSearchChange('', false)
    } else {
      onSearchChange(searchQuery, true)
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  return (
    <div className={`canvas-header${refreshFlash ? ' refresh-flash' : ''}`}>
      {chain.map(dimension => {
        const descriptor = ontology.descriptorFor(dimension)
        if (!descriptor) return null
        const look = lookFor(dimension)
        const chips = descriptor.chipsFor(look.values)
        // No values to offer: render the header and its remove control anyway,
        // so an axis that is filtering is always visible and always removable.
        // Vanishing is what made a third axis dangerous rather than merely
        // unsupported.
        const empty = chips.length === 0

        const selection = selectionFor(filter, dimension)
        const pinned = pinnedFor(pins, dimension)
        // An `emptyMeans: 'all'` axis with nothing selected is not "off" — it is
        // matching everything, and the chips say so rather than reading as a
        // filter that hides the lot.
        const allIncluded = selection.size === 0 && descriptor.emptyMeans === 'all'

        return (
          <React.Fragment key={dimension}>
            <div className={`${look.sectionClass}${pinned ? ' section-pinned' : ''}`}>
              <div className={look.rowClass}>
                {empty && (
                  <span className="header-chain-empty" title={`${descriptor.label} has no values in this view`}>
                    no {descriptor.label.toLowerCase()} values
                  </span>
                )}
                {chips.map(chip => {
                  const isActive = chip.values.some(v => selection.has(v))
                  const isChanged = chip.values.some(v => recentlyChanged.has(`${dimension}:${v}`))
                  const hiddenCount = chip.values.reduce((sum, v) => sum + (look.hidden?.get(v) ?? 0), 0)
                  const count = chip.values.reduce((sum, v) => sum + (look.counts.get(v) ?? 0), 0)
                  const cls = [
                    look.chipClass,
                    allIncluded ? 'all-included' : (isActive ? look.activeClass : ''),
                    look.modifierPrefix ? `${look.modifierPrefix}-${chip.id}` : '',
                    isChanged ? 'recently-changed' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button
                      key={chip.id}
                      className={cls}
                      style={chip.tint ? ({ ['--chip-tint' as string]: `var(${colorVar(tintOf(chip.id, chip.tint, ontology))})` } as React.CSSProperties) : undefined}
                      onClick={() => onFilterChange(toggleGroup(filter, dimension, chip.values))}
                      title={chip.tooltip ?? (isActive ? `Hide ${chip.label.toLowerCase()}` : `Show ${chip.label.toLowerCase()}`)}
                    >
                      {chip.icon && <span className={look.iconClass}>{chip.icon}</span>}
                      <span className={look.labelClass}>{chip.label}</span>
                      <span className="header-chip-count">{count}</span>
                      {hiddenCount > 0 && (
                        <span className="header-hidden-badge" title={`${hiddenCount} match${hiddenCount !== 1 ? 'es' : ''} hidden by this filter`}>
                          {hiddenCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <PinToggle
                pinned={pinned}
                onClick={() => onPinsChange(withPin(pins, dimension, !pinned))}
                flashing={overriddenPins.has(dimension)}
                label={descriptor.label}
              />
              {onChainChange && (
                <button
                  className="header-chain-remove"
                  onClick={() => {
                    // Removing an axis also stops it filtering. Keeping the
                    // selection would leave the view filtered by something with
                    // no on-screen representation and no way to reach it —
                    // invisible state that reads as a bug.
                    //
                    // "Stops filtering" is NOT "empty", and that difference is
                    // this axis's `emptyMeans` again. On the file axis an empty
                    // selection matches everything; on the kind axis it matches
                    // NOTHING, so clearing it would blank the view instead of
                    // unfiltering it. Match-everything is therefore empty for
                    // one and the full value set for the other.
                    onFilterChange(withSelection(
                      filter,
                      dimension,
                      descriptor.emptyMeans === 'all'
                        ? new Set<string>()
                        : new Set(chips.flatMap(c => [...c.values])),
                    ))
                    onChainChange(chain.filter(d => d !== dimension))
                  }}
                  title={`Remove the ${descriptor.label} filter`}
                >×</button>
              )}
            </div>
            <div className="header-divider" />
          </React.Fragment>
        )
      })}

      {onChainChange && available.length > 0 && (
        <div className="header-chain-add">
          <button
            className="header-chain-add-button"
            onClick={() => onChainChange([...chain, available[0]!])}
            title={`Add the ${ontology.descriptorFor(available[0]!)?.label ?? available[0]} filter`}
          >+</button>
        </div>
      )}

      <div className="header-divider" />

      <div className="header-controls-section">
        <div className={`header-search ${searchActive ? 'active' : ''}`}>
          <button className="header-search-toggle" onClick={toggleSearch} title={searchTitle}>
            <SearchIcon size={14} />
          </button>
          {searchActive && (
            <input
              ref={searchInputRef}
              className="header-search-input"
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value, true)}
              onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
            />
          )}
          {searchExtra}
        </div>
      </div>

      {findings}
    </div>
  )
}
