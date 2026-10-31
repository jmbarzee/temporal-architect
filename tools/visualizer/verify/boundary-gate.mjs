// Gate 6 — the import-direction ratchet.
//
// No file in the manifest may import from the shim's trees. Without this, Gates
// 1-4 all stay green while the library-to-be quietly depends on the shim: the
// leak gate counts vocabulary, not dependencies.
//
// Note what this structurally cannot see: a stylesheet coupling. FilterBar
// renders a class defined only in the tree half's stylesheet, and that is a
// dependency with no import edge. Moving that stylesheet breaks the shared bar
// with no build error and no gate failure.

import { manifestFiles, readLines, gateConfig, report } from './manifest.mjs'

// Matched on PATH SEGMENTS, not as substrings. `'../adapter'` — an index import
// of the shim folder, with no trailing slash — is the exact shape Unit 2 creates,
// and a substring test for 'adapter/' misses it entirely.
const FORBIDDEN = [
  /(^|\/)adapter(\/|$)/,
  /(^|\/)theme(\/|$)/,
  /(^|\/)types\/(ast|parser-graph|decomposition)(\.\w+)?(\/|$)/,
  /(^|\/)components\/blocks(\/|$)/,
]
const forbids = spec => FORBIDDEN.some(re => re.test(spec))
const STATEMENT_START = /^\s*(?:import|export)\b/
// The module specifier, once the statement has been rejoined: either
// `… from 'x'` or a bare side-effect `import 'x'`.
const SPECIFIER = /(?:\bfrom\s*|^\s*import\s*)['"]([^'"]+)['"]/
// A deferred edge is still an edge: `await import('…')` and `require('…')`
// reach the same module and a static-only scanner never sees them.
const DEFERRED = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g

const unbalanced = text =>
  (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length

/**
 * Import specifiers with the line each statement starts on.
 *
 * A named import can span many lines with its `from` clause alone on the last
 * one, so a per-line regex misses it — and missing an import is exactly the
 * failure this gate exists to prevent. Continuation is decided by brace balance
 * rather than by guessing where the statement ends: an earlier heuristic stopped
 * at any line ending in `;` or `=`, which silently truncated real imports.
 */
function importsOf(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(DEFERRED)) out.push({ spec: m[1], line: i + 1 })
    if (!STATEMENT_START.test(lines[i])) continue
    let buffer = lines[i]
    let j = i
    while (unbalanced(buffer) > 0 && j + 1 < lines.length && j - i < 200) {
      buffer += ' ' + lines[++j]
    }
    const m = buffer.match(SPECIFIER)
    if (m) out.push({ spec: m[1], line: i + 1 })
    i = j
  }
  return out
}

const counts = []
let total = 0
const violations = []
for (const file of manifestFiles()) {
  if (file.endsWith('.css')) { counts.push([file, 0]); continue }
  let n = 0
  for (const { spec, line } of importsOf(readLines(file))) {
    if (!forbids(spec)) continue
    n++
    violations.push(`${file}:${line}  -> ${spec}`)
  }
  counts.push([file, n])
  total += n
}

console.log('boundary gate — imports from the manifest into the shim trees')
for (const v of violations) console.log(`       ${v}`)
process.exit(report('boundary violations', counts, total, gateConfig().boundaryCeiling,
  'Satisfying Gate 4 while failing this one — moving vocabulary out and leaving ' +
  'the import edge in — is the paired cheat these two gates exist to catch.'))
