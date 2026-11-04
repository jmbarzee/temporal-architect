import React from 'react'
import { qualifiedNameOf } from '../../types/ast'
import type { Definition, WorkflowDef, ActivityDef, WorkerDef, WorkerRef, NamespaceDef, NamespaceWorker, NamespaceEndpoint, NexusServiceDef, NexusOperation } from '../../types/ast'
import { StatementBody } from './StatementBlock'
import { WorkflowContent, InlineWorkflowBlock, SyncBodyBlock } from './WorkflowContent'
import { BlockIcon } from '../../theme/temporal-theme'
import { useToggle } from './useToggle'
import { DefinitionContext, HandlerContext, handlersOf } from '../WorkflowCanvas'
import { ContextualNavButtons } from './ContextualNav'
import { OptionsSection } from './OptionsSection'
import './blocks.css'

interface DefinitionBlockProps {
  definition: Definition
  expanded?: boolean
  onToggle?: () => void
  /** A nested row (nexus operation or endpoint) the Tree is revealing, by name. */
  revealChild?: string
}

export function DefinitionBlock({ definition, expanded, onToggle, revealChild }: DefinitionBlockProps) {
  switch (definition.type) {
    case 'workflowDef':
      return <WorkflowDefBlock def={definition} controlledExpanded={expanded} onToggle={onToggle} />
    case 'activityDef':
      return <ActivityDefBlock def={definition} controlledExpanded={expanded} onToggle={onToggle} />
    case 'workerDef':
      return <WorkerDefBlock def={definition} controlledExpanded={expanded} onToggle={onToggle} />
    case 'namespaceDef':
      return <NamespaceDefBlock def={definition} controlledExpanded={expanded} onToggle={onToggle} revealChild={revealChild} />
    case 'nexusServiceDef':
      return <NexusServiceDefBlock def={definition} controlledExpanded={expanded} onToggle={onToggle} revealChild={revealChild} />
    default:
      return null
  }
}

interface ControlledExpandProps {
  controlledExpanded?: boolean
  onToggle?: () => void
}

// A nested row's reveal: scrolls the row into view as it becomes the target,
// and names the class that flashes it for as long as it stays one.
function useReveal<T extends HTMLElement>(revealed: boolean): [React.RefObject<T>, string] {
  const ref = React.useRef<T>(null)
  React.useEffect(() => {
    if (revealed) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [revealed])
  return [ref, revealed ? 'flash-target' : '']
}

function WorkflowDefBlock({ def, controlledExpanded, onToggle }: { def: WorkflowDef } & ControlledExpandProps) {
  const signature = formatWorkflowSignature(def)
  const [internalExpanded, internalToggle] = useToggle()
  const expanded = controlledExpanded ?? internalExpanded
  const toggle = onToggle ?? internalToggle

  // Build handler context for this workflow
  const handlerContext = React.useMemo<HandlerContext>(() => handlersOf(def), [def])

  return (
    <HandlerContext.Provider value={handlerContext}>
      <div className={`block block-workflow ${expanded ? 'expanded' : 'collapsed'}`}>
        <ContextualNavButtons defName={def.name} defType="workflowDef" qualifiedName={qualifiedNameOf(def)} />
        <div className="block-header" onClick={toggle}>
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
          <BlockIcon kind="workflow" />
          <span className="block-keyword">workflow</span>
          <span className="block-signature" title={signature}>{signature}</span>
          {!expanded && (() => { const s = computeSummary(def); return s ? <span className="block-summary">{s}</span> : null })()}
        </div>

        {expanded && (
          <div className="block-body">
            <WorkflowContent def={def} />
          </div>
        )}
      </div>
    </HandlerContext.Provider>
  )
}

function ActivityDefBlock({ def, controlledExpanded, onToggle }: { def: ActivityDef } & ControlledExpandProps) {
  const [internalExpanded, internalToggle] = useToggle()
  const expanded = controlledExpanded ?? internalExpanded
  const toggle = onToggle ?? internalToggle
  const signature = formatActivitySignature(def)

  return (
    <div className={`block block-activity-def ${expanded ? 'expanded' : 'collapsed'}`}>
      <ContextualNavButtons defName={def.name} defType="activityDef" qualifiedName={qualifiedNameOf(def)} />
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <BlockIcon kind="activity" />
        <span className="block-keyword">activity</span>
        <span className="block-signature" title={signature}>{signature}</span>
        {!expanded && (() => { const s = computeSummary(def); return s ? <span className="block-summary">{s}</span> : null })()}
      </div>

      {expanded && (
        <div className="block-body">
          <StatementBody statements={def.body || []} />
        </div>
      )}
    </div>
  )
}

function WorkerDefBlock({ def, controlledExpanded, onToggle }: { def: WorkerDef } & ControlledExpandProps) {
  const [internalExpanded, internalToggle] = useToggle()
  const expanded = controlledExpanded ?? internalExpanded
  const toggle = onToggle ?? internalToggle

  const totalRefs = (def.workflows?.length || 0) + (def.activities?.length || 0) + (def.services?.length || 0)

  return (
    <div className={`block block-worker-def ${expanded ? 'expanded' : 'collapsed'}`}>
      <ContextualNavButtons defName={def.name} defType="workerDef" qualifiedName={qualifiedNameOf(def)} />
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <BlockIcon kind="worker" />
        <span className="block-keyword">worker</span>
        <span className="block-signature" title={`${def.name} (${totalRefs} types)`}>{def.name} ({totalRefs} types)</span>
        {!expanded && (() => { const s = computeSummary(def); return s ? <span className="block-summary">{s}</span> : null })()}
      </div>

      {expanded && (
        <div className="block-body">
          {def.workflows?.length > 0 && (
            <WorkerRefSection label="workflows" refs={def.workflows} refType="workflow" />
          )}
          {def.activities?.length > 0 && (
            <WorkerRefSection label="activities" refs={def.activities} refType="activity" />
          )}
          {def.services?.length > 0 && (
            <WorkerRefSection label="nexus services" refs={def.services} refType="service" />
          )}
        </div>
      )}
    </div>
  )
}

function WorkerRefSection({ label, refs, refType }: { label: string; refs: WorkerRef[]; refType: 'workflow' | 'activity' | 'service' }) {
  return (
    <div className="worker-ref-section">
      <div className="worker-ref-label">{label}</div>
      {refs.map((ref) => (
        <WorkerRefItem key={`${ref.line}:${ref.column}`} ref_={ref} refType={refType} />
      ))}
    </div>
  )
}

function WorkerRefItem({ ref_, refType }: { ref_: WorkerRef; refType: 'workflow' | 'activity' | 'service' }) {
  const context = React.useContext(DefinitionContext)

  // Look up linked definition for expansion
  const linkedDef = refType === 'workflow'
    ? context.workflows.get(ref_.name)
    : refType === 'activity'
      ? context.activities.get(ref_.name)
      : undefined
  const linkedService = refType === 'service'
    ? context.nexusServices.get(ref_.name)
    : undefined
  const isDefined = !!(linkedDef || linkedService)
  const [expanded, toggle] = useToggle(false, isDefined)

  const refKind = refType === 'service' ? 'nexusService' : refType

  return (
    <div className={`worker-ref worker-ref-${refType} ${expanded ? 'expanded' : 'collapsed'} ${!isDefined ? 'worker-ref-unresolved' : ''}`}>
      <div className="worker-ref-header" onClick={toggle}>
        {isDefined ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <BlockIcon kind={refKind} />
        <span className="worker-ref-name">{ref_.name}</span>
        {!isDefined && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isDefined && (
        <div className="block-body">
          {linkedDef?.type === 'workflowDef' ? (
            <WorkflowContent def={linkedDef} />
          ) : linkedDef ? (
            <StatementBody statements={linkedDef.body || []} />
          ) : linkedService ? (
            (linkedService.operations || []).map((op) => (
              <NexusOperationBlock key={`${op.line}:${op.column}`} operation={op} />
            ))
          ) : null}
        </div>
      )}
    </div>
  )
}

function NamespaceDefBlock({ def, controlledExpanded, onToggle, revealChild }: { def: NamespaceDef; revealChild?: string } & ControlledExpandProps) {
  const [internalExpanded, internalToggle] = useToggle()
  const expanded = controlledExpanded ?? internalExpanded
  const toggle = onToggle ?? internalToggle

  const totalEntries = (def.workers?.length || 0) + (def.endpoints?.length || 0)

  return (
    <div className={`block block-namespace-def ${expanded ? 'expanded' : 'collapsed'}`}>
      <ContextualNavButtons defName={def.name} defType="namespaceDef" qualifiedName={qualifiedNameOf(def)} />
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <BlockIcon kind="namespace" />
        <span className="block-keyword">namespace</span>
        <span className="block-signature" title={`${def.name} (${totalEntries} entries)`}>{def.name} ({totalEntries} entries)</span>
        {!expanded && (() => { const s = computeSummary(def); return s ? <span className="block-summary">{s}</span> : null })()}
      </div>

      {expanded && (
        <div className="block-body">
          {def.workers?.length > 0 && (
            <div className="namespace-entry-section">
              <div className="namespace-entry-label">workers</div>
              {def.workers.map((w) => (
                <NamespaceWorkerEntry key={`${w.line}:${w.column}`} entry={w} />
              ))}
            </div>
          )}
          {def.endpoints?.length > 0 && (
            <div className="namespace-entry-section">
              <div className="namespace-entry-label">nexus endpoints</div>
              {def.endpoints.map((ep) => (
                <NamespaceEndpointEntry key={`${ep.line}:${ep.column}`} entry={ep} revealed={ep.endpointName === revealChild} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NamespaceWorkerEntry({ entry }: { entry: NamespaceWorker }) {
  const context = React.useContext(DefinitionContext)
  const workerDef = context.workers.get(entry.workerName)
  const isDefined = !!workerDef
  const hasOptions = !!entry.options?.entries?.length
  const isExpandable = isDefined || hasOptions
  const [expanded, toggle] = useToggle(false, isExpandable)

  return (
    <div className={`namespace-entry namespace-entry-worker ${expanded ? 'expanded' : 'collapsed'} ${!isDefined ? 'namespace-entry-unresolved' : ''}`}>
      <div className="namespace-entry-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <BlockIcon kind="worker" />
        <span className="namespace-entry-name">{entry.workerName}</span>
        {!isDefined && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          <OptionsSection options={entry.options} />
          {isDefined && workerDef && (
            <>
              {workerDef.workflows?.length > 0 && (
                <WorkerRefSection label="workflows" refs={workerDef.workflows} refType="workflow" />
              )}
              {workerDef.activities?.length > 0 && (
                <WorkerRefSection label="activities" refs={workerDef.activities} refType="activity" />
              )}
              {workerDef.services?.length > 0 && (
                <WorkerRefSection label="nexus services" refs={workerDef.services} refType="service" />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NamespaceEndpointEntry({ entry, revealed = false }: { entry: NamespaceEndpoint; revealed?: boolean }) {
  const hasOptions = !!entry.options?.entries?.length
  const [expanded, toggle] = useToggle(false, hasOptions)
  const [ref, flash] = useReveal<HTMLDivElement>(revealed)

  return (
    <div ref={ref} className={`namespace-entry namespace-entry-endpoint ${expanded ? 'expanded' : 'collapsed'} ${flash}`}>
      <div className="namespace-entry-header" onClick={hasOptions ? toggle : undefined}>
        {hasOptions ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <BlockIcon kind="nexusEndpoint" />
        <span className="namespace-entry-name">{entry.endpointName}</span>
      </div>

      {expanded && hasOptions && (
        <div className="block-body">
          <OptionsSection options={entry.options} />
        </div>
      )}
    </div>
  )
}

function computeSummary(def: Definition): string {
  const parts: string[] = []
  if (def.type === 'workflowDef') {
    const steps = def.body?.length || 0
    const calls = (def.body || []).filter(s =>
      s.type === 'activityCall' || s.type === 'workflowCall' || s.type === 'nexusCall'
    ).length
    // Counted apart from calls: a signal send dispatches but returns nothing,
    // so folding it into "calls" would overstate the request/response surface.
    const sends = (def.body || []).filter(s => s.type === 'signalSend').length
    const handlers = (def.signals?.length || 0) + (def.queries?.length || 0) + (def.updates?.length || 0)
    if (steps > 0) parts.push(`${steps} step${steps !== 1 ? 's' : ''}`)
    if (calls > 0) parts.push(`${calls} call${calls !== 1 ? 's' : ''}`)
    if (sends > 0) parts.push(`${sends} send${sends !== 1 ? 's' : ''}`)
    if (handlers > 0) parts.push(`${handlers} handler${handlers !== 1 ? 's' : ''}`)
  } else if (def.type === 'activityDef') {
    const steps = def.body?.length || 0
    if (steps > 0) parts.push(`${steps} step${steps !== 1 ? 's' : ''}`)
  } else if (def.type === 'workerDef') {
    const wf = def.workflows?.length || 0
    const act = def.activities?.length || 0
    const svc = def.services?.length || 0
    if (wf > 0) parts.push(`${wf} workflow${wf !== 1 ? 's' : ''}`)
    if (act > 0) parts.push(`${act} activit${act !== 1 ? 'ies' : 'y'}`)
    if (svc > 0) parts.push(`${svc} service${svc !== 1 ? 's' : ''}`)
  } else if (def.type === 'namespaceDef') {
    const w = def.workers?.length || 0
    const e = def.endpoints?.length || 0
    if (w > 0) parts.push(`${w} worker${w !== 1 ? 's' : ''}`)
    if (e > 0) parts.push(`${e} endpoint${e !== 1 ? 's' : ''}`)
  } else if (def.type === 'nexusServiceDef') {
    const asyncOps = (def.operations || []).filter(o => o.opType === 'async').length
    const syncOps = (def.operations || []).filter(o => o.opType === 'sync').length
    if (asyncOps > 0) parts.push(`${asyncOps} async`)
    if (syncOps > 0) parts.push(`${syncOps} sync`)
  }
  return parts.join(' · ')
}

function formatWorkflowSignature(def: WorkflowDef): string {
  let sig = `${def.name}(${def.params})`
  if (def.returnType) {
    sig += ` → ${def.returnType}`
  }
  return sig
}

function NexusServiceDefBlock({ def, controlledExpanded, onToggle, revealChild }: { def: NexusServiceDef; revealChild?: string } & ControlledExpandProps) {
  const [internalExpanded, internalToggle] = useToggle()
  const expanded = controlledExpanded ?? internalExpanded
  const toggle = onToggle ?? internalToggle
  const opCount = def.operations?.length || 0

  return (
    <div className={`block block-nexus-service-def ${expanded ? 'expanded' : 'collapsed'}`}>
      <ContextualNavButtons defName={def.name} defType="nexusServiceDef" qualifiedName={qualifiedNameOf(def)} />
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <BlockIcon kind="nexusService" />
        <span className="block-keyword">service</span>
        <span className="block-signature" title={`${def.name} (${opCount} operation${opCount !== 1 ? 's' : ''})`}>{def.name} ({opCount} operation{opCount !== 1 ? 's' : ''})</span>
        {!expanded && (() => { const s = computeSummary(def); return s ? <span className="block-summary">{s}</span> : null })()}
      </div>

      {expanded && (
        <div className="block-body">
          {(def.operations || []).map((op) => (
            <NexusOperationBlock key={`${op.line}:${op.column}`} operation={op} revealed={op.name === revealChild} />
          ))}
        </div>
      )}
    </div>
  )
}

export function NexusOperationBlock({ operation, revealed = false }: { operation: NexusOperation; revealed?: boolean }) {
  const context = React.useContext(DefinitionContext)

  // For async operations, look up the linked workflow to get params/return and body
  const linkedWorkflow = operation.opType === 'async' && operation.workflowName
    ? context.workflows.get(operation.workflowName)
    : undefined

  // Determine expandability
  const isExpandable = operation.opType === 'async'
    ? !!linkedWorkflow
    : !!(operation.body && operation.body.length > 0)
  const isUnresolved = operation.opType === 'async' && operation.workflowName && !linkedWorkflow

  const [expanded, toggle] = useToggle(false, isExpandable)
  const [ref, flash] = useReveal<HTMLDivElement>(revealed)

  // Build signature
  let signature: React.ReactNode
  if (operation.opType === 'async' && linkedWorkflow) {
    signature = (
      <>
        {operation.name}
        <span className="nexus-operation-grayed-sig">({linkedWorkflow.params}){linkedWorkflow.returnType ? ` → ${linkedWorkflow.returnType}` : ''}</span>
      </>
    )
  } else if (operation.opType === 'sync') {
    const params = operation.params || ''
    const ret = operation.returnType ? ` → ${operation.returnType}` : ''
    signature = `${operation.name}(${params})${ret}`
  } else {
    // Async but workflow not found
    signature = operation.name
  }

  return (
    <div ref={ref} className={`block block-nexus-operation nexus-operation-${operation.opType} ${expanded ? 'expanded' : 'collapsed'} ${isUnresolved ? 'block-unresolved' : ''} ${flash}`}>
      <div className="block-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <BlockIcon kind="nexusOperation" />
        <span className="block-keyword">{operation.opType}</span>
        <span className="block-signature">{signature}</span>
        {isUnresolved && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          {operation.opType === 'async' && linkedWorkflow ? (
            <InlineWorkflowBlock def={linkedWorkflow} />
          ) : operation.body ? (
            <SyncBodyBlock body={operation.body} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function formatActivitySignature(def: ActivityDef): string {
  let sig = `${def.name}(${def.params})`
  if (def.returnType) {
    sig += ` → ${def.returnType}`
  }
  return sig
}
