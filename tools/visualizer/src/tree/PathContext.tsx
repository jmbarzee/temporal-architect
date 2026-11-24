import React from 'react'
import type { Path } from './path'
import './path.css'

/** The execution drawn on the tree: the identity of each block, the path read from the events, and the step selected. */
export interface PathState {
  ids: Map<object, string>
  path?: Path
  /** The selected event's id. */
  selected?: string
  onSelect?: (step: string | undefined) => void
}

export const PathContext = React.createContext<PathState>({ ids: new Map() })

/** Whether the execution drawn leaves the definition unreached; a definition that holds no statements is not its to dim. */
export function offPath({ ids, path }: PathState, def: object): boolean {
  const id = ids.get(def)
  return path !== undefined && id !== undefined && !path.on(id)
}

/** A block with what the execution did to it: dimmed off the path, noted on it, outlined when its step is selected. */
export function Marked({ node, children }: { node: object; children: React.ReactNode }) {
  const { ids, path, selected, onSelect } = React.useContext(PathContext)
  const id = ids.get(node)
  if (!path || id === undefined) return <>{children}</>
  const on = path.on(id)
  const step = path.step(id)
  const detail = path.detail(id)
  const chosen = selected !== undefined && path.holds(id, selected)
  return (
    <div className={`path-mark ${on ? 'path-on' : 'path-off'}${chosen ? ' path-selected' : ''}`} data-stmt={id}>
      {on && (step !== undefined || detail.length > 0) && (
        <button
          className="path-note"
          aria-pressed={chosen}
          disabled={step === undefined}
          title="Select this step"
          onClick={e => {
            e.stopPropagation()
            onSelect?.(selected === step ? undefined : step)
          }}
        >
          {detail.length > 0 ? detail.join(' · ') : 'ran'}
        </button>
      )}
      {children}
    </div>
  )
}
