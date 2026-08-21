import React from 'react'
import './App.css'
import { VisualizerHost } from './components/VisualizerHost'
import type { PayloadSource } from './components/VisualizerHost'
import type { HostMessage } from './components/protocol'
import { mountNodeTypeStyles } from './graph/node-type-styles'

// Mount registry-generated node-type CSS variables once at module load.
mountNodeTypeStyles()

// Standalone app - for development/testing.
//
// This is the toolchain's own *consumer* of the shared `<VisualizerHost>`
// shell (issue #150): it owns only the transport adapter and the empty-state
// content, not the shell's render logic. Load AST from URL query param
// (?ast=/path/to/file.json), a window postMessage, or a manual file upload;
// all three feed a single composite `PayloadSource`.
//
// Payload shapes are normalized by the shell via normalizePayload (see
// types/payload.ts): a wrapped `{ ast, parserGraph }` envelope, the raw
// `twf graph --json` envelope (`{ graph }` → empty AST + graph, history mode),
// or a bare AST. `ast.diagnostics` and `ast.errors` ride through unchanged.
//
// Transport-level failures (fetch reject, JSON.parse throw) are mapped to
// `error` messages here; normalize failures ("Unrecognized payload shape") are
// the shell's concern.

interface StandaloneSource extends PayloadSource {
  /** Push a message from a transport that isn't a passive subscription
   * (the manual file upload). */
  emit(msg: HostMessage): void
}

// Composite standalone PayloadSource over the three transports the dev app
// supports: window postMessage (passive), the `?ast=` query-param fetch
// (kicked on subscribe), and manual file upload (pushed via `emit`).
function createStandaloneSource(setLoading: (loading: boolean) => void): StandaloneSource {
  let sink: ((msg: HostMessage) => void) | null = null

  return {
    subscribe(onMessage) {
      sink = onMessage

      // See webview.tsx: postMessage carries `{ type: 'ast' | 'error', … }`
      // envelopes straight through to the shell.
      const handleMessage = (event: MessageEvent) => onMessage(event.data as HostMessage)
      window.addEventListener('message', handleMessage)

      // Check for ?ast= query param.
      const params = new URLSearchParams(window.location.search)
      const astPath = params.get('ast')
      if (astPath) {
        setLoading(true)
        fetch(astPath)
          .then(res => res.json())
          .then(data => {
            onMessage({ type: 'ast', data })
            setLoading(false)
          })
          .catch(err => {
            onMessage({ type: 'error', message: err.message })
            setLoading(false)
          })
      }

      return () => {
        window.removeEventListener('message', handleMessage)
        sink = null
      }
    },
    emit(msg) {
      sink?.(msg)
    },
  }
}

function App() {
  const [loading, setLoading] = React.useState(false)
  // The source is created once and kept stable so the shell subscribes exactly
  // once (its effect keys on the source identity).
  const sourceRef = React.useRef<StandaloneSource | null>(null)
  if (sourceRef.current === null) {
    sourceRef.current = createStandaloneSource(setLoading)
  }
  const source = sourceRef.current

  // File input handler for manual loading. Transport-level parse failures map
  // to `error`; the shell handles normalization (incl. "Unrecognized payload
  // shape").
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        source.emit({ type: 'ast', data: json })
      } catch (err) {
        source.emit({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to parse JSON',
        })
      }
    }
    reader.readAsText(file)
  }

  // Standalone empty-state content: a transient loading message while `?ast=`
  // is in flight, otherwise the file picker. The shell frames this in
  // `.empty-container`.
  const emptyState = loading ? (
    <p className="loading">Loading workflow...</p>
  ) : (
    <div className="empty-content">
      <h2>TWF Workflow Visualizer</h2>
      <p>Load an AST JSON file to visualize:</p>
      <label className="file-upload-btn">
        Choose File
        <input type="file" accept=".json" onChange={handleFileUpload} />
      </label>
      <p className="hint">
        Generate AST with: <code>parse --json file.twf &gt; ast.json</code>
      </p>
    </div>
  )

  // Standalone has no editor, so no HostActions are wired.
  return <VisualizerHost source={source} emptyState={emptyState} />
}

export default App
