// A small lock-icon button on each of the filter bar's axis sections. A
// pinned axis holds its selection: a host that reconciles the filter between
// its views (`reconcileFilter`'s `manual` transition) leaves a pinned axis as
// it is.
//
// The pin can briefly flash to indicate it was overridden by a focus
// transition — that's signaled by the `flashing` prop, which the parent
// sets for ~600ms after a focus transition that bypassed the pin.

import './PinToggle.css'

interface PinToggleProps {
  pinned: boolean
  onClick: () => void
  flashing?: boolean
  /** The axis's label, for the title and aria-label. */
  label: string
}

export function PinToggle({ pinned, onClick, flashing, label }: PinToggleProps) {
  const title = pinned
    ? `${label} filter pinned — held as it is; click to unpin`
    : `${label} filter unpinned — click to pin and hold it as it is`
  const className = [
    'pin-toggle',
    pinned ? 'pinned' : '',
    flashing ? 'flashing' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={className}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pinned}
    >
      {pinned ? <LockClosedIcon /> : <LockOpenIcon />}
    </button>
  )
}

// Lock SVGs sized for a 14px control. Stroke-only so they pick up the
// current text color.
function LockClosedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

function LockOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.6" />
    </svg>
  )
}
