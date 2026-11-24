import React from 'react'
import './scrubber.css'

const STEP_MS = 500

/**
 * The time control over one execution: a position, the number of events played, from none to all.
 * The host holds the position, and whatever plays against it reads it: the graph's visited
 * subgraph does, and so may an edge time series (#55) by mapping the position to its own time.
 */
export function Scrubber({ position, length, time, onPosition }: { position: number; length: number; time?: string; onPosition: (n: number) => void }) {
  const [playing, setPlaying] = React.useState(false)
  React.useEffect(() => {
    if (!playing) return
    if (position >= length) return setPlaying(false)
    const t = setTimeout(() => onPosition(position + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [playing, position, length, onPosition])

  return (
    <div className="scrubber" role="group" aria-label="Playback" onClick={e => e.stopPropagation()}>
      <button aria-label="Step back" disabled={position <= 0} onClick={() => onPosition(position - 1)}>‹</button>
      <button aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (!playing && position >= length) onPosition(0); setPlaying(!playing) }}>{playing ? '❚❚' : '▶'}</button>
      <button aria-label="Step forward" disabled={position >= length} onClick={() => onPosition(position + 1)}>›</button>
      <input type="range" aria-label="Step" min={0} max={length} value={position} onChange={e => onPosition(Number(e.target.value))} />
      <span className="scrubber-at">{position} / {length}{time && ` · ${time}`}</span>
    </div>
  )
}
