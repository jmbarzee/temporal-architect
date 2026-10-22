// Error boundary around the graph canvas.
//
// A throw in <GraphCanvas>'s render or in its requestAnimationFrame draw loop
// would otherwise unmount the whole React tree and blank the app. This small
// class component (error boundaries must be classes — there is no hook form)
// catches such errors and renders a static fallback in place of the canvas,
// leaving the rest of the app interactive.

import React from 'react'

interface CanvasErrorBoundaryProps {
  children: React.ReactNode
}

interface CanvasErrorBoundaryState {
  error: Error | null
}

export class CanvasErrorBoundary extends React.Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): CanvasErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the failure to the console for debugging; the fallback UI keeps
    // the rest of the app usable.
    console.error('GraphCanvas render/draw error:', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="graph-canvas-error" role="alert">
          <p>The graph canvas failed to render.</p>
          <p className="graph-canvas-error-detail">{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
