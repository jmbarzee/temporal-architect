import type { Execution } from '@temporal-architect/wire-types'
import React from 'react'

/** The scrubber's position over an execution: the events played. An execution not yet played from is shown whole. */
export function usePlayback(execution?: Execution): [number, (n: number) => void] {
  const [played, setPlayed] = React.useState<{ of?: Execution; at: number }>({ at: 0 })
  const position = played.of === execution ? played.at : execution?.events.length ?? 0
  const set = React.useCallback((at: number) => setPlayed({ of: execution, at }), [execution])
  return [position, set]
}
