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

import { existsSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { manifestFiles, readLines, gateConfig, report, PKG_ROOT } from './manifest.mjs'

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
    for (const m of lines[i].matchAll(DEFERRED)) out.push({ spec: m[1], line: i + 1, isReExport: false })
    if (!STATEMENT_START.test(lines[i])) continue
    let buffer = lines[i]
    let j = i
    while (unbalanced(buffer) > 0 && j + 1 < lines.length && j - i < 200) {
      buffer += ' ' + lines[++j]
    }
    const m = buffer.match(SPECIFIER)
    // `export … from 'x'` hands x's surface to this module's consumers; a plain
    // `import` keeps it internal. Only the first kind launders a dependency.
    if (m) out.push({ spec: m[1], line: i + 1, isReExport: /^\s*export\b/.test(lines[i]) })
    i = j
  }
  return out
}

// ── Following the edge, not just reading it ─────────────────────────────────
//
// Testing the specifier alone is defeated by two lines. A barrel in any
// unmeasured tree —
//
//     // src/types/registry-barrel.ts
//     export { NODE_TYPE_REGISTRY } from '../adapter/node-types'
//
// — lets a manifest file import the registry through a specifier this gate
// approves of. Verified: the direct import counts as a violation and the
// barrelled one does not, with identical semantics.
//
// PLAN.md §6.5 and this gate's own header both claimed the paired gates caught
// that ("re-exporting the registry through a neutral barrel satisfies Gate 6 and
// leaves Gate 4 red"). They do not, and Gate 4 cannot: the laundered symbols are
// named `NODE_TYPE_REGISTRY` and `ALL_NODE_TYPES`, which contain no word in the
// vocabulary pattern. The dependency is real and the text is neutral, so the
// only gate that can see it is this one — by resolving where the edge goes.
const EXTS = ['.ts', '.tsx', '', '/index.ts', '/index.tsx']

function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null            // a package, not our tree
  const base = resolve(PKG_ROOT, dirname(fromFile), spec)
  for (const ext of EXTS) {
    const cand = base + ext
    if (existsSync(cand) && statSync(cand).isFile()) return relative(PKG_ROOT, cand)
  }
  return null
}

/**
 * The forbidden module this edge actually reaches, or null.
 *
 * Depth-limited and cycle-guarded. Only *re-exports* are followed, not plain
 * imports: a module that imports a forbidden tree for its own internal use has
 * not handed that dependency to its consumer, while `export … from` has. That
 * distinction is what keeps this from flagging the whole graph.
 */
function reachesForbidden(fromFile, spec, seen = new Set(), depth = 0) {
  if (forbids(spec)) return spec
  if (depth >= 6) return null
  const target = resolveLocal(fromFile, spec)
  if (target === null || seen.has(target)) return null
  seen.add(target)
  for (const { spec: next, isReExport } of importsOf(readLines(target))) {
    if (!isReExport) continue
    const hit = reachesForbidden(target, next, seen, depth + 1)
    if (hit) return `${spec} -> ${hit}`
  }
  return null
}

const counts = []
let total = 0
const violations = []
for (const file of manifestFiles()) {
  if (file.endsWith('.css')) { counts.push([file, 0]); continue }
  let n = 0
  for (const { spec, line } of importsOf(readLines(file))) {
    const hit = reachesForbidden(file, spec)
    if (!hit) continue
    n++
    violations.push(`${file}:${line}  -> ${hit}`)
  }
  counts.push([file, n])
  total += n
}

console.log('boundary gate — imports from the manifest into the shim trees')
for (const v of violations) console.log(`       ${v}`)
process.exit(report('boundary violations', counts, total, gateConfig().boundaryCeiling,
  'Satisfying Gate 4 while failing this one — moving vocabulary out and leaving ' +
  'the import edge in — is the paired cheat these two gates exist to catch.'))
