import React from 'react'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { StyleGuide } from './components/StyleGuide'
import type { TWFFile } from './types/ast'
import type { ParserGraph } from './types/parser-graph'
import { normalizePayload } from './types/payload'
import { mountNodeTypeStyles } from './graph/node-type-styles'

// Mount registry-generated node-type CSS variables once at module load.
mountNodeTypeStyles()

// Standalone app - for development/testing
// Load AST from URL query param: ?ast=/path/to/file.json
//
// Payload shapes are normalized by normalizePayload (see types/payload.ts):
// a wrapped `{ ast, parserGraph }` envelope, the raw `twf graph --json`
// envelope (`{ graph }` → empty AST + graph, history mode), or a bare AST.
//
// `ast.diagnostics` (structured validator/resolver findings from
// `twf parse`'s JSON envelope) and `ast.errors` (catastrophic
// parser-process failures) both ride through unchanged; the headers in
// TreeView / GraphView see both fields naturally.

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
        const norm = normalizePayload(message.data)
        if (norm) {
          setAst(norm.ast)
          setParserGraph(norm.parserGraph)
          setError(null)
        } else {
          setError('Unrecognized payload shape')
        }
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
          const norm = normalizePayload(data)
          if (norm) {
            setAst(norm.ast)
            setParserGraph(norm.parserGraph)
          } else {
            setError('Unrecognized payload shape')
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
        const norm = normalizePayload(json)
        if (norm) {
          setAst(norm.ast)
          setParserGraph(norm.parserGraph)
          setError(null)
        } else {
          setError('Unrecognized payload shape')
        }
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
