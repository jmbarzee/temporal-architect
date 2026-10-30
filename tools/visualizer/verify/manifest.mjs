// The library: every source file of the sibling package `tools/graph-view/`
// (D62). The three ratchet gates measure it from here, in the host package,
// because the goldens and the fixtures that drive them are the host's. The
// globbed tree picks up new files automatically: a module added to the library
// joins every gate the moment it exists.
//
// The manifest and the leak pattern are fixed (D62); this file implements them,
// it does not get to redefine them.
//
// Plain JS, outside tsconfig's `include`, so it may use node builtins.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** The library package, beside this one. */
export const LIB_DIR = '../graph-view'
export const LIB_SRC = `${LIB_DIR}/src`

// Every extension a bundler would ship: a `.mjs` beside the `.ts` files carries
// imports and vocabulary just the same.
const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.css']
const GLOBS = [{ dir: LIB_SRC, exts: SOURCE_EXTS }]

function walk(dir, exts, out, skipped) {
  let entries
  try {
    entries = readdirSync(resolve(PKG_ROOT, dir))
  } catch {
    return out // the directory does not exist (the library package is missing)
  }
  for (const name of entries.sort()) {
    const rel = join(dir, name)
    if (statSync(resolve(PKG_ROOT, rel)).isDirectory()) walk(rel, exts, out, skipped)
    else if (exts.some(e => name.endsWith(e))) out.push(rel)
    else if (skipped) skipped.push(rel)
  }
  return out
}

/**
 * Files sitting inside the library tree that no extension matches. Not a
 * failure, but printed on every run: it is how the library grows a limb no
 * ratchet can see.
 */
export function manifestBlindSpots() {
  const skipped = []
  for (const g of GLOBS) walk(g.dir, g.exts, [], skipped)
  return { skipped }
}

// ── The shim ────────────────────────────────────────────────────────────────
//
// The host's domain half: the adapter that builds the graph and declares the
// taxonomy, the theme, the tree view's blocks, and the wire-type façades. Not
// ratcheted down — the shim is allowed its domain, that is what it is for — but
// counted into a flat total, so a move out of the library has to be honest about
// being a move rather than reading as a deletion (D40).
const SHIM_GLOBS = [
  { dir: 'src/adapter', exts: SOURCE_EXTS },
  { dir: 'src/theme', exts: SOURCE_EXTS },
  { dir: 'src/components/blocks', exts: SOURCE_EXTS },
]
const SHIM_NAMED = [
  'src/types/ast.ts',
  'src/types/parser-graph.ts',
  'src/types/decomposition.ts',
]

/** Every shim file, relative to this package's root, sorted. */
export function shimFiles() {
  const files = []
  for (const g of SHIM_GLOBS) walk(g.dir, g.exts, files, null)
  for (const f of SHIM_NAMED) {
    try { statSync(resolve(PKG_ROOT, f)); files.push(f) } catch { /* not present */ }
  }
  return [...new Set(files)].sort()
}

/** Every library file, relative to this package's root (`../graph-view/src/…`), sorted. */
export function manifestFiles() {
  const files = []
  for (const g of GLOBS) walk(g.dir, g.exts, files, null)
  return [...new Set(files)].sort()
}

export const readLines = file => readFileSync(resolve(PKG_ROOT, file), 'utf8').split('\n')

/** The gate ceilings and the forbidden-pattern allowlist, ratcheted down as the counts fall. */
export function gateConfig() {
  return JSON.parse(readFileSync(resolve(PKG_ROOT, 'verify', 'gates.json'), 'utf8'))
}

/** Print a per-file table plus a total, then return the exit code. */
export function report(label, counts, total, ceiling, hint) {
  for (const [file, n] of counts) if (n > 0) console.log(`  ${String(n).padStart(4)}  ${file}`)
  console.log(`${label}: ${total} (ceiling ${ceiling})`)
  if (total > ceiling) {
    console.error('')
    console.error(`FAIL ${label} rose above its ceiling. ${hint}`)
    return 1
  }
  if (total < ceiling) {
    console.log(`  ${ceiling - total} below the ceiling — ratchet it down in verify/gates.json.`)
  }
  return 0
}
