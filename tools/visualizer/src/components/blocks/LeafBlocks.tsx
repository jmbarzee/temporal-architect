import type {
  ReturnStmt,
  CloseStmt,
  RawStmt,
  Comment,
  PromiseStmt,
  SetStmt,
  UnsetStmt,
} from '../../types/ast'
// Return
export function ReturnBlock({ stmt }: { stmt: ReturnStmt }) {
  return (
    <div className="block block-return collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">return</span>
        {stmt.value && <span className="block-signature">{stmt.value}</span>}
      </div>
    </div>
  )
}

// Close - workflow termination
export function CloseBlock({ stmt }: { stmt: CloseStmt }) {
  const statusClass = stmt.reason === 'continue_as_new' ? 'close-continue-as-new' : stmt.reason === 'fail' ? 'close-failed' : ''

  return (
    <div className={`block block-close ${statusClass} collapsed`}>
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">close</span>
        <span className="block-signature">
          <span className="close-reason">{stmt.reason}</span>
          {stmt.args && <span>({stmt.args})</span>}
        </span>
      </div>
    </div>
  )
}

// Raw statement (code) — naked line that aligns flush with sibling block edges
export function RawBlock({ stmt }: { stmt: RawStmt }) {
  return (
    <div className="block block-raw collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-code">{stmt.text}</span>
      </div>
    </div>
  )
}

// Comment — naked line prefixed with the DSL's `#` so it aligns with raw
// statements rather than reading as de-dented.
export function CommentBlock({ stmt }: { stmt: Comment }) {
  return (
    <div className="block block-comment collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-comment-text" title={stmt.text}># {stmt.text}</span>
      </div>
    </div>
  )
}

// Simple block (break, continue)
export function SimpleBlock({ keyword, className }: { keyword: string; className: string }) {
  return (
    <div className={`block ${className} collapsed`}>
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">{keyword}</span>
      </div>
    </div>
  )
}

// Promise statement - non-blocking async declaration
export function PromiseBlock({ stmt }: { stmt: PromiseStmt }) {
  // Determine the async target description
  let target = ''
  switch (stmt.target.kind) {
    case 'activity':
      target = `activity ${stmt.target.activity!.name}(${stmt.target.activity!.args || ''})`
      break
    case 'workflow':
      target = `workflow ${stmt.target.workflow!.name}(${stmt.target.workflow!.args || ''})`
      break
    case 'nexus':
      target = `nexus ${stmt.target.nexus!.endpoint} ${stmt.target.nexus!.service}.${stmt.target.nexus!.operation}(${stmt.target.nexus!.args || ''})`
      break
    case 'timer':
      target = `timer(${stmt.target.timer!.duration})`
      break
    case 'signal': {
      const params = stmt.target.signal!.params ? `(${stmt.target.signal!.params})` : ''
      target = `signal ${stmt.target.signal!.name}${params}`
      break
    }
    case 'update': {
      const params = stmt.target.update!.params ? `(${stmt.target.update!.params})` : ''
      target = `update ${stmt.target.update!.name}${params}`
      break
    }
    case 'ident':
      target = stmt.target.ident!.name
      break
  }

  return (
    <div className="block block-promise collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">promise</span>
        <span className="block-signature">{stmt.name} ← {target}</span>
      </div>
    </div>
  )
}

// Set condition to true
export function SetBlock({ stmt }: { stmt: SetStmt }) {
  return (
    <div className="block block-set collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">set</span>
        <span className="block-signature">{stmt.name}</span>
      </div>
    </div>
  )
}

// Unset condition (set to false)
export function UnsetBlock({ stmt }: { stmt: UnsetStmt }) {
  return (
    <div className="block block-unset collapsed">
      <div className="block-header">
        <span className="block-toggle-placeholder" />
        <span className="block-keyword">unset</span>
        <span className="block-signature">{stmt.name}</span>
      </div>
    </div>
  )
}
