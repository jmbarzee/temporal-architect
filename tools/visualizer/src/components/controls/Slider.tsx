// Slider — the single uniform range-input primitive for the control panel.
//
// One component, two orientations: horizontal (rows, exp, x-gutter) and vertical
// (y-gutter, "up = stronger"). Centralizing it means every slider shares the
// same track height, accent colour, and focus behaviour, and gives one place to
// hang cross-cutting behaviour (e.g. the formula-hover "pop" — see `popId`).
//
// Layout/placement is the caller's job: the slider fills its container
// (width 100% horizontal, height 100% vertical), so a grid cell or flex row
// positions it. The two-handle band slider is a separate primitive (DualRange).

import { usePop } from './PopContext'

export interface SliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  orientation?: 'horizontal' | 'vertical'
  title?: string
  ariaLabel?: string
  // Extra class for caller-side tweaks (rarely needed).
  className?: string
  // Identity for the formula-hover "pop" (WS2): a formula token with the same id
  // emphasizes this slider on hover. Emitted as a data attribute now; the hover
  // wiring reads it later.
  popId?: string
}

export function Slider({
  value, min, max, step, onChange,
  orientation = 'horizontal', title, ariaLabel, className, popId,
}: SliderProps) {
  const { popped } = usePop()
  const isPopped = popId !== undefined && popped === popId
  const cls = `ctl-slider ctl-slider-${orientation === 'vertical' ? 'v' : 'h'}`
    + (isPopped ? ' ctl-slider-popped' : '')
    + (className ? ' ' + className : '')
  return (
    <input
      type="range"
      className={cls}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      title={title}
      aria-label={ariaLabel}
      data-pop-id={popId}
    />
  )
}
