import type { TWFFile } from '../types/ast'

interface GraphViewProps {
  ast: TWFFile
}

export function GraphView({ ast }: GraphViewProps) {
  const defCount = ast.definitions.length

  return (
    <div className="graph-view-placeholder">
      <div className="graph-view-placeholder-content">
        <p className="graph-view-placeholder-title">Graph View</p>
        <p className="graph-view-placeholder-hint">
          Force-directed graph visualization of {defCount} definition{defCount !== 1 ? 's' : ''}.
        </p>
        <p className="graph-view-placeholder-hint">Coming soon.</p>
      </div>
    </div>
  )
}
