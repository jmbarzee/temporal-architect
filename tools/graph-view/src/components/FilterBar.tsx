// The filter bar: one section of chips per axis in the chain, each with its
// pin and its remove control, the search control, and a slot at the bottom
// the host fills with its findings. A host with more than one view renders
// it in each, so the views' toolbars stay in lockstep.
//
// How an axis's chips look is the descriptor's `presentation`; the bar names
// no axis. A view-specific adornment on the search control (a match counter,
// a hidden-match badge) comes in as `searchExtra`.

import { OntologyContext } from './graph-view/useOntology'
import type { DimensionValue } from '../graph/dimension'
import { countsOn, valuesOn } from '../graph/dimension'
import type { Graph } from '../graph/model'
import type { Ontology } from '../graph/ontology'
import { useControllable } from './graph-view/useControllable'
import { useRecentlyChanged } from './graph-view/useRecentlyChanged'
import type { RecentlyChanged } from './graph-view/useRecentlyChanged'

// A chip's tint names a style value; one that names nothing declared is a
// host bug, said once per chip and per bar on the console rather than thrown
// in render, and the chip draws neutral.
function tintOf(chipId: string, tint: DimensionValue, ontology: Ontology, said: Set<string>): DimensionValue {
  if (ontology.styleValues.includes(tint)) return tint
  if (!said.has(chipId)) {
    said.add(chipId)
    console.error(`[filter] chip ${JSON.stringify(chipId)} borrows the colour of ${JSON.stringify(tint)}, which the taxonomy does not declare`)
  }
  return tint
}
import { selectionFor } from '../filter/types'
import React from 'react'
import './FilterBar.css'
import type { ResolvedDimensionDescriptor } from '../graph/dimension'
import { pinnedFor, withPin, withSelection } from '../filter/types'
import type { FilterState, PinState, FilterDimension } from '../filter/types'
import { toggleGroup } from '../filter/toggle'
import { PinToggle } from './PinToggle'
import { SearchIcon } from './icons/SearchIcon'

const NO_PINS: ReadonlySet<string> = new Set()

/** The search control's state: the query, and whether the control is open. */
export interface SearchState { query: string; active: boolean }

/**
 * The bar's inputs. The filter and its callback are the one requirement; the
 * values each axis offers come from `values` or from `graph`, and everything
 * else the pane supplies for its own bar has a default here, so a host's
 * second view renders the same bar without rebuilding the pane's internals.
 */
/** Which of the bar's own controls are offered; every part is on by default. */
export interface FilterBarChrome {
  /** The search control. */
  search?: boolean
  /** The pin toggle on each axis — meaningful only to a host with a second view to pin against. */
  pins?: boolean
}

export interface FilterBarProps {
  /** The taxonomy, when not supplied through `OntologyContext`. */
  ontology?: Ontology
  /** Which controls are offered. Default: everything; pins only when the host engages them (`pins` or `onPinsChange`). */
  chrome?: FilterBarChrome
  /** Chip badge counts per axis and value, read by the host off its own data. Absent: the graph's node counts when `graph` is given, else no badges. */
  counts?: ReadonlyMap<string, ReadonlyMap<string, number>>
  /**
   * Values available per axis — the one source every axis's chips are built
   * from. Absent, read off `graph`; one of the two is required. An axis with
   * no entry renders an empty, explicitly-disabled section rather than
   * vanishing.
   */
  values?: ReadonlyMap<string, readonly string[]>
  /** The graph the bar filters, when `values` is not read elsewhere. */
  graph?: Graph
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  /** Which axes are pinned. Default: the bar's own, none pinned, with no toggles shown unless `chrome.pins` asks. */
  pins?: PinState
  onPinsChange?: (next: PinState) => void
  /** Axes a focus just overrode the pin of. The bar flashes them once, for 600 ms, whenever the value changes; the host need not clear it. */
  overriddenPins?: ReadonlySet<FilterDimension>
  /** The values that just turned on, per axis — drives the chip flash. Default: tracked here from the filter's changes. */
  recentlyChanged?: RecentlyChanged
  /** The search control. Default: the bar's own, closed and empty. */
  search?: SearchState
  onSearchChange?: (next: SearchState) => void
  /** The search input, for a host that focuses it from its own shortcut. */
  searchInputRef?: React.RefObject<HTMLInputElement>
  searchTitle?: string
  searchPlaceholder?: string
  /** View-specific search adornment rendered inside the search control. */
  searchExtra?: React.ReactNode
  /** Search matches hidden by a chip, per axis and value — the badge the chip hiding them wears. Optional. */
  hiddenMatches?: ReadonlyMap<string, ReadonlyMap<string, number>>
  /** The axes shown, in order; may be empty. Default: every declared axis, editable in place. */
  chain?: readonly string[]
  /** Omitted by a host that controls the chain and does not want it edited in place. */
  onChainChange?: (next: readonly string[]) => void
  /** The host's findings bars, rendered under the chips. */
  findings?: React.ReactNode
  /** Flash the whole bar once whenever this value changes to something truthy — a counter a host bumps when its data reloads. */
  refreshFlash?: boolean | number
}

/** The classes a section's chips wear, by the axis's declared presentation. */
const LOOKS = {
  chip: { sectionClass: 'gv-header-types-section', rowClass: 'gv-header-types-row', chipClass: 'gv-header-type-tag', modifierPrefix: 'gv-header-type', activeClass: 'active', iconClass: 'gv-header-type-icon', labelClass: 'gv-header-type-label' },
  tag: { sectionClass: 'gv-header-files-section', rowClass: 'gv-header-files-row', chipClass: 'gv-header-file-tag', modifierPrefix: '', activeClass: 'selected', iconClass: 'gv-header-file-icon', labelClass: 'gv-header-file-name' },
} as const

export function FilterBar({
  ontology: ontologyProp,
  chrome,
  counts: hostCounts,
  values: hostValues,
  graph,
  filter,
  onFilterChange,
  pins: pinsProp,
  onPinsChange,
  overriddenPins = NO_PINS,
  recentlyChanged: hostRecentlyChanged,
  search: searchProp,
  onSearchChange,
  searchInputRef: hostInputRef,
  searchTitle = 'Search (/)',
  searchPlaceholder = 'Search…',
  searchExtra,
  hiddenMatches,
  findings,
  refreshFlash,
  chain: hostChain,
  onChainChange,
}: FilterBarProps) {
  const fromContext = React.useContext(OntologyContext)
  const ontology = ontologyProp ?? fromContext
  if (!ontology) throw new Error('FilterBar has no taxonomy: pass `ontology`, or mount it inside <OntologyContext.Provider value={…}>.')
  if (!hostValues && !graph) throw new Error('FilterBar needs the values each axis offers: pass `values`, or the `graph` to read them off.')
  const undeclaredTints = React.useRef(new Set<string>())
  const [pins, setPins] = useControllable(pinsProp, onPinsChange, () => new Map<string, boolean>())
  const showPins = chrome?.pins ?? (pinsProp !== undefined || onPinsChange !== undefined)
  const showSearch = chrome?.search ?? true
  // The pin flash is the bar's: a new set of overridden pins lights them for
  // 600 ms and goes out by itself, so a host passes the reconciler's answer
  // and nothing more.
  const [flashing, setFlashing] = React.useState<ReadonlySet<string>>(NO_PINS)
  React.useEffect(() => {
    // Every change sets the state, the empty one included: the cleanup has
    // already cancelled the previous timer, so an empty set arriving mid-flash
    // must put the light out itself.
    setFlashing(overriddenPins)
    if (overriddenPins.size === 0) return
    const timer = setTimeout(() => setFlashing(NO_PINS), 600)
    return () => clearTimeout(timer)
  }, [overriddenPins])
  // The whole-bar flash likewise: once per change of the value, not for as
  // long as a boolean stays set.
  const [refreshing, setRefreshing] = React.useState(false)
  React.useEffect(() => {
    if (!refreshFlash) return
    setRefreshing(true)
    const timer = setTimeout(() => setRefreshing(false), 600)
    return () => clearTimeout(timer)
  }, [refreshFlash])
  const [chain, setChain] = useControllable(hostChain, onChainChange, () => ontology.filterDimensions.map(d => d.id))
  const chainEditable = hostChain === undefined || onChainChange !== undefined
  const [search, setSearch] = useControllable(searchProp, onSearchChange, () => ({ query: '', active: false }))
  const { query: searchQuery, active: searchActive } = search
  const ownInputRef = React.useRef<HTMLInputElement>(null)
  const searchInputRef = hostInputRef ?? ownInputRef
  const tracked = useRecentlyChanged(filter)
  const recentlyChanged = hostRecentlyChanged ?? tracked
  const valuesByDimension = React.useMemo(
    () => hostValues ?? new Map(chain.map(d => [d, graph ? valuesOn(graph.nodes.values(), d) : []])),
    [hostValues, graph, chain],
  )
  const counts = React.useMemo(
    () => hostCounts ?? (graph ? countsOn(graph.nodes.values(), chain) : undefined),
    [hostCounts, graph, chain],
  )

  // What a section is made of: the values the host read off its data, their
  // counts and hidden matches, and the classes its declared presentation
  // wears. Every axis renders, declared or not — an axis that is filtering
  // must be visible and removable, and vanishing is what once made a third
  // axis dangerous rather than merely unsupported.
  const lookFor = (dimension: string, descriptor?: ResolvedDimensionDescriptor) => ({
    values: [...(valuesByDimension.get(dimension) ?? [])],
    counts: counts?.get(dimension),
    hidden: hiddenMatches?.get(dimension),
    ...LOOKS[descriptor?.presentation ?? 'chip'],
  })

  // Axes the host declares that the chain is not already showing.
  const available = ontology.filterDimensions
    .map(d => d.id)
    .filter(id => !chain.includes(id) && (valuesByDimension.get(id)?.length ?? 0) > 0)

  const toggleSearch = () => {
    if (searchActive) {
      setSearch({ query: '', active: false })
    } else {
      setSearch({ query: searchQuery, active: true })
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }

  return (
    <div className={`gv-canvas-header${refreshing ? ' refresh-flash' : ''}`}>
      {chain.map(dimension => {
        const descriptor = ontology.descriptorFor(dimension)
        if (!descriptor) return null
        const look = lookFor(dimension, descriptor)
        // A chip none of whose values the data presents is not offered, whoever built it.
        const present = new Set(look.values)
        const chips = descriptor.chipsFor(look.values).filter(c => c.values.some(v => present.has(v)))
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
                <span className="gv-header-axis-label">{descriptor.label}</span>
                {empty && (
                  <span className="gv-header-chain-empty" title={`${descriptor.label} has no values in this view`}>
                    no {descriptor.label.toLowerCase()} values
                  </span>
                )}
                {chips.map(chip => {
                  const isActive = chip.values.some(v => selection.has(v))
                  const isChanged = chip.values.some(v => recentlyChanged.get(dimension)?.has(v))
                  const hiddenCount = chip.values.reduce((sum, v) => sum + (look.hidden?.get(v) ?? 0), 0)
                  const count = look.counts === undefined ? undefined : chip.values.reduce((sum, v) => sum + (look.counts!.get(v) ?? 0), 0)
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
                      style={chip.tint ? ({ ['--gv-chip-tint' as string]: `var(${ontology.colorVar(tintOf(chip.id, chip.tint, ontology, undeclaredTints.current))})` } as React.CSSProperties) : undefined}
                      onClick={() => onFilterChange(toggleGroup(filter, dimension, chip.values))}
                      title={chip.tooltip ?? (isActive ? `Hide ${chip.label.toLowerCase()}` : `Show ${chip.label.toLowerCase()}`)}
                    >
                      {chip.icon && <span className={look.iconClass}>{chip.icon}</span>}
                      <span className={look.labelClass}>{chip.label}</span>
                      {count !== undefined && <span className="gv-header-chip-count">{count}</span>}
                      {hiddenCount > 0 && (
                        <span className="gv-header-hidden-badge" title={`${hiddenCount} match${hiddenCount !== 1 ? 'es' : ''} hidden by this filter`}>
                          {hiddenCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {showPins && (
                <PinToggle
                  pinned={pinned}
                  onClick={() => setPins(withPin(pins, dimension, !pinned))}
                  flashing={flashing.has(dimension)}
                  label={descriptor.label}
                />
              )}
              {chainEditable && (
                <button
                  className="gv-header-chain-remove"
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
                    setChain(chain.filter(d => d !== dimension))
                  }}
                  title={`Remove the ${descriptor.label} filter`}
                >×</button>
              )}
            </div>
            <div className="gv-header-divider" />
          </React.Fragment>
        )
      })}

      {chainEditable && available.length > 0 && (
        <div className="gv-header-chain-add">
          <button
            className="gv-header-chain-add-button"
            onClick={() => setChain([...chain, available[0]!])}
            title={`Add the ${ontology.descriptorFor(available[0]!)?.label ?? available[0]} filter`}
          >+</button>
        </div>
      )}

      <div className="gv-header-divider" />

      {showSearch && <div className="gv-header-controls-section">
        <div className={`gv-header-search ${searchActive ? 'active' : ''}`}>
          <button className="gv-header-search-toggle" onClick={toggleSearch} title={searchTitle}>
            <SearchIcon size={14} />
          </button>
          {searchActive && (
            <input
              ref={searchInputRef}
              className="gv-header-search-input"
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => setSearch({ query: e.target.value, active: true })}
              onKeyDown={e => { if (e.key === 'Escape') toggleSearch() }}
            />
          )}
          {searchExtra}
        </div>
      </div>}

      {findings}
    </div>
  )
}
