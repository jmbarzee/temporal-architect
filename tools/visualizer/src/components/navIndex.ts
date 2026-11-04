import type { AsyncTarget, Definition, Statement } from '../types/ast'
import { firstByName, handlersOf, keptDefinitions } from './definitionMaps'
import type { CallerRef } from './WorkflowCanvas'

// buildNavIndex is the Tree's reverse reference index for contextual
// navigation: who calls each definition, and which workers and namespaces hold
// it. These relate definitions, so a name declared twice (a DUPLICATE_* resolve
// error) takes part only through its first declaration, as the resolver keeps
// it: kept definitions, and their kept handlers and operations.
export function buildNavIndex(definitions: Definition[]) {
  const callers = new Map<string, CallerRef[]>()
  const workerOf = new Map<string, string[]>()
  const namespaceOf = new Map<string, string[]>()

  function addCaller(key: string, caller: CallerRef) {
    const list = callers.get(key) || []
    if (!list.some(c => c.defName === caller.defName && c.defType === caller.defType)) {
      list.push(caller)
      callers.set(key, list)
    }
  }

  function addTo(map: Map<string, string[]>, key: string, value: string) {
    const list = map.get(key) || []
    if (!list.includes(value)) {
      list.push(value)
      map.set(key, list)
    }
  }

  function walkTarget(target: AsyncTarget, callerDef: Definition) {
    if (target.activity) addCaller(`activityDef:${target.activity.name}`, { defName: callerDef.name, defType: callerDef.type })
    if (target.workflow) addCaller(`workflowDef:${target.workflow.name}`, { defName: callerDef.name, defType: callerDef.type })
    if (target.nexus) addCaller(`nexusServiceDef:${target.nexus.service}`, { defName: callerDef.name, defType: callerDef.type })
  }

  function walkStmts(stmts: Statement[], callerDef: Definition) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case 'activityCall':
          addCaller(`activityDef:${stmt.name}`, { defName: callerDef.name, defType: callerDef.type })
          break
        case 'workflowCall':
          addCaller(`workflowDef:${stmt.name}`, { defName: callerDef.name, defType: callerDef.type })
          break
        case 'nexusCall':
          addCaller(`nexusServiceDef:${stmt.service}`, { defName: callerDef.name, defType: callerDef.type })
          break
        case 'signalSend':
          // A send is a real inbound reference for "show callers", but only
          // once the resolver has followed the handle to a target workflow.
          if (stmt.resolved) {
            addCaller(`workflowDef:${stmt.resolved.name}`, { defName: callerDef.name, defType: callerDef.type })
          }
          break
        case 'await':
          walkTarget(stmt.target, callerDef)
          break
        case 'promise':
          walkTarget(stmt.target, callerDef)
          break
        case 'awaitAll':
          walkStmts(stmt.body || [], callerDef)
          break
        case 'awaitOne':
          for (const c of stmt.cases || []) {
            if (c.target) walkTarget(c.target, callerDef)
            if (c.awaitAll) walkStmts(c.awaitAll.body || [], callerDef)
            walkStmts(c.body || [], callerDef)
          }
          break
        case 'if':
          walkStmts(stmt.body || [], callerDef)
          walkStmts(stmt.elseBody || [], callerDef)
          break
        case 'for':
          walkStmts(stmt.body || [], callerDef)
          break
        case 'switch':
          for (const c of stmt.cases || []) walkStmts(c.body || [], callerDef)
          if (stmt.default) walkStmts(stmt.default, callerDef)
          break
      }
    }
  }

  for (const def of keptDefinitions(definitions)) {
    if (def.type === 'workflowDef') {
      walkStmts(def.body || [], def)
      const handlers = handlersOf(def)
      for (const s of handlers.signals.values()) walkStmts(s.body || [], def)
      for (const q of handlers.queries.values()) walkStmts(q.body || [], def)
      for (const u of handlers.updates.values()) walkStmts(u.body || [], def)
    } else if (def.type === 'activityDef') {
      walkStmts(def.body || [], def)
    } else if (def.type === 'nexusServiceDef') {
      for (const op of firstByName(def.operations)) {
        if (op.opType === 'async' && op.workflowName) {
          addCaller(`workflowDef:${op.workflowName}`, { defName: def.name, defType: def.type })
        }
        if (op.body) walkStmts(op.body, def)
      }
    }

    // Containment: workerOf
    if (def.type === 'workerDef') {
      for (const ref of def.workflows || []) addTo(workerOf, `workflowDef:${ref.name}`, def.name)
      for (const ref of def.activities || []) addTo(workerOf, `activityDef:${ref.name}`, def.name)
      for (const ref of def.services || []) addTo(workerOf, `nexusServiceDef:${ref.name}`, def.name)
    }

    // Containment: namespaceOf
    if (def.type === 'namespaceDef') {
      for (const w of def.workers || []) addTo(namespaceOf, `workerDef:${w.workerName}`, def.name)
    }
  }


  return { callers, workerOf, namespaceOf }
}
