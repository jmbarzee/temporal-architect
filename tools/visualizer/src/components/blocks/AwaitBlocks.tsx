import React from 'react'
import type {
  Statement,
  AsyncTarget,
  AwaitStmt,
  AwaitAllBlock,
  AwaitOneBlock,
  AwaitOneCase,
  WorkflowDef,
} from '../../types/ast'
import { DefinitionContext, HandlerContext } from '../WorkflowCanvas'
import { useToggle } from './useToggle'
import { StatementBlock } from './StatementBlock'
import { InlineWorkflowBlock, SyncBodyBlock } from './WorkflowContent'
import { THEME, AWAIT_TARGET_THEME } from '../../theme/temporal-theme'

// Shared await target display - both getAwaitStmtDisplay and getAwaitOneCaseDisplay delegate here
function getAwaitTargetDisplay(
  target: AsyncTarget,
  context: { activities: Map<string, any>; workflows: Map<string, any>; nexusServices: Map<string, any> },
  handlers: { signals: Map<string, any>; updates: Map<string, any> },
): { icon: string; keyword: string; signature: string; expandableDef?: { body?: Statement[] }; nexusAsyncWorkflow?: WorkflowDef; nexusSyncBody?: Statement[]; isUnresolved: boolean } {
  switch (target.kind) {
    case 'timer':
      return { icon: AWAIT_TARGET_THEME.timer.icon, keyword: 'timer', signature: `(${target.timer!.duration || ''})`, isUnresolved: false }
    case 'signal': {
      const sig = target.signal!.name || ''
      const params = target.signal!.params ? ` → ${target.signal!.params}` : ''
      const handler = handlers.signals.get(sig)
      return { icon: AWAIT_TARGET_THEME.signal.icon, keyword: 'signal', signature: `${sig}${params}`, expandableDef: handler, isUnresolved: !handler }
    }
    case 'update': {
      const sig = target.update!.name || ''
      const params = target.update!.params ? ` → ${target.update!.params}` : ''
      const handler = handlers.updates.get(sig)
      return { icon: AWAIT_TARGET_THEME.update.icon, keyword: 'update', signature: `${sig}${params}`, expandableDef: handler, isUnresolved: !handler }
    }
    case 'activity': {
      const sig = `${target.activity!.name || ''}(${target.activity!.args || ''})`
      const result = target.activity!.result ? ` → ${target.activity!.result}` : ''
      const def = context.activities.get(target.activity!.name || '')
      return { icon: AWAIT_TARGET_THEME.activity.icon, keyword: 'activity', signature: `${sig}${result}`, expandableDef: def, isUnresolved: !def }
    }
    case 'workflow': {
      const modePrefix = target.workflow!.mode === 'detach' ? 'detach ' : ''
      const sig = `${target.workflow!.name || ''}(${target.workflow!.args || ''})`
      const result = target.workflow!.result ? ` → ${target.workflow!.result}` : ''
      const def = context.workflows.get(target.workflow!.name || '')
      return { icon: AWAIT_TARGET_THEME.workflow.icon, keyword: `${modePrefix}workflow`, signature: `${sig}${result}`, expandableDef: def, isUnresolved: !def }
    }
    case 'nexus': {
      const detachPrefix = target.nexus!.detach ? 'detach ' : ''
      const sig = `${target.nexus!.endpoint || ''} ${target.nexus!.service || ''}.${target.nexus!.operation || ''}(${target.nexus!.args || ''})`
      const result = target.nexus!.result ? ` → ${target.nexus!.result}` : ''
      // Look up service and operation from context
      const serviceDef = context.nexusServices.get(target.nexus!.service || '')
      const operation = serviceDef?.operations?.find((op: any) => op.name === (target.nexus!.operation || ''))
      const isUnresolved = !!(target.nexus!.service && !serviceDef)
      if (operation?.opType === 'async' && operation.workflowName) {
        const wf = context.workflows.get(operation.workflowName)
        if (wf) {
          return { icon: AWAIT_TARGET_THEME.nexus.icon, keyword: `${detachPrefix}nexus`, signature: `${sig}${result}`, nexusAsyncWorkflow: wf, isUnresolved }
        }
      } else if (operation?.opType === 'sync' && operation.body) {
        return { icon: AWAIT_TARGET_THEME.nexus.icon, keyword: `${detachPrefix}nexus`, signature: `${sig}${result}`, nexusSyncBody: operation.body, isUnresolved }
      }
      return { icon: AWAIT_TARGET_THEME.nexus.icon, keyword: `${detachPrefix}nexus`, signature: `${sig}${result}`, isUnresolved }
    }
    case 'ident': {
      const name = target.ident!.name || ''
      const result = target.ident!.result ? ` → ${target.ident!.result}` : ''
      return { icon: AWAIT_TARGET_THEME.ident.icon, keyword: '', signature: `${name}${result}`, isUnresolved: false }
    }
    default:
      return { icon: '?', keyword: '', signature: '', isUnresolved: false }
  }
}

// Get display info for single await statements
function getAwaitStmtDisplay(
  stmt: AwaitStmt,
  context: { activities: Map<string, any>; workflows: Map<string, any>; nexusServices: Map<string, any> },
  handlers: { signals: Map<string, any>; updates: Map<string, any> },
): { icon: string; keyword: string; signature: string; blockClass: string; expandableDef?: { body?: Statement[] }; nexusAsyncWorkflow?: WorkflowDef; nexusSyncBody?: Statement[]; isUnresolved: boolean } {
  const target = getAwaitTargetDisplay(stmt.target, context, handlers)
  // Detached await targets (workflow or nexus) get dashed border styling
  const isDetach = (stmt.target.kind === 'workflow' && stmt.target.workflow?.mode === 'detach')
    || (stmt.target.kind === 'nexus' && stmt.target.nexus?.detach)
  return {
    ...target,
    // Activity/workflow/nexus use SVG icons at block level, not text icons
    icon: (stmt.target.kind === 'activity' || stmt.target.kind === 'workflow' || stmt.target.kind === 'nexus') ? '' : target.icon,
    keyword: target.keyword ? `await ${target.keyword}` : 'await',
    blockClass: `block-await-stmt block-await-stmt-${stmt.target.kind}${isDetach ? ' block-mode-detach' : ''}`,
  }
}

// Get display info for await one cases
function getAwaitOneCaseDisplay(
  c: AwaitOneCase,
  context: { activities: Map<string, any>; workflows: Map<string, any>; nexusServices: Map<string, any> },
  handlers: { signals: Map<string, any>; updates: Map<string, any> },
): { contentClass: string; icon: string; keyword: string; signature: string; isUnresolved: boolean } {
  // await_all is case-only, handle separately
  if (c.awaitAll != null) {
    return { contentClass: 'tagged-await-all', icon: THEME.awaitAll.icon, keyword: 'await all', signature: `${c.awaitAll?.body?.length || 0} branch(es)`, isUnresolved: false }
  }
  const target = getAwaitTargetDisplay(c.target!, context, handlers)
  return {
    icon: target.icon,
    keyword: target.keyword,
    signature: target.signature,
    isUnresolved: target.isUnresolved,
    contentClass: `tagged-${c.target!.kind}`,
  }
}

// Single await statement - await timer/signal/update/activity/workflow
export function AwaitStmtBlock({ stmt }: { stmt: AwaitStmt }) {
  const context = React.useContext(DefinitionContext)
  const handlers = React.useContext(HandlerContext)

  const { icon, keyword, signature, blockClass, expandableDef, nexusAsyncWorkflow, nexusSyncBody, isUnresolved } = getAwaitStmtDisplay(stmt, context, handlers)
  const isExpandable = !!(expandableDef || nexusAsyncWorkflow || nexusSyncBody)
  const [expanded, toggle] = useToggle(false, isExpandable)

  return (
    <div className={`block ${blockClass} ${expanded ? 'expanded' : 'collapsed'} ${isUnresolved ? 'block-unresolved' : ''}`}>
      <div className="block-header" onClick={toggle}>
        {isExpandable ? (
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        ) : (
          <span className="block-toggle-placeholder" />
        )}
        <span className="block-icon">{icon}</span>
        <span className="block-keyword">{keyword}</span>
        <span className="block-signature">{signature}</span>
        {isUnresolved && <span className="block-unresolved-badge">?</span>}
      </div>

      {expanded && isExpandable && (
        <div className="block-body">
          {nexusAsyncWorkflow ? (
            <InlineWorkflowBlock def={nexusAsyncWorkflow} />
          ) : nexusSyncBody ? (
            <SyncBodyBlock body={nexusSyncBody} />
          ) : expandableDef && (expandableDef.body || []).length > 0 ? (
            (expandableDef.body || []).map((s) => (
              <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
            ))
          ) : (
            <div className="block-empty-body">No implementation defined</div>
          )}
        </div>
      )}
    </div>
  )
}

// Await All - expandable to show body (waits for all operations to complete)
export function AwaitAllBlockComponent({ stmt }: { stmt: AwaitAllBlock }) {
  const [expanded, toggle] = useToggle(true)

  return (
    <div className={`block block-await-all ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-icon">{THEME.awaitAll.icon}</span>
        <span className="block-keyword">await all</span>
        <span className="block-signature">{(stmt.body || []).length} branch(es)</span>
      </div>

      {expanded && (
        <div className="block-body">
          {(stmt.body || []).map((s) => (
            <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
          ))}
        </div>
      )}
    </div>
  )
}

// Await One - expandable, shows cases where first to complete wins
export function AwaitOneBlockComponent({ stmt }: { stmt: AwaitOneBlock }) {
  const [expanded, toggle] = useToggle(true)
  const caseWord = stmt.cases.length === 1 ? 'case' : 'cases'

  return (
    <div className={`block block-await-one ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-icon-placeholder" />
        <span className="block-keyword">await one</span>
        <span className="block-signature">first of {stmt.cases.length} {caseWord}</span>
      </div>

      {expanded && (
        <div className="block-body">
          {stmt.cases.map((c) => (
            <AwaitOneCaseBlock key={`${c.line}:${c.column}`} awaitCase={c} />
          ))}
        </div>
      )}
    </div>
  )
}

// Render await one cases with unified tag design
function AwaitOneCaseBlock({ awaitCase }: { awaitCase: AwaitOneCase }) {
  const context = React.useContext(DefinitionContext)
  const handlers = React.useContext(HandlerContext)
  const hasBody = awaitCase.body && awaitCase.body.length > 0
  const isExpandable = hasBody || !!awaitCase.awaitAll
  const [expanded, toggle] = useToggle(false, isExpandable)

  // Determine display based on case kind
  const { contentClass, icon, keyword, signature, isUnresolved } = getAwaitOneCaseDisplay(awaitCase, context, handlers)

  return (
    <div className={`tagged-composite ${expanded ? 'expanded' : ''} ${isUnresolved ? 'tagged-unresolved' : ''}`}>
      <div className="tagged-tag">
        <span className="tagged-tag-label">option</span>
      </div>
      <div className={`tagged-content ${contentClass} ${isExpandable ? 'expandable' : ''}`} onClick={toggle}>
        {isExpandable && <span className="block-toggle">{expanded ? '▼' : '▶'}</span>}
        {!isExpandable && <span className="block-toggle-placeholder" />}
        <span className="tagged-icon">{icon}</span>
        <span className="tagged-kind">{keyword}</span>
        <span className="tagged-name">{signature}</span>
        {isUnresolved && <span className="block-unresolved-badge">?</span>}
      </div>
      {expanded && (
        <div className="tagged-body">
          {/* For await_all cases, show the nested await all block */}
          {awaitCase.awaitAll && (
            <AwaitAllBlockComponent stmt={awaitCase.awaitAll} />
          )}
          {/* Then show the body */}
          {hasBody && awaitCase.body.map((s) => (
            <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
          ))}
        </div>
      )}
    </div>
  )
}
