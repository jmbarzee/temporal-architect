import React from 'react'

// A sub-level of tabs inside one force tab: underline tabs like the main strip,
// marked as a sub-level by an accent underline. Bodies stack in one grid cell
// with only the active one visible, so switching never resizes the panel — the
// same trick the main tabs use.

export function SubTabs({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="force-subtabs" role="tablist" aria-label={label}>{children}</div>
}

/**
 * One sub-tab: a selectable label, optionally led by a control that belongs to
 * the tab itself (Gravity puts each force's on/off switch there). Selecting
 * and the leading control are independent, so a tab's state stays legible
 * while another's body is shown.
 */
export function SubTab({ label, active, onSelect, leading }: {
  label: string
  active: boolean
  onSelect: () => void
  leading?: React.ReactNode
}) {
  return (
    <div role="tab" aria-selected={active} className={`force-subtab${active ? ' active' : ''}`} onClick={onSelect}>
      {leading}
      <span className="force-subtab-label">{label}</span>
    </div>
  )
}

export function SubTabBodies({ children }: { children: React.ReactNode }) {
  return <div className="force-bodies">{children}</div>
}

export function SubTabBody({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={`force-body${active ? ' active' : ''}`} aria-hidden={!active}>{children}</div>
}
