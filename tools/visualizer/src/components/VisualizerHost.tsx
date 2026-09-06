import React from 'react'
import './VisualizerHost.css'
import { WorkflowCanvas } from './WorkflowCanvas'
import { StyleGuide } from './StyleGuide'
import type { HostMessage, DecompositionParams } from './protocol'
import type { TWFFile } from '../types/ast'
import type { ParserGraph } from '../types/parser-graph'
import type { Decomposition } from '../types/decomposition'
import { normalizePayload } from '../types/payload'

// The host-agnostic shell that wraps the visualizer's render core. Every host
// (the standalone dev app, the VS Code webview, a future SSE serve host) shares
// this shell and differs only on two seams: how inbound payloads arrive
// (`PayloadSource`) and what user intent flows back out (`HostActions`). The
// shell owns everything in between — payload de-dupe + normalization, the
// StyleGuide toggle, and the error / empty / styleguide / canvas render
// branches — so those never get copy-pasted per host.

/**
 * Inbound payload transport seam. A host implements `subscribe`, delivering
 * `HostMessage`s to the shell, and returns an unsubscribe cleanup that the
 * shell calls on unmount. The concrete transport (postMessage / SSE / fetch /
 * FileReader) is the host's concern; the shell only speaks `HostMessage`.
 */
export interface PayloadSource {
  subscribe(onMessage: (msg: HostMessage) => void): () => void
}

/**
 * Outbound user-intent seam. The shell forwards the visualizer's interaction
 * hints to these optional callbacks; a host wires them to whatever the action
 * means in its environment (e.g. a VS Code webview posts an outbound message).
 * A standalone host with no editor simply omits them.
 */
export interface HostActions {
  /** The user narrowed the file filter to exactly one file. */
  openFile?: (file: string) => void
  /** The user interacted with the canvas in a way that implies "refocus the editor". */
  refocus?: () => void
  /**
   * The user adjusted decomposition parameters and asked the host to recompute.
   * The `params` mirror the Go `decompose.Options` field-for-field, so a host
   * translates them 1:1 into a `twf graph chunks` invocation; the fresh overlay
   * flows back in through the inbound `PayloadSource` as a new `decomposition`.
   * A host with no producer to recompute against simply omits this.
   */
  requestDecomposition?: (params: DecompositionParams) => void
}

/**
 * The props the shell hands its render core. A host that substitutes its own
 * core receives exactly this and nothing else, which is what keeps the shell —
 * payload de-dupe, normalization, the error/empty/styleguide branches — reusable
 * by a core that is not this one.
 */
export interface RenderCoreProps {
  ast: TWFFile
  parserGraph?: ParserGraph
  decomposition?: Decomposition
  onOpenFile?: (file: string) => void
  onRefocus?: () => void
  onRequestDecomposition?: (params: DecompositionParams) => void
  style?: React.CSSProperties
}

export interface VisualizerHostProps {
  /** Where inbound payloads come from. */
  source: PayloadSource
  /** Where outbound user intent goes. Optional; unwired actions are no-ops. */
  actions?: HostActions
  /**
   * Host-specific content shown when there is no AST yet (before the first
   * payload, or after an `error` is cleared by a fresh empty state). The shell
   * frames it in `.empty-container`; the host supplies the content (a file
   * picker, a "waiting for editor" hint, a transient loading message, …).
   */
  emptyState?: React.ReactNode
  /** Inline style applied to the visualizer's outer container. */
  style?: React.CSSProperties
  /**
   * The component the shell renders once it has an AST. Defaults to the
   * bundled canvas.
   *
   * This is the seam that separates the *shell* from the *view*: everything the
   * shell owns — transport de-dupe, payload normalization, the error, empty and
   * styleguide branches — is domain-agnostic, while the default core is not. A
   * host that wants the shell's lifecycle around a different view supplies one
   * here instead of reimplementing the surrounding branches.
   */
  renderCore?: React.ComponentType<RenderCoreProps>
}

export function VisualizerHost({
  source,
  actions,
  emptyState,
  style,
  renderCore: RenderCore = WorkflowCanvas,
}: VisualizerHostProps) {
  const [ast, setAst] = React.useState<TWFFile | null>(null)
  const [parserGraph, setParserGraph] = React.useState<ParserGraph | undefined>(undefined)
  const [decomposition, setDecomposition] = React.useState<Decomposition | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const [showStyleGuide, setShowStyleGuide] = React.useState(false)
  // Skip AST messages that are structurally identical to the previous one so
  // the graph simulation doesn't reset on every focus refresh (see webview.tsx).
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

  // Subscribe to the host payload source.
  React.useEffect(() => {
    const handleMessage = (message: HostMessage) => {
      if (message.type === 'ast') {
        const hash = JSON.stringify(message.data)
        if (hash === lastAstHashRef.current) return
        lastAstHashRef.current = hash
        const norm = normalizePayload(message.data)
        if (norm) {
          setAst(norm.ast)
          setParserGraph(norm.parserGraph)
          setDecomposition(norm.decomposition)
          setError(null)
        } else {
          setError('Unrecognized payload shape')
        }
      } else if (message.type === 'error') {
        lastAstHashRef.current = null
        setError(message.message)
        setAst(null)
        setParserGraph(undefined)
        setDecomposition(undefined)
      }
    }

    return source.subscribe(handleMessage)
  }, [source])

  if (error) {
    return (
      <div className="error-container">
        <h2>Error parsing workflow</h2>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!ast) {
    return <div className="empty-container">{emptyState}</div>
  }

  if (showStyleGuide) {
    return <StyleGuide onClose={() => setShowStyleGuide(false)} />
  }

  return (
    <RenderCore
      ast={ast}
      parserGraph={parserGraph}
      decomposition={decomposition}
      onOpenFile={actions?.openFile}
      onRefocus={actions?.refocus}
      onRequestDecomposition={actions?.requestDecomposition}
      style={style}
    />
  )
}
