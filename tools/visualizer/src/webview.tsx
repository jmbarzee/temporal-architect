import React from 'react'
import ReactDOM from 'react-dom/client'
import { WorkflowCanvas } from './components/WorkflowCanvas'
import { StyleGuide } from './components/StyleGuide'
import type { TWFFile } from './types/ast'
import type { ParserGraph } from './types/parser-graph'
import './styles/index.css'
import { mountNodeTypeStyles } from './graph/node-type-styles'

// Mount registry-generated node-type CSS variables once at module load.
mountNodeTypeStyles()

// VSCode webview entry point
declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

const vscode = acquireVsCodeApi()

// Cache the VS Code API on window so the filter storage shim can reuse it
// (acquireVsCodeApi can only be called once per webview).
;(window as unknown as { __twfVsCodeApi?: typeof vscode }).__twfVsCodeApi = vscode

// Shape of the `ast` message from the VS Code extension. The host posts
// `{ ast, parserGraph }`; older builds (and standalone fixtures) post just
// an AST payload. We accept either shape and supply `parserGraph` as
// undefined when it's absent — WorkflowCanvas's optional prop handles
// the missing-graph case (empty graph view).
interface AstMessage {
  type: 'ast'
  data: TWFFile | { ast: TWFFile; parserGraph?: ParserGraph }
}

function isWrappedPayload(d: AstMessage['data']): d is { ast: TWFFile; parserGraph?: ParserGraph } {
  return d != null && typeof d === 'object' && 'ast' in d && (d as { ast: unknown }).ast != null
}

function WebviewApp() {
  const [ast, setAst] = React.useState<TWFFile | null>(null)
  const [parserGraph, setParserGraph] = React.useState<ParserGraph | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [showStyleGuide, setShowStyleGuide] = React.useState(false)
  // Hash of the most recently committed AST. The extension re-posts the AST on
  // every focus dance / save / explicit refresh; if the structure is unchanged
  // we drop the message so React state — and therefore the graph simulation —
  // doesn't get torn down for nothing.
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

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data
      if (message.type === 'ast') {
        // Structural-equality skip: parser output is plain JSON with stable
        // key order, so JSON.stringify suffices and is sub-millisecond at the
        // sizes we deal with.
        const hash = JSON.stringify(message.data)
        if (hash === lastAstHashRef.current) return
        lastAstHashRef.current = hash
        const payload: AstMessage['data'] = message.data
        if (isWrappedPayload(payload)) {
          setAst(payload.ast)
          setParserGraph(payload.parserGraph)
        } else {
          setAst(payload)
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

    // Request initial data
    vscode.postMessage({ type: 'ready' })

    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Request focus return to the editor after user interaction
  const requestRefocus = React.useCallback(() => {
    vscode.postMessage({ type: 'refocus' })
  }, [])

  // Open a file in the editor when the file filter narrows to one
  const openFile = React.useCallback((file: string) => {
    vscode.postMessage({ type: 'openFile', file })
  }, [])

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
      <div className="loading-container">
        <p>Open a <code>.twf</code> file or connect to the extension to get started.</p>
      </div>
    )
  }

  if (showStyleGuide) {
    return <StyleGuide onClose={() => setShowStyleGuide(false)} />
  }

  return (
    <WorkflowCanvas
      ast={ast}
      parserGraph={parserGraph}
      onOpenFile={openFile}
      onRefocus={requestRefocus}
      style={{ height: '100%' }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WebviewApp />
  </React.StrictMode>,
)
