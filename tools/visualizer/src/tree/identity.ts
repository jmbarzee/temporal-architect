// A statement's identity as the execution names it: its definition's key and the
// heads down to it, joined by " › ". This is tools/lsp/parser/stmtid in
// TypeScript, over the wire AST; a head that changes there changes here.

import type { AsyncTarget, Definition, Statement } from '../types/ast'
import { qualifiedNameOf } from '../types/ast'

export const SEPARATOR = ' › '

/** Calls fn on each character of s, saying whether it belongs to a "…" string, quotes included. */
function scan(s: string, fn: (i: number, c: string, quoted: boolean) => void) {
  let quoted = false
  let escaped = false
  for (const [i, c] of [...s].entries()) {
    fn(i, c, quoted || c === '"')
    if (escaped) escaped = false
    else if (quoted && c === '\\') escaped = true
    else if (c === '"') quoted = !quoted
  }
}

/** s with each run of whitespace outside strings a space, or nothing at a bracket's edge. */
function squeeze(s: string): string {
  let out = ''
  let space = false
  let last = ''
  scan(s.trim(), (_, c, quoted) => {
    if (!quoted && /\s/.test(c)) {
      space = true
      return
    }
    if (space && !'([{'.includes(last) && !')]}'.includes(c)) out += ' '
    space = false
    last = c
    out += c
  })
  return out
}

/** A head as heads compare: without whitespace outside strings. */
const key = (head: string) => {
  let out = ''
  scan(head, (_, c, quoted) => { if (quoted || !/\s/.test(c)) out += c })
  return out
}

/** An identity's segments, split at separators outside strings. */
export function segments(id: string): string[] {
  const parts: string[] = []
  let from = 0
  scan(id, (i, c, quoted) => {
    if (c === '›' && !quoted) {
      parts.push(id.slice(from, i).trim())
      from = i + 1
    }
  })
  parts.push(id.slice(from).trim())
  return parts
}

const arrow = (result?: string) => (result ? ` -> ${result}` : '')
const ref = (pkg: string | undefined, name: string) => (pkg ? `${pkg}.${name}` : name)
const call = (keyword: string, name: string, args = '', result?: string) => `${keyword} ${name}(${args})${arrow(result)}`
const binding = (params?: string) => (params?.includes(',') ? ` -> (${params})` : arrow(params))

function target(t: AsyncTarget): string {
  switch (t.kind) {
    case 'timer': return `timer(${t.timer!.duration})`
    case 'signal': return `signal ${t.signal!.name}${binding(t.signal!.params)}`
    case 'update': return `update ${t.update!.name}${binding(t.update!.params)}`
    case 'activity': return call('activity', ref(t.activity!.package, t.activity!.name), t.activity!.args, t.activity!.result)
    case 'workflow': return call('workflow', ref(t.workflow!.package, t.workflow!.name), t.workflow!.args, t.workflow!.result)
    case 'nexus': {
      const n = t.nexus!
      return call(`nexus ${n.endpoint}`, `${ref(n.servicePackage, n.service)}.${n.operation}`, n.args, n.result)
    }
    case 'ident': return t.ident!.name + arrow(t.ident!.result)
    default: return ''
  }
}

/** A statement, an await one or switch case, or a handler declaration, as the tree holds it. */
type Block = Statement | { type: 'signalDecl' | 'queryDecl' | 'updateDecl'; name: string; body?: Statement[] }
  | { type?: undefined; value: string; body: Statement[] } // a switch case
  | { type?: undefined; target?: AsyncTarget; awaitAll?: { body: Statement[] }; body: Statement[] } // an await one case

function line(b: Block): string {
  switch (b.type) {
    case 'activityCall': return call('activity', ref(b.package, b.name), b.args, b.result)
    case 'workflowCall': return (b.mode === 'detach' ? 'detach ' : '') + call('workflow', ref(b.package, b.name), b.args, b.result)
    case 'nexusCall': return (b.detach ? 'detach ' : '') + call(`nexus ${b.endpoint}`, `${ref(b.servicePackage, b.service)}.${b.operation}`, b.args, b.result)
    case 'signalSend': return `signal ${b.head.kind === 'type' ? ref(b.head.package, b.head.type!) : b.head.handle}.${b.signal}(${b.args ?? ''})`
    case 'promise': return `promise ${b.name} <- ${target(b.target)}`
    case 'await': return `await ${target(b.target)}`
    case 'awaitAll': return 'await all'
    case 'awaitOne': return 'await one'
    case 'switch': return `switch (${b.expr})`
    case 'if': return `if (${b.condition})`
    case 'for': return b.variant === 'conditional' ? `for (${b.condition})` : b.variant === 'iteration' ? `for (${b.variable} in ${b.iterable})` : 'for'
    case 'return': return `return ${b.value ?? ''}`
    case 'close': return b.args ? `close ${b.reason}(${b.args})` : `close ${b.reason}`
    case 'break': return 'break'
    case 'continue': return 'continue'
    case 'set': return `set ${b.name}`
    case 'unset': return `unset ${b.name}`
    case 'raw': return b.text
    case 'signalDecl': return `signal ${b.name}`
    case 'updateDecl': return `update ${b.name}`
    case 'queryDecl': return `query ${b.name}`
    case 'comment': return ''
    case undefined:
      if ('value' in b) return `case ${b.value}`
      return b.awaitAll ? 'await all' : b.target ? target(b.target) : ''
  }
}

/** A block's head: its first line as written, up to whitespace. */
export const head = (b: Block) => squeeze(line(b))

/** What nests directly under b, and what an else branch under it holds. */
function nested(b: Block): [Block[], Block[]] {
  switch (b.type) {
    case 'if': return [b.body ?? [], b.elseBody ?? []]
    case 'switch': return [b.cases ?? [], b.default ?? []]
    case 'awaitOne': return [b.cases ?? [], []]
    case 'awaitAll': case 'for': return [b.body ?? [], []]
    case 'signalDecl': case 'updateDecl': case 'queryDecl': return [b.body ?? [], []]
    case undefined: return [[...('awaitAll' in b && b.awaitAll ? b.awaitAll.body ?? [] : []), ...(b.body ?? [])], []]
    default: return [[], []]
  }
}

/** A segment's text for kids[i]: its head, ranked among the kids sharing it. */
function segment(kids: { head: string }[], i: number) {
  const same = kids.filter(k => key(k.head) === key(kids[i].head))
  if (same.length === 1) return kids[i].head
  return `${kids[i].head} @${kids.slice(0, i + 1).filter(k => key(k.head) === key(kids[i].head)).length}`
}

/** The identity of every block in the workflows, activities and sync nexus operations of defs, by the node that is the block; a definition's, or an operation's, is its key. */
export function blockIds(defs: readonly Definition[]): Map<object, string> {
  const ids = new Map<object, string>()
  const seen = new Set<string>()
  const grow = (body: Block[], alt: Block[], at: string) => {
    const kids = body.filter(b => b.type !== 'comment').map(b => ({ head: head(b), block: b as Block | undefined }))
    if (alt.length > 0) kids.push({ head: 'else', block: undefined })
    kids.forEach((k, i) => {
      const id = at + SEPARATOR + segment(kids, i)
      if (!k.block) {
        grow(alt.filter(b => b.type !== 'comment'), [], id)
        return
      }
      ids.set(k.block, id)
      grow(...nested(k.block), id)
    })
  }
  const add = (def: object, key: string, body: Block[]) => {
    if (seen.has(key)) return
    seen.add(key)
    ids.set(def, key)
    grow(body, [], key)
  }
  for (const def of defs) {
    if (def.type === 'workflowDef') {
      add(def, `workflow:${qualifiedNameOf(def)}`, [...(def.signals ?? []), ...(def.queries ?? []), ...(def.updates ?? []), ...(def.body ?? [])] as Block[])
    } else if (def.type === 'activityDef') {
      add(def, `activity:${qualifiedNameOf(def)}`, def.body ?? [])
    } else if (def.type === 'nexusServiceDef') {
      for (const op of def.operations ?? []) {
        if (op?.opType === 'sync') add(op, `nexusOperation:${qualifiedNameOf(def)}.${op.name}`, op.body ?? [])
      }
    }
  }
  return ids
}
