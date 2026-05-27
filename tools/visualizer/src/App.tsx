import React from 'react'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { StyleGuide } from './components/StyleGuide'
import type { TWFFile } from './types/ast'
import type { ParserGraph } from './types/parser-graph'
import { mountNodeTypeStyles } from './graph/node-type-styles'

// Mount registry-generated node-type CSS variables once at module load.
mountNodeTypeStyles()

// Standalone app - for development/testing
// Load AST from URL query param: ?ast=/path/to/file.json

// Shape of the payload App accepts — either a bare AST (legacy /
// AST-only fixtures) or the new `{ ast, parserGraph }` envelope.
function isWrappedPayload(d: unknown): d is { ast: TWFFile; parserGraph?: ParserGraph } {
  return d != null && typeof d === 'object' && 'ast' in (d as Record<string, unknown>) &&
    (d as { ast: unknown }).ast != null
}

function App() {
  const [ast, setAst] = React.useState<TWFFile | null>(null)
  const [parserGraph, setParserGraph] = React.useState<ParserGraph | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showStyleGuide, setShowStyleGuide] = React.useState(false)
  // See webview.tsx: skip AST messages that are structurally identical to the
  // previous one so the graph simulation doesn't reset on every focus refresh.
  const lastAstHashRef = React.useRef<string | null>(null)

  // Ctrl+Shift+G toggles style guide
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        setShowStyleGuide(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Load AST from query param or postMessage
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data
      if (message.type === 'ast') {
        const hash = JSON.stringify(message.data)
        if (hash === lastAstHashRef.current) return
        lastAstHashRef.current = hash
        const payload = message.data
        if (isWrappedPayload(payload)) {
          setAst(payload.ast)
          setParserGraph(payload.parserGraph)
        } else {
          setAst(payload as TWFFile)
          setParserGraph(undefined)
        }
        setError(null)
      } else if (message.type === 'error') {
        lastAstHashRef.current = null
        setError(message.message)
        setAst(null)
        setParserGraph(undefined)
      }
    }

    window.addEventListener('message', handleMessage)

    // Check for ?ast= query param
    const params = new URLSearchParams(window.location.search)
    const astPath = params.get('ast')
    if (astPath) {
      setLoading(true)
      fetch(astPath)
        .then(res => res.json())
        .then(data => {
          if (isWrappedPayload(data)) {
            setAst(data.ast)
            setParserGraph(data.parserGraph)
          } else {
            setAst(data)
            setParserGraph(undefined)
          }
          setLoading(false)
        })
        .catch(err => {
          setError(err.message)
          setLoading(false)
        })
    }

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // File input handler for manual loading
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        if (isWrappedPayload(json)) {
          setAst(json.ast)
          setParserGraph(json.parserGraph)
        } else {
          setAst(json)
          setParserGraph(undefined)
        }
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse JSON')
      }
    }
    reader.readAsText(file)
  }

  if (loading) {
    return (
      <div className="loading-container">
        <p>Loading workflow...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error parsing workflow</h2>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!ast) {
    return (
      <div className="empty-container">
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
      </div>
    )
  }

  if (showStyleGuide) {
    return <StyleGuide onClose={() => setShowStyleGuide(false)} />
  }

  return <WorkflowCanvas ast={ast} parserGraph={parserGraph} />
}

export default App
