import React from 'react'
import { NavigationContext } from '../WorkflowCanvas'

interface ContextualNavProps {
  defName?: string
  defType?: string
  showDefinition?: { name: string; type: string }
}

interface NavTarget {
  name: string
  type: string
}

interface NavAction {
  label: string
  targets: NavTarget[]
}

export function ContextualNavButtons({ defName, defType, showDefinition }: ContextualNavProps) {
  const nav = React.useContext(NavigationContext)
  const actions: NavAction[] = []

  // "Show definition" for call blocks
  if (showDefinition) {
    actions.push({ label: 'Def', targets: [showDefinition] })
  }

  if (defName && defType) {
    const key = `${defType}:${defName}`

    // "Show callers"
    const callers = nav.callers.get(key)
    if (callers && callers.length > 0) {
      actions.push({ label: 'Callers', targets: callers.map(c => ({ name: c.defName, type: c.defType })) })
    }

    // "Show worker" for workflow/activity/nexusService
    if (defType === 'workflowDef' || defType === 'activityDef' || defType === 'nexusServiceDef') {
      const workers = nav.workerOf.get(key)
      if (workers && workers.length > 0) {
        actions.push({ label: 'Worker', targets: workers.map(w => ({ name: w, type: 'workerDef' })) })
      }
    }

    // "Show namespace" for workers
    if (defType === 'workerDef') {
      const namespaces = nav.namespaceOf.get(key)
      if (namespaces && namespaces.length > 0) {
        actions.push({ label: 'NS', targets: namespaces.map(n => ({ name: n, type: 'namespaceDef' })) })
      }
    }
  }

  if (actions.length === 0) return null

  return (
    <div className="ctx-nav-buttons" onClick={e => e.stopPropagation()}>
      {actions.map(action => (
        <NavButton key={action.label} action={action} onNavigate={nav.navigateTo} />
      ))}
    </div>
  )
}

function NavButton({ action, onNavigate }: { action: NavAction; onNavigate: (name: string, type: string) => void }) {
  const [popoverOpen, setPopoverOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  // Close popover on outside click
  React.useEffect(() => {
    if (!popoverOpen) return
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popoverOpen])

  // Close on Escape
  React.useEffect(() => {
    if (!popoverOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setPopoverOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [popoverOpen])

  const handleClick = () => {
    if (action.targets.length === 1) {
      onNavigate(action.targets[0].name, action.targets[0].type)
    } else {
      setPopoverOpen(!popoverOpen)
    }
  }

  return (
    <div className="ctx-nav-btn-wrapper" ref={wrapperRef}>
      <button
        className={`ctx-nav-btn ${popoverOpen ? 'active' : ''}`}
        onClick={handleClick}
        title={`Show ${action.label.toLowerCase()}`}
      >
        {action.label}
        {action.targets.length > 1 && <span className="ctx-nav-count">{action.targets.length}</span>}
      </button>

      {popoverOpen && (
        <div className="ctx-nav-popover">
          {action.targets.map(t => (
            <button
              key={`${t.type}:${t.name}`}
              className="ctx-nav-popover-item"
              onClick={() => {
                onNavigate(t.name, t.type)
                setPopoverOpen(false)
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
