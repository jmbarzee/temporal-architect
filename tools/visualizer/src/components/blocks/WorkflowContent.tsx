import React from 'react'
import type { WorkflowDef, HandlerDecl, Statement } from '../../types/ast'
import { siteKey } from '../../types/ast'
import { StatementBlock, StatementBody } from './StatementBlock'
import { THEME, HANDLER_CONFIG, BlockIcon } from '../../theme/temporal-theme'
import { useToggle } from './useToggle'
import { HandlerContext } from '../WorkflowCanvas'
import { handlersOf } from '../definitionMaps'
import { OptionsSection } from './OptionsSection'
import './blocks.css'

function HandlerDeclBlock({ decl }: { decl: HandlerDecl }) {
  const hasBody = !!(decl.body && decl.body.length > 0)
  const hasOptions = !!decl.options?.entries?.length
  const isExpandable = hasBody || hasOptions
  const [expanded, toggle] = useToggle(false, isExpandable)
  const { icon, keyword, cssClass } = HANDLER_CONFIG[decl.type]

  let signature = `${decl.name}(${decl.params})`
  if ('returnType' in decl && decl.returnType) signature += ` → ${decl.returnType}`

  return (
    <div className={`declaration ${cssClass} ${expanded ? 'expanded' : ''}`}>
      <div className="declaration-header" onClick={toggle}>
        {isExpandable && <span className="block-toggle">{expanded ? '▼' : '▶'}</span>}
        {!isExpandable && <span className="block-toggle-placeholder" />}
        <span className="declaration-icon">{icon}</span>
        <span className="declaration-keyword">{keyword}</span>
        <span className="declaration-name">{signature}</span>
      </div>
      {expanded && isExpandable && (
        <div className="declaration-body">
          <OptionsSection options={decl.options} />
          {hasBody && decl.body!.map((stmt) => (
            <StatementBlock key={siteKey(stmt.site)} statement={stmt} />
          ))}
        </div>
      )}
    </div>
  )
}

export function WorkflowContent({ def }: { def: WorkflowDef }) {
  const [stateExpanded, toggleState] = useToggle()
  const [signalsExpanded, toggleSignals] = useToggle()
  const [queriesExpanded, toggleQueries] = useToggle()
  const [updatesExpanded, toggleUpdates] = useToggle()

  const hasState = def.state && ((def.state.conditions && def.state.conditions.length > 0) || (def.state.rawStmts && def.state.rawStmts.length > 0))
  const hasSignals = def.signals && def.signals.length > 0
  const hasQueries = def.queries && def.queries.length > 0
  const hasUpdates = def.updates && def.updates.length > 0

  const stateItemCount = (def.state?.conditions?.length || 0) + (def.state?.rawStmts?.length || 0)

  return (
    <>
      {/* ID scheme - the template every start and addressed send derives the ID from */}
      {def.idScheme && (
        <div className="block-declarations-group">
          <div className="declarations-header declarations-header-static">
            <span className="block-toggle-placeholder" />
            <span className="declarations-label">id_scheme</span>
            <span className="block-summary" title={def.idScheme.template}>{JSON.stringify(def.idScheme.template)}</span>
          </div>
        </div>
      )}
      {/* State block - conditions and raw state declarations */}
      {hasState && (
        <div className="block-declarations-group">
          <div className="declarations-header" onClick={toggleState}>
            <span className="block-toggle">{stateExpanded ? '▼' : '▶'}</span>
            <span className="declarations-icon declaration-condition">{THEME.conditionSet.icon}</span>
            <span className="declarations-label">state</span>
            <span className="declarations-count">({stateItemCount})</span>
          </div>
          {stateExpanded && (
            <div className="block-declarations">
              {(def.state!.conditions || []).map((c) => (
                <div key={siteKey(c.site)} className="declaration declaration-condition">
                  <div className="declaration-header">
                    <span className="block-toggle-placeholder" />
                    <span className="declaration-icon">{THEME.conditionSet.icon}</span>
                    <span className="declaration-keyword">condition</span>
                    <span className="declaration-name">{c.name}</span>
                  </div>
                </div>
              ))}
              {(def.state!.rawStmts || []).map((r) => (
                <div key={siteKey(r.site)} className="declaration declaration-raw-state">
                  <div className="declaration-header">
                    <span className="block-toggle-placeholder" />
                    <span className="declaration-icon">{THEME.raw.icon}</span>
                    <span className="declaration-name">{r.text}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Signals - data flowing IN to workflow */}
      {hasSignals && (
        <div className="block-declarations-group">
          <div className="declarations-header" onClick={toggleSignals}>
            <span className="block-toggle">{signalsExpanded ? '▼' : '▶'}</span>
            <span className="declarations-icon declaration-signal">{THEME.signal.icon}</span>
            <span className="declarations-label">signals</span>
            <span className="declarations-count">({def.signals!.length})</span>
          </div>
          {signalsExpanded && (
            <div className="block-declarations">
              {def.signals!.map((s) => (
                <HandlerDeclBlock key={siteKey(s.site)} decl={s} />
              ))}
            </div>
          )}
        </div>
      )}
      {/* Queries - data flowing OUT of workflow */}
      {hasQueries && (
        <div className="block-declarations-group">
          <div className="declarations-header" onClick={toggleQueries}>
            <span className="block-toggle">{queriesExpanded ? '▼' : '▶'}</span>
            <span className="declarations-icon declaration-query">{THEME.query.icon}</span>
            <span className="declarations-label">queries</span>
            <span className="declarations-count">({def.queries!.length})</span>
          </div>
          {queriesExpanded && (
            <div className="block-declarations">
              {def.queries!.map((q) => (
                <HandlerDeclBlock key={siteKey(q.site)} decl={q} />
              ))}
            </div>
          )}
        </div>
      )}
      {/* Updates - data flowing BOTH ways */}
      {hasUpdates && (
        <div className="block-declarations-group">
          <div className="declarations-header" onClick={toggleUpdates}>
            <span className="block-toggle">{updatesExpanded ? '▼' : '▶'}</span>
            <span className="declarations-icon declaration-update">{THEME.update.icon}</span>
            <span className="declarations-label">updates</span>
            <span className="declarations-count">({def.updates!.length})</span>
          </div>
          {updatesExpanded && (
            <div className="block-declarations">
              {def.updates!.map((u) => (
                <HandlerDeclBlock key={siteKey(u.site)} decl={u} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body statements — wrapped in a control-flow container so the body
          reads as one cohesive procedure block */}
      <StatementBody statements={def.body || []} />
    </>
  )
}

// Inline workflow block — renders a workflow as a call-style purple block.
// Used by nexus async operations to show the backing workflow with clear indirection.
export function InlineWorkflowBlock({ def }: { def: WorkflowDef }) {
  const [expanded, toggle] = useToggle()
  const signature = `${def.name}(${def.params})${def.returnType ? ` → ${def.returnType}` : ''}`

  // Build handler context for signal/query/update resolution within this workflow
  const handlerContext = React.useMemo<HandlerContext>(() => handlersOf(def), [def])

  return (
    <HandlerContext.Provider value={handlerContext}>
      <div className={`block block-workflow-call ${expanded ? 'expanded' : 'collapsed'}`}>
        <div className="block-header" onClick={toggle}>
          <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
          <BlockIcon kind="workflow" />
          <span className="block-keyword">workflow</span>
          <span className="block-signature">{signature}</span>
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

// Sync handler block — wraps sync operation statements in a control-flow-themed block.
// Provides visual indirection parallel to InlineWorkflowBlock for async operations.
export function SyncBodyBlock({ body }: { body: Statement[] }) {
  const [expanded, toggle] = useToggle(true)

  return (
    <div className={`block block-sync-body ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-keyword">handler</span>
      </div>
      {expanded && (
        <div className="block-body">
          {body.map((s) => (
            <StatementBlock key={siteKey(s.site)} statement={s} />
          ))}
        </div>
      )}
    </div>
  )
}
