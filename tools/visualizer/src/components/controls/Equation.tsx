// Equation — the governing-formula display block shared by every force section.
//
// A string child renders as preformatted text (multi-line dynamics formula); a
// node child renders inline (the fraction/superscript JSX). Centralizing it gives
// one home for the formula's typography and visual separation (border/background).

import React from 'react'

export function Equation({ children }: { children: React.ReactNode }) {
  if (children === '' || children === null || children === undefined) return null
  return typeof children === 'string'
    ? <pre className="graph-control-equation-formula">{children}</pre>
    : <div className="graph-control-equation-formula">{children}</div>
}
