// A legend for the group overlay: every group the host offers, with the
// colour the view drew it in, a toggle when the host lets the user turn
// groups on and off, and hover emphasis through the view's own control.
// Both hosts had written this one; it sits where `groupsControl` renders it,
// under the bar.

import React from 'react'
import './GroupLegend.css'
import type { ActiveGroup } from '../graph/groups'

export interface GroupLegendProps {
  /** Every group the host offers, in order, with its label. */
  items: readonly { id: string; label: string }[]
  /** The groups as drawn, from `groupsControl` — their colours. An item on but not among them has no node the view draws. */
  active: readonly ActiveGroup[]
  /** Which items are on. Absent: every item is on; the toggles follow `onToggle`. */
  enabled?: ReadonlySet<string>
  /** Turn an item on or off; shown as a checkbox when given. */
  onToggle?: (id: string) => void
  /** Hover emphasis — hand it `groupsControl`'s `emphasize`. */
  onEmphasize?: (id: string | null) => void
  title?: string
  className?: string
}

export function GroupLegend({ items, active, enabled, onToggle, onEmphasize, title, className }: GroupLegendProps) {
  const colorById = React.useMemo(() => new Map(active.map(g => [g.id, g.color] as const)), [active])
  // A legend that goes away under the pointer takes its emphasis with it.
  const onEmphasizeRef = React.useRef(onEmphasize)
  onEmphasizeRef.current = onEmphasize
  React.useEffect(() => () => onEmphasizeRef.current?.(null), [])
  return (
    <div className={`gv-group-legend${className ? ` ${className}` : ''}`} onMouseLeave={onEmphasize ? () => onEmphasize(null) : undefined}>
      {title && <div className="gv-group-legend-title">{title}</div>}
      {items.map(item => {
        const on = enabled === undefined || enabled.has(item.id)
        const color = colorById.get(item.id)
        const Row = onToggle ? 'label' : 'div'
        return (
          <Row key={item.id} className={`gv-group-legend-row${on ? '' : ' off'}`} onMouseEnter={onEmphasize ? () => onEmphasize(item.id) : undefined}>
            {onToggle && <input type="checkbox" checked={on} onChange={() => onToggle(item.id)} />}
            <span className="gv-group-legend-swatch" style={{ background: color ?? 'transparent' }} />
            <span className="gv-group-legend-label">{item.label}</span>
            {on && color === undefined && <span className="gv-group-legend-note">not shown</span>}
          </Row>
        )
      })}
    </div>
  )
}
