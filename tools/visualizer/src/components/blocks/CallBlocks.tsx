import React from 'react'
import type { ActivityCall, WorkflowCall, NexusCall, SignalDecl, QueryDecl, UpdateDecl } from '../../types/ast'
import { DefinitionContext, HandlerContext } from '../WorkflowCanvas'
import { WorkflowContent, InlineWorkflowBlock, SyncBodyBlock } from './WorkflowContent'
import { useToggle } from './useToggle'
import { StatementBlock } from './StatementBlock'
import { ContextualNavButtons } from './ContextualNav'
import { OptionsSection } from './OptionsSection'

// Activity Call - expandable to show activity definition body directly
export function ActivityCallBlock({ stmt }: { stmt: ActivityCall }) {
  const context = React.useContext(DefinitionContext)
  const activityDef = context.activities.get(stmt.name)
  const isDefined = !!activityDef
  const hasOptions = !!stmt.options?.entries?.length
  const isExpandable = isDefined || hasOptions
  const [expanded, toggle] = useToggle(false, isExpandable)

  const signature = formatActivityCallSignature(stmt)

  return (
    <div className={`block block-activity ${expanded ? 'expanded' : 'collapsed'} ${!isDefined ? 'block-unresolved' : ''}`}>
      {isDefined && <ContextualNavButtons showDefinition={{ name: stmt.name, type: 'activityDef' }} />}
      <div className="block-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <span className="block-keyword">activity</span>
        <span className="block-signature" title={signature}>{signature}</span>
        {!isDefined && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          <OptionsSection options={stmt.options} />
          {isDefined && ((activityDef.body || []).length > 0 ? (
            (activityDef.body || []).map((s) => (
              <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
            ))
          ) : (
            <div className="block-empty-body">No implementation defined</div>
          ))}
        </div>
      )}
    </div>
  )
}

// Workflow Call - expandable to show workflow definition body directly
export function WorkflowCallBlock({ stmt }: { stmt: WorkflowCall }) {
  const context = React.useContext(DefinitionContext)
  const workflowDef = context.workflows.get(stmt.name)
  const isDefined = !!workflowDef
  const hasOptions = !!stmt.options?.entries?.length
  const isExpandable = isDefined || hasOptions
  const [expanded, toggle] = useToggle(false, isExpandable)

  const modePrefix = stmt.mode === 'detach' ? 'detach ' : ''
  const signature = formatWorkflowCallSignature(stmt)

  return (
    <div className={`block block-workflow-call block-mode-${stmt.mode} ${expanded ? 'expanded' : 'collapsed'} ${!isDefined ? 'block-unresolved' : ''}`}>
      {isDefined && <ContextualNavButtons showDefinition={{ name: stmt.name, type: 'workflowDef' }} />}
      <div className="block-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <span className="block-keyword">{modePrefix}workflow</span>
        <span className="block-signature" title={signature}>{signature}</span>
        {!isDefined && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          <OptionsSection options={stmt.options} />
          {isDefined && (
            <WorkflowCallHandlerScope def={workflowDef}>
              <WorkflowContent def={workflowDef} />
            </WorkflowCallHandlerScope>
          )}
        </div>
      )}
    </div>
  )
}

// Provides the target workflow's handler context for inline expansion,
// so await-signal/update/query blocks resolve against the correct handlers.
function WorkflowCallHandlerScope({ def, children }: { def: import('../../types/ast').WorkflowDef; children: React.ReactNode }) {
  const handlerContext = React.useMemo<HandlerContext>(() => {
    const signals = new Map<string, SignalDecl>()
    const queries = new Map<string, QueryDecl>()
    const updates = new Map<string, UpdateDecl>()

    for (const s of def.signals || []) signals.set(s.name, s)
    for (const q of def.queries || []) queries.set(q.name, q)
    for (const u of def.updates || []) updates.set(u.name, u)

    return { signals, queries, updates }
  }, [def])

  return (
    <HandlerContext.Provider value={handlerContext}>
      {children}
    </HandlerContext.Provider>
  )
}

// Nexus Call - calls a nexus service operation (expandable via service context lookup)
export function NexusCallBlock({ stmt }: { stmt: NexusCall }) {
  const context = React.useContext(DefinitionContext)

  // Look up the service and operation from context
  const serviceDef = context.nexusServices.get(stmt.service)
  const operation = serviceDef?.operations?.find(op => op.name === stmt.operation)
  const isDefined = !!operation

  // For expansion: async shows linked workflow, sync shows body
  const linkedWorkflow = operation?.opType === 'async' && operation.workflowName
    ? context.workflows.get(operation.workflowName)
    : undefined
  const hasInlineBody = operation?.opType === 'async' ? !!linkedWorkflow : !!(operation?.body && operation.body.length > 0)
  const hasOptions = !!stmt.options?.entries?.length
  const isExpandable = hasInlineBody || hasOptions

  const [expanded, toggle] = useToggle(false, isExpandable)

  const modePrefix = stmt.detach ? 'detach ' : ''
  const signature = `${stmt.endpoint} ${stmt.service}.${stmt.operation}(${stmt.args})`
  const result = stmt.result ? ` → ${stmt.result}` : ''

  return (
    <div className={`block block-nexus-call ${stmt.detach ? 'block-mode-detach' : ''} ${expanded ? 'expanded' : 'collapsed'} ${!isDefined && stmt.service ? 'block-unresolved' : ''}`}>
      {serviceDef && <ContextualNavButtons showDefinition={{ name: stmt.service, type: 'nexusServiceDef' }} />}
      <div className="block-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <span className="block-keyword">{modePrefix}nexus</span>
        <span className="block-signature" title={`${signature}${result}`}>{signature}{result}</span>
        {!isDefined && stmt.service && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          <OptionsSection options={stmt.options} />
          {hasInlineBody && (
            operation?.opType === 'async' && linkedWorkflow ? (
              <InlineWorkflowBlock def={linkedWorkflow} />
            ) : operation?.body ? (
              <SyncBodyBlock body={operation.body} />
            ) : null
          )}
        </div>
      )}
    </div>
  )
}

function formatActivityCallSignature(stmt: ActivityCall): string {
  let sig = `${stmt.name}(${stmt.args})`
  if (stmt.result) {
    sig += ` → ${stmt.result}`
  }
  return sig
}

function formatWorkflowCallSignature(stmt: WorkflowCall): string {
  let sig = `${stmt.name}(${stmt.args})`
  if (stmt.result) {
    sig += ` → ${stmt.result}`
  }
  return sig
}
