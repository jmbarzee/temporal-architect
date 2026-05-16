import React from 'react'

// A small floating context menu, positioned at the cursor on right-click.
// Closes on outside-click, Escape, or item activation.
//
// Used by the Graph view's right-click-on-node interaction (spec § View
// Transitions: focus(target) — Trigger Points).

export interface ContextMenuItem {
  label: string
  onClick: () => void
}

interface GraphContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function GraphContextMenu({ x, y, items, onClose }: GraphContextMenuProps) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onPointer = (e: MouseEvent) => {
      if (!ref.current) return
      if (ref.current.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    // Use capture so we close even if a child stopPropagation()s.
    window.addEventListener('mousedown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer, true)
    }
  }, [onClose])

  // Clamp position so the menu doesn't overflow the viewport.
  const style: React.CSSProperties = React.useMemo(() => {
    const margin = 8
    const w = 180
    const h = 40 + items.length * 28
    const px = Math.min(x, window.innerWidth - w - margin)
    const py = Math.min(y, window.innerHeight - h - margin)
    return { left: px, top: py }
  }, [x, y, items.length])

  return (
    <div ref={ref} className="graph-context-menu" style={style} role="menu">
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          className="graph-context-menu-item"
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
