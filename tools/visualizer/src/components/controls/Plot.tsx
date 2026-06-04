// Plot — the layout shell shared by the node plot (Push/Pull charge/spring maps)
// and the band plot (gravity). It owns the grid that frames a square-ish SVG with
// an axis label + "scale all" slider on the left gutter and a stack of controls
// (x slider, x label, and for the band the X-range bar) beneath it.
//
// It is pure layout: the caller passes its own <svg> (keeping its ref, viewBox,
// and content) as children, plus the gutter slider and labels as slots. This
// dedups the grid/gutter scaffolding without entangling the plot-specific SVG
// math or drag handling.

import React from 'react'

export function Plot({
  yLabel, ySlider, bottom, children,
}: {
  // Vertical y-axis label (rendered rotated in the left gutter).
  yLabel?: React.ReactNode
  // The vertical "scale all" slider for the y axis (a <Slider orientation="vertical">).
  ySlider?: React.ReactNode
  // Everything below the plot, top-to-bottom (x slider, x label, band X-range...).
  bottom?: React.ReactNode
  // The plot itself — the caller's <svg>.
  children: React.ReactNode
}) {
  return (
    <div className="ctl-plot">
      {yLabel !== undefined && <div className="ctl-plot-ylabel">{yLabel}</div>}
      {ySlider !== undefined && <div className="ctl-plot-yslider">{ySlider}</div>}
      <div className="ctl-plot-main">{children}</div>
      {bottom !== undefined && <div className="ctl-plot-bottom">{bottom}</div>}
    </div>
  )
}
