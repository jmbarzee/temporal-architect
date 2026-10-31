// The library-to-be: the file manifest the three ratchet gates measure.
//
// The manifest and the leak pattern are [immutable] — they are declared in
// PLAN.md §6.5 and this file implements them, it does not get to define them.
// The globbed directories pick up new files automatically, which is the stated
// behaviour: a module lifted into one of them joins both gates the moment it
// exists.
//
// Plain JS, outside tsconfig's `include`, so it may use node builtins.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Directories whose matching files are all in the manifest.
//
// PLAN.md §6.5 writes these as `src/graph/**.ts`, `src/components/graph-view/**.ts`,
// `src/components/controls/**.tsx` and `src/filter/**.ts`. The extension set here
// is deliberately WIDER than the literal glob: a `.tsx` under `graph-view/`, a
// `.ts` under `controls/`, or a stylesheet beside either would otherwise sit in
// the library-to-be while being invisible to all three ratchets AND absent from
// Unit 8's move list. A stricter reading of an [immutable] floor is never a
// violation of it; a hole in it is.
const SOURCE_EXTS = ['.ts', '.tsx', '.css']
const GLOBS = [
  { dir: 'src/graph', exts: SOURCE_EXTS },
  { dir: 'src/components/graph-view', exts: SOURCE_EXTS },
  { dir: 'src/components/controls', exts: SOURCE_EXTS },
  { dir: 'src/filter', exts: SOURCE_EXTS },
]

/** Named components, and the stylesheet beside each one that has one. */
const NAMED = [
  'src/components/GraphCanvas.tsx',
  'src/components/GraphView.tsx',
  'src/components/ForceMap.tsx',
  'src/components/CanvasErrorBoundary.tsx',
  'src/components/PinToggle.tsx',
  'src/components/FilterBar.tsx',
  'src/components/ChargeControls.tsx',
  'src/components/SpringControls.tsx',
  'src/components/GravityControls.tsx',
  'src/components/GraphControlPanel.tsx',
  // CSS is in scope because eight hand-written domain chip tints live in
  // FilterBar.css; a manifest that skipped stylesheets would report zero while
  // they sat in the shipped bundle.
  'src/components/FilterBar.css',
  'src/components/GraphView.css',
  'src/components/GraphControlPanel.css',
  'src/components/GravityControls.css',
  'src/components/ForceMap.css',
  'src/components/PinToggle.css',
  'src/components/controls/controls.css',
]

function walk(dir, exts, out, skipped) {
  let entries
  try {
    entries = readdirSync(resolve(PKG_ROOT, dir))
  } catch {
    return out // the directory does not exist yet (e.g. the sibling package)
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
 * Files sitting inside a globbed directory that no extension matches, and
 * components beside the named ones that the manifest does not list. Neither is
 * a failure — the manifest is fixed — but both are exactly how the library-to-be
 * grows a limb no ratchet can see, so they are printed on every run.
 */
export function manifestBlindSpots() {
  const skipped = []
  for (const g of GLOBS) walk(g.dir, g.exts, [], skipped)
  const listed = new Set(manifestFiles())
  const siblings = []
  try {
    for (const name of readdirSync(resolve(PKG_ROOT, 'src/components')).sort()) {
      const rel = join('src/components', name)
      if (statSync(resolve(PKG_ROOT, rel)).isDirectory()) continue
      if (!listed.has(rel)) siblings.push(rel)
    }
  } catch { /* no components directory */ }
  return { skipped, siblings }
}

// ── The shim ────────────────────────────────────────────────────────────────
//
// The trees the manifest may not import from — i.e. the host half. Defined here
// as the complement of the library-to-be, and kept in step with Gate 6's
// FORBIDDEN list on purpose: "the shim" should mean one thing to every gate.
//
// This exists because Unit 2 created `src/adapter/` and, with it, a hole:
// vocabulary that MOVES from the manifest into the shim leaves the ratchet
// entirely, so relocation reads exactly like deletion on the only number anyone
// looks at. It is worse than a tie, because the vocabulary can *grow* on the way
// across and the manifest count still falls. Measured on Unit 2's own move: 308
// occurrences left the manifest and 330 arrived, so the run's real total rose by
// 22 while the headline fell by 308.
//
// The shim is allowed its domain vocabulary — that is the entire point of having
// one — so this is NOT ratcheted down. It is ratcheted *flat*, as part of the
// total, so that a move has to be honest about being a move.
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

/** Every shim file, repo-relative to the package root, sorted. */
export function shimFiles() {
  const files = []
  for (const g of SHIM_GLOBS) walk(g.dir, g.exts, files, null)
  for (const f of SHIM_NAMED) {
    try { statSync(resolve(PKG_ROOT, f)); files.push(f) } catch { /* not present */ }
  }
  return [...new Set(files)].sort()
}

/**
 * Every manifest file, repo-relative to the package root, sorted.
 *
 * A NAMED entry that no longer exists is dropped here and surfaced by
 * `manifestBlindSpots().missing` instead of reaching `readLines` and dying on an
 * unhandled ENOENT. The failure mode matters: moving a named file out of the
 * library-to-be is exactly the event the ratchets exist to notice, and a stack
 * trace is the one report that makes it look like broken tooling rather than a
 * measurement the gate is entitled to make.
 */
export function manifestFiles() {
  const files = []
  for (const g of GLOBS) walk(g.dir, g.exts, files, null)
  for (const f of NAMED) {
    try { statSync(resolve(PKG_ROOT, f)); files.push(f) } catch { /* reported as missing */ }
  }
  return [...new Set(files)].sort()
}

/** NAMED manifest entries that are no longer on disk. */
export function missingNamed() {
  return NAMED.filter(f => {
    try { statSync(resolve(PKG_ROOT, f)); return false } catch { return true }
  })
}

export const readLines = file => readFileSync(resolve(PKG_ROOT, file), 'utf8').split('\n')

/** The gate ceilings and the forbidden-pattern allowlist, ratcheted per unit. */
export function gateConfig() {
  return JSON.parse(readFileSync(resolve(PKG_ROOT, 'kickoff', 'gates.json'), 'utf8'))
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
    console.log(`  ${ceiling - total} below the ceiling — lower it in kickoff/gates.json at the unit boundary.`)
  }
  return 0
}
