// 3-segment range selector for semantic zoom levels.
// Implements GRAPH_VIEW.md § Semantic Zoom: Level Selection.

import React from 'react'
import type { NodeLevel } from '../graph/model'

export type LevelRange = [NodeLevel, NodeLevel] // [min, max] inclusive

const LEVELS: { level: NodeLevel; label: string }[] = [
  { level: 1, label: 'NS' },
  { level: 2, label: 'Worker' },
  { level: 3, label: 'Defs' },
]

interface LevelSelectorProps {
  range: LevelRange
  onChange: (range: LevelRange) => void
}

export function LevelSelector({ range, onChange }: LevelSelectorProps) {
  const [dragStart, setDragStart] = React.useState<NodeLevel | null>(null)

  const handlePointerDown = (level: NodeLevel) => {
    setDragStart(level)
  }

  const handlePointerEnter = (level: NodeLevel) => {
    if (dragStart !== null) {
      const min = Math.min(dragStart, level) as NodeLevel
      const max = Math.max(dragStart, level) as NodeLevel
      onChange([min, max])
    }
  }

  const handlePointerUp = (level: NodeLevel) => {
    if (dragStart === level) {
      // Click on single level — select it alone
      onChange([level, level])
    }
    setDragStart(null)
  }

  React.useEffect(() => {
    const up = () => setDragStart(null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  return (
    <div className="level-selector" role="group" aria-label="Semantic zoom level">
      {LEVELS.map(({ level, label }) => {
        const inRange = level >= range[0] && level <= range[1]
        const isMin = level === range[0]
        const isMax = level === range[1]
        const cls = [
          'level-seg',
          inRange ? 'level-seg-active' : '',
          isMin ? 'level-seg-min' : '',
          isMax ? 'level-seg-max' : '',
        ].filter(Boolean).join(' ')

        return (
          <button
            key={level}
            className={cls}
            onPointerDown={() => handlePointerDown(level)}
            onPointerEnter={() => handlePointerEnter(level)}
            onPointerUp={() => handlePointerUp(level)}
            aria-pressed={inRange}
            title={`Level ${level}: ${label}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
