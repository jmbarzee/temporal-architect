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

const FORBIDDEN = [
  'adapter/',
  'theme/',
  'types/ast',
  'types/parser-graph',
  'types/decomposition',
  'components/blocks/',
]
const STATEMENT_START = /^\s*(?:import|export)\b/
// The module specifier, once the statement has been rejoined: either
// `… from 'x'` or a bare side-effect `import 'x'`.
const SPECIFIER = /(?:\bfrom\s*|^\s*import\s*)['"]([^'"]+)['"]/

/**
 * Import specifiers with the line each statement starts on. A named import can
 * span many lines with its `from` clause alone on the last one, so a per-line
 * regex misses it — and missing an import is exactly the failure this gate
 * exists to prevent.
 */
function importsOf(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!STATEMENT_START.test(lines[i])) continue
    let buffer = lines[i]
    let j = i
    // A statement is complete once it names a specifier; cap the lookahead so a
    // stray `export const …` cannot swallow the rest of the file.
    while (!SPECIFIER.test(buffer) && j + 1 < lines.length && j - i < 40) {
      buffer += ' ' + lines[++j]
      if (/[;=]\s*$/.test(lines[j])) break
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
    if (!FORBIDDEN.some(f => spec.includes(f))) continue
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
