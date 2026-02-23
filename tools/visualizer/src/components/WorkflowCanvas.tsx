import React from 'react'
import type { TWFFile, WorkflowDef, ActivityDef, WorkerDef, NamespaceDef, NexusServiceDef, SignalDecl, QueryDecl, UpdateDecl } from '../types/ast'
import { TreeView } from './TreeView'
import { GraphView } from './GraphView'

interface WorkflowCanvasProps {
  ast: TWFFile
  onOpenFile?: (file: string) => void
}

export interface DefinitionContext {
  workflows: Map<string, WorkflowDef>
  activities: Map<string, ActivityDef>
  workers: Map<string, WorkerDef>
  nexusServices: Map<string, NexusServiceDef>
  namespaces: Map<string, NamespaceDef>
}

// Context for looking up signal/query/update handlers in the current workflow
export interface HandlerContext {
  signals: Map<string, SignalDecl>
  queries: Map<string, QueryDecl>
  updates: Map<string, UpdateDecl>
}

export const DefinitionContext = React.createContext<DefinitionContext>({
  workflows: new Map(),
  activities: new Map(),
  workers: new Map(),
  nexusServices: new Map(),
  namespaces: new Map(),
})

export const HandlerContext = React.createContext<HandlerContext>({
  signals: new Map(),
  queries: new Map(),
  updates: new Map(),
})

// Reverse reference index for contextual navigation
export interface CallerRef {
  defName: string
  defType: string
}

export interface NavigationContextType {
  callers: Map<string, CallerRef[]>
  workerOf: Map<string, string[]>
  namespaceOf: Map<string, string[]>
  navigateTo: (name: string, defType: string) => void
}

export const NavigationContext = React.createContext<NavigationContextType>({
  callers: new Map(),
  workerOf: new Map(),
  namespaceOf: new Map(),
  navigateTo: () => {},
})

type ActiveView = 'tree' | 'graph'

export function WorkflowCanvas({ ast, onOpenFile }: WorkflowCanvasProps) {
  const [activeView, setActiveView] = React.useState<ActiveView>('tree')

  // Build lookup maps for definitions (shared by both views)
  const context = React.useMemo<DefinitionContext>(() => {
    const workflows = new Map<string, WorkflowDef>()
    const activities = new Map<string, ActivityDef>()
    const workers = new Map<string, WorkerDef>()
    const nexusServices = new Map<string, NexusServiceDef>()
    const namespaces = new Map<string, NamespaceDef>()

    for (const def of ast.definitions) {
      if (def.type === 'workflowDef') {
        workflows.set(def.name, def)
      } else if (def.type === 'activityDef') {
        activities.set(def.name, def)
      } else if (def.type === 'workerDef') {
        workers.set(def.name, def)
      } else if (def.type === 'nexusServiceDef') {
        nexusServices.set(def.name, def)
      } else if (def.type === 'namespaceDef') {
        namespaces.set(def.name, def)
      }
    }

    return { workflows, activities, workers, nexusServices, namespaces }
  }, [ast])

  return (
    <DefinitionContext.Provider value={context}>
      <div className="view-shell">
        <div className="tab-bar">
          <button
            className={`tab-bar-btn ${activeView === 'tree' ? 'active' : ''}`}
            onClick={() => setActiveView('tree')}
          >
            Tree
          </button>
          <button
            className={`tab-bar-btn ${activeView === 'graph' ? 'active' : ''}`}
            onClick={() => setActiveView('graph')}
          >
            Graph
          </button>
        </div>

        {activeView === 'tree' ? (
          <TreeView ast={ast} onOpenFile={onOpenFile} />
        ) : (
          <GraphView ast={ast} />
        )}
      </div>
    </DefinitionContext.Provider>
  )
}
