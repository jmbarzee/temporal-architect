// Gate 6 — the import-direction ratchet, across a package boundary.
//
// Until Unit 8 the library and the host shared one `src/`, and this gate named
// the host's trees a library file may not import. The library is its own
// package now (D62), so the rule is simpler and stronger: a library file may
// import nothing that resolves outside the library's own `src/`, and no
// `@temporal-architect/*` package — the library depends on no sibling. A barrel
// cannot launder a host import any more: the barrel would itself be a library
// file, and its own escaping import is the edge this counts.
//
// The other direction is measured too. The host reaches the library through
// its public entry, `@temporal-architect/graph-view`, and nothing deeper: a deep
// import would make the host depend on the library's file layout, which the
// published `exports` map does not offer. The one exception is the harness
// (`src/verify/`), which pins the library's internals on purpose.
//
// What this structurally cannot see: a stylesheet coupling. A class the library
// renders and only the host's stylesheet defines is a dependency with no import
// edge.

import { existsSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { manifestFiles, readLines, gateConfig, report, PKG_ROOT, LIB_SRC } from './manifest.mjs'

const STATEMENT_START = /^\s*(?:import|export)\b/
const SPECIFIER = /(?:\bfrom\s*|^\s*import\s*)['"]([^'"]+)['"]/
const DEFERRED = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g
const unbalanced = text => (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length

/**
 * Import specifiers with the line each statement starts on. A named import can
 * span many lines with its `from` clause alone on the last one; continuation is
 * decided by brace balance, not by guessing where the statement ends.
 */
function importsOf(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(DEFERRED)) out.push({ spec: m[1], line: i + 1 })
    if (!STATEMENT_START.test(lines[i])) continue
    let buffer = lines[i]
    let j = i
    while (unbalanced(buffer) > 0 && j + 1 < lines.length && j - i < 200) buffer += ' ' + lines[++j]
    const m = buffer.match(SPECIFIER)
    if (m) out.push({ spec: m[1], line: i + 1 })
    i = j
  }
  return out
}

const EXTS = ['.ts', '.tsx', '.css', '', '/index.ts', '/index.tsx']
function resolveLocal(fromFile, spec) {
  const base = resolve(PKG_ROOT, dirname(fromFile), spec)
  for (const ext of EXTS) {
    const cand = base + ext
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return base // unresolved: judged by where it would land
}

const libSrc = resolve(PKG_ROOT, LIB_SRC)
const inside = (root, abs) => !relative(root, abs).startsWith('..')

/** Why a library file's import crosses the boundary, or null. */
function escapes(fromFile, spec) {
  if (spec.startsWith('@temporal-architect/')) return `${spec} (a sibling package)`
  if (!spec.startsWith('.')) return null                       // react, a builtin: a dependency, not the host
  const target = resolveLocal(fromFile, spec)
  return inside(libSrc, target) ? null : `${spec} (outside the library)`
}

const counts = []
let total = 0
const violations = []
for (const file of manifestFiles()) {
  if (file.endsWith('.css')) { counts.push([file, 0]); continue }
  let n = 0
  for (const { spec, line } of importsOf(readLines(file))) {
    const why = escapes(file, spec)
    if (!why) continue
    n++
    violations.push(`${file}:${line}  -> ${why}`)
  }
  counts.push([file, n])
  total += n
}

// The host's side: every source file of this package outside the harness.
function hostSources(dir = 'src', out = []) {
  for (const name of readdirSync(resolve(PKG_ROOT, dir)).sort()) {
    const rel = `${dir}/${name}`
    if (statSync(resolve(PKG_ROOT, rel)).isDirectory()) { if (rel !== 'src/verify') hostSources(rel, out) }
    else if (/\.tsx?$/.test(name)) out.push(rel)
  }
  return out
}
for (const file of hostSources()) {
  let n = 0
  for (const { spec, line } of importsOf(readLines(file))) {
    if (!spec.startsWith('@temporal-architect/graph-view/')) continue
    n++
    violations.push(`${file}:${line}  -> ${spec} (past the library's entry)`)
  }
  if (n > 0) { counts.push([file, n]); total += n }
}

console.log('boundary gate — library imports that leave the library; host imports past its entry')
for (const v of violations) console.log(`       ${v}`)
process.exit(report('boundary violations', counts, total, gateConfig().boundaryCeiling,
  'Satisfying Gate 4 while failing this one — moving vocabulary out and leaving ' +
  'the import edge in — is the paired cheat these two gates exist to catch.'))
