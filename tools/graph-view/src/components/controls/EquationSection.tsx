import React from 'react'
import { Equation } from './Equation'

// One force section's content: the optional subtitle, the governing equation
// (transparency), and the controls. The wrapper is the hover target that
// drives the canvas force-field preview via onHover.
export function EquationSection({ subtitle, equation, onHover, children }: {
  subtitle: string
  equation: React.ReactNode
  onHover: (hovered: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div
      className="gv-graph-control-equation-section"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {subtitle && (
        <div className="gv-graph-control-equation-header">
          <span className="gv-graph-control-equation-subtitle">({subtitle})</span>
        </div>
      )}
      <Equation>{equation}</Equation>
      <div className="gv-graph-control-equation-body">
        {children}
      </div>
    </div>
  )
}
