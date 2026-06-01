import type { SwitchBlock, IfStmt, ForStmt, Statement } from '../../types/ast'
import { useToggle } from './useToggle'
import { StatementBlock } from './StatementBlock'

// Switch - expandable
export function SwitchBlockComponent({ stmt }: { stmt: SwitchBlock }) {
  const [expanded, toggle] = useToggle(true)

  return (
    <div className={`block block-switch ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-keyword">switch</span>
        <span className="block-signature">{stmt.expr}</span>
      </div>

      {expanded && (
        <div className="block-body">
          {stmt.cases.map((c) => (
            <SwitchCaseBlock key={`${c.line}:${c.column}`} switchCase={c} />
          ))}
          {stmt.default && stmt.default.length > 0 && (
            <div className="block block-switch-default">
              <div className="block-header">
                <span className="block-toggle-placeholder" />
                <span className="block-keyword">default</span>
              </div>
              <div className="block-body">
                {stmt.default.map((s) => (
                  <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SwitchCaseBlock({ switchCase }: { switchCase: SwitchBlock['cases'][0] }) {
  const [expanded, toggle] = useToggle(true)

  return (
    <div className={`block block-switch-case ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-keyword">case</span>
        <span className="block-signature">{switchCase.value}</span>
      </div>

      {expanded && switchCase.body && switchCase.body.length > 0 && (
        <div className="block-body">
          {switchCase.body.map((s) => (
            <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
          ))}
        </div>
      )}
    </div>
  )
}

// A single rung of an if/else-if/else chain.
interface IfBranch {
  kind: 'if' | 'elseif' | 'else'
  condition?: string
  body: Statement[]
}

// The DSL has no native `else if`; it is written as `else:` wrapping a single
// nested `if`. Flatten that idiom into a flat chain of branches so the chain
// renders as attached if / else if / else boxes instead of deep nesting.
function flattenIfChain(stmt: IfStmt): IfBranch[] {
  const branches: IfBranch[] = [{ kind: 'if', condition: stmt.condition, body: stmt.body || [] }]
  let current: IfStmt = stmt
  while (
    current.elseBody &&
    current.elseBody.length === 1 &&
    current.elseBody[0].type === 'if'
  ) {
    const nested = current.elseBody[0] as IfStmt
    branches.push({ kind: 'elseif', condition: nested.condition, body: nested.body || [] })
    current = nested
  }
  if (current.elseBody && current.elseBody.length > 0) {
    branches.push({ kind: 'else', body: current.elseBody })
  }
  return branches
}

const IF_BRANCH_LABEL: Record<IfBranch['kind'], string> = {
  if: 'if',
  elseif: 'else if',
  else: 'else',
}

// If - expandable. Renders as a chain of attached branch boxes (if / else if /
// else) sharing a single outline. The toggle lives on the `if` rung and
// expands/collapses the whole chain.
export function IfBlock({ stmt }: { stmt: IfStmt }) {
  const [expanded, toggle] = useToggle(true)
  const branches = flattenIfChain(stmt)
  const visible = expanded ? branches : branches.slice(0, 1)

  return (
    <div className={`block block-if ${expanded ? 'expanded' : 'collapsed'}`}>
      {visible.map((branch, i) => (
        <div className="if-branch" key={`${branch.kind}:${i}`}>
          <div className="block-header" onClick={toggle}>
            {i === 0 ? (
              <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
            ) : (
              <span className="block-toggle-placeholder" />
            )}
            <span className="block-keyword">{IF_BRANCH_LABEL[branch.kind]}</span>
            {branch.condition && <span className="block-signature">{branch.condition}</span>}
          </div>

          {expanded && branch.body.length > 0 && (
            <div className="block-body">
              {branch.body.map((s) => (
                <StatementBlock key={`${s.line}:${s.column}`} statement={s} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// For - expandable
export function ForBlock({ stmt }: { stmt: ForStmt }) {
  const [expanded, toggle] = useToggle(true)

  let label = ''
  if (stmt.variant === 'iteration') {
    label = `${stmt.variable} in ${stmt.iterable}`
  } else if (stmt.variant === 'conditional') {
    label = stmt.condition || ''
  } else {
    label = '∞'
  }

  return (
    <div className={`block block-for ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="block-header" onClick={toggle}>
        <span className="block-toggle">{expanded ? '▼' : '▶'}</span>
        <span className="block-keyword">for</span>
        <span className="block-signature">{label}</span>
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
