// Gate 6 — the import-direction ratchet, across a package boundary.
//
// The library is its own package (D62), so the rule is a boundary in both
// directions, and every edge is RESOLVED rather than matched on its spelling
// (REVIEW_8 C1–C3: a relative path, the host's `@/` alias, a barrel in the
// harness, a stylesheet `@import` and vite's `import.meta.glob` all reached
// across while a specifier-prefix test printed 0).
//
// Library side — a file under tools/graph-view/src may reach nothing outside
// that tree: no relative path that resolves out of it, no `@temporal-architect/*`
// package, no bare specifier that is not one of the library's own declared
// dependencies, no stylesheet reference out of it, no `import.meta.glob` out of
// it; and the library's own configs declare no path map or alias, which would be
// another spelling of the same edge.
//
// Host side — a file under this package's src/, outside the harness, reaches the
// library through its entry and nothing deeper, by any spelling (the bare
// specifier's deep form, a relative path, the `@/` alias), and never through the
// harness, whose deep imports are its own business.
//
// What this still cannot see: a class the library renders that only a host
// stylesheet defines (or the reverse, which the host's groups control does —
// recorded in D64), and a dependency expressed in prose.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { manifestFiles, readLines, gateConfig, report, PKG_ROOT, LIB_DIR, LIB_SRC } from './manifest.mjs'

const libRoot = resolve(PKG_ROOT, LIB_DIR)
const libSrc = resolve(PKG_ROOT, LIB_SRC)
const libEntry = resolve(libSrc, 'index.ts')
const hostSrc = resolve(PKG_ROOT, 'src')
const harness = resolve(PKG_ROOT, 'src', 'verify')
const PACKAGE = '@temporal-architect/graph-view'

const inside = (root, abs) => {
  const r = relative(root, abs)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

// ── Reading the edges ────────────────────────────────────────────────────────
const STATEMENT_START = /^\s*(?:import|export)\b/
const SPECIFIER = /(?:\bfrom\s*|^\s*import\s*)['"]([^'"]+)['"]/
const DEFERRED = /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g
const GLOB = /import\.meta\.glob\s*\(\s*(\[[^\]]*\]|['"][^'"]+['"])/g
const CSS_REF = /@import\s+(?:url\(\s*)?['"]?([^'")\s]+)['"]?\s*\)?|url\(\s*['"]?([^'")\s]+)['"]?\s*\)/g
const unbalanced = text => (text.match(/\{/g) ?? []).length - (text.match(/\}/g) ?? []).length

/** Code edges with the line each starts on: statements, deferred imports, bundler globs. */
function codeEdges(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(DEFERRED)) out.push({ spec: m[1], line: i + 1 })
    for (const m of lines[i].matchAll(GLOB)) for (const s of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.push({ spec: s[1].replace(/^!/, ''), line: i + 1, glob: true })
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

/** Stylesheet edges: `@import` and `url()` targets that are paths. */
function cssEdges(lines) {
  const out = []
  lines.forEach((line, i) => {
    for (const m of line.matchAll(CSS_REF)) {
      const spec = m[1] ?? m[2]
      if (!spec || /^(data:|https?:|#)/.test(spec)) continue
      out.push({ spec, line: i + 1 })
    }
  })
  return out
}

const EXTS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.css', '.json', '/index.ts', '/index.tsx']
function resolveFrom(fromAbs, spec) {
  const base = resolve(dirname(fromAbs), spec)
  for (const ext of EXTS) {
    const cand = base + ext
    if (existsSync(cand) && statSync(cand).isFile()) return cand
  }
  return base // unresolved: judged by where it would land
}
const packageName = spec => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])

// ── The library side ─────────────────────────────────────────────────────────
const libPkg = JSON.parse(readFileSync(resolve(libRoot, 'package.json'), 'utf8'))
const declared = new Set([...Object.keys(libPkg.dependencies ?? {}), ...Object.keys(libPkg.peerDependencies ?? {}), ...Object.keys(libPkg.devDependencies ?? {})])

/** Why a library edge crosses the boundary, or null. */
function libraryEscape(fromAbs, spec, isGlob) {
  if (spec.startsWith('.') || spec.startsWith('/') || isGlob) {
    const target = resolveFrom(fromAbs, spec.replace(/\*.*$/, ''))
    return inside(libSrc, target) ? null : `${spec} (outside the library)`
  }
  if (spec.startsWith('@temporal-architect/')) return `${spec} (a sibling package)`
  if (/^node:|^(fs|path|os|child_process|url)$/.test(spec)) return `${spec} (a platform module)`
  return declared.has(packageName(spec)) ? null : `${spec} (not a declared dependency)`
}

const counts = []
let total = 0
const violations = []
for (const file of manifestFiles()) {
  const abs = resolve(PKG_ROOT, file)
  const lines = readLines(file)
  let n = 0
  if (file.endsWith('.css')) {
    for (const { spec, line } of cssEdges(lines)) {
      if (inside(libSrc, resolveFrom(abs, spec))) continue
      n++; violations.push(`${file}:${line}  -> ${spec} (a stylesheet reference outside the library)`)
    }
  } else {
    for (const { spec, line, glob } of codeEdges(lines)) {
      const why = libraryEscape(abs, spec, glob)
      if (!why) continue
      n++; violations.push(`${file}:${line}  -> ${why}`)
    }
  }
  counts.push([file, n])
  total += n
}

// The library's own build and compiler configs: a path map or an alias there is
// a specifier spelling this gate would otherwise not see (REVIEW_8 C3).
for (const name of readdirSync(libRoot)) {
  const abs = resolve(libRoot, name)
  if (/^tsconfig.*\.json$/.test(name)) {
    const cfg = JSON.parse(readFileSync(abs, 'utf8'))
    for (const key of ['paths', 'baseUrl', 'rootDirs']) {
      if (cfg.compilerOptions?.[key] !== undefined) { violations.push(`${LIB_DIR}/${name}  -> compilerOptions.${key} (a path map in the library's config)`); total++ }
    }
  } else if (/^vite.*\.config\.(ts|mts|js|mjs)$/.test(name)) {
    // The config as code, not as prose: comments may name an alias; a key may not.
    const code = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/\balias\s*:/.test(code) || /\bresolve\s*:\s*\{/.test(code)) { violations.push(`${LIB_DIR}/${name}  -> an alias in the library's build config`); total++ }
  }
}

// ── The host side ────────────────────────────────────────────────────────────
function hostSources(dir = hostSrc, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = resolve(dir, name)
    if (statSync(abs).isDirectory()) { if (abs !== harness) hostSources(abs, out) }
    else if (/\.(tsx?|mts|cts|jsx?|mjs|cjs|css)$/.test(name)) out.push(abs)
  }
  return out
}
function hostReach(fromAbs, spec) {
  if (spec === PACKAGE) return null
  if (spec.startsWith(PACKAGE + '/')) return `${spec} (past the library's entry)`
  let target
  if (spec.startsWith('@/')) target = resolveFrom(resolve(hostSrc, 'x'), './' + spec.slice(2))
  else if (spec.startsWith('.') || spec.startsWith('/')) target = resolveFrom(fromAbs, spec)
  else return null
  if (inside(libSrc, target) && target !== libEntry) return `${spec} (the library's internals, by path)`
  if (inside(harness, target)) return `${spec} (the harness)`
  return null
}
for (const abs of hostSources()) {
  const file = relative(PKG_ROOT, abs)
  const lines = readLines(file)
  let n = 0
  const edges = file.endsWith('.css') ? cssEdges(lines) : codeEdges(lines)
  for (const { spec, line } of edges) {
    const why = hostReach(abs, spec)
    if (!why) continue
    n++; violations.push(`${file}:${line}  -> ${why}`)
  }
  if (n > 0) { counts.push([file, n]); total += n }
}

console.log('boundary gate — edges that leave the library; host edges past its entry')
for (const v of violations) console.log(`       ${v}`)
process.exit(report('boundary violations', counts, total, gateConfig().boundaryCeiling,
  'Satisfying Gate 4 while failing this one — moving vocabulary out and leaving ' +
  'the import edge in — is the paired cheat these two gates exist to catch.'))
