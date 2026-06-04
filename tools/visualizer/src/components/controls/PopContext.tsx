// PopContext — links a hovered value in a governing equation to the global
// slider that controls it. Hovering a FormulaValue sets the "popped" id; the
// Slider whose popId matches emphasizes itself. This is deliberately scoped to
// the global/major sliders (axis "scale all", exp, strength) — not the per-token
// plot positions — so the formula reads as a legend for the panel's knobs.

import React from 'react'

interface PopCtx {
  popped: string | null
  setPopped: (id: string | null) => void
}

const PopContext = React.createContext<PopCtx>({ popped: null, setPopped: () => {} })

export function PopProvider({ children }: { children: React.ReactNode }) {
  const [popped, setPopped] = React.useState<string | null>(null)
  const value = React.useMemo(() => ({ popped, setPopped }), [popped])
  return <PopContext.Provider value={value}>{children}</PopContext.Provider>
}

export function usePop(): PopCtx {
  return React.useContext(PopContext)
}

// A hoverable token inside a formula. Hovering it pops the matching slider.
export function FormulaValue({ id, children }: { id: string; children: React.ReactNode }) {
  const { popped, setPopped } = usePop()
  return (
    <span
      className={`ctl-formula-value${popped === id ? ' active' : ''}`}
      onMouseEnter={() => setPopped(id)}
      onMouseLeave={() => setPopped(null)}
    >
      {children}
    </span>
  )
}
