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

/**
 * Components are in by default. `src/components/` holds the library-to-be's
 * components AND the host's (the tree view, the workflow canvas, the host
 * shell), so the rule used to be a list of the library ones — and twice in two
 * units a new library component was left off it, sitting outside every ratchet
 * (REVIEW_4 #6, REVIEW_5a C9). The rule is now the complement: every top-level
 * file in `src/components/` is in the manifest unless it is one of the host's,
 * named here. A new component joins the gates by existing; a new host file has
 * to be excluded on purpose.
 */
export const SHIM_COMPONENTS = [
  'src/components/ErrorBars.css',
  'src/components/ErrorBars.tsx',
  'src/components/GroupsModal.css',
  'src/components/GroupsModal.tsx',
  'src/components/StyleGuide.tsx',
  'src/components/TreeView.css',
  'src/components/TreeView.tsx',
  'src/components/VisualizerHost.css',
  'src/components/VisualizerHost.tsx',
  'src/components/WorkflowCanvas.css',
  'src/components/WorkflowCanvas.tsx',
  'src/components/protocol.ts',
  'src/components/style-guide.css',
]

/** Top-level files of `src/components/` that are the library's: everything not excluded by name. */
function componentFiles() {
  const excluded = new Set(SHIM_COMPONENTS)
  const out = []
  try {
    for (const name of readdirSync(resolve(PKG_ROOT, 'src/components')).sort()) {
      const rel = join('src/components', name)
      if (statSync(resolve(PKG_ROOT, rel)).isDirectory()) continue
      if (!SOURCE_EXTS.some(e => name.endsWith(e))) continue
      if (!excluded.has(rel)) out.push(rel)
    }
  } catch { /* no components directory */ }
  return out
}

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
 * Files sitting inside a globbed directory that no extension matches, and the
 * host's components excluded from the manifest by name. Neither is a failure,
 * but both are printed on every run: the first is how the library-to-be grows a
 * limb no ratchet can see, the second is the list a reader should expect to be
 * short and unchanging.
 */
export function manifestBlindSpots() {
  const skipped = []
  for (const g of GLOBS) walk(g.dir, g.exts, [], skipped)
  const siblings = SHIM_COMPONENTS.filter(f => {
    try { statSync(resolve(PKG_ROOT, f)); return true } catch { return false }
  })
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

/** Every manifest file, repo-relative to the package root, sorted. */
export function manifestFiles() {
  const files = []
  for (const g of GLOBS) walk(g.dir, g.exts, files, null)
  files.push(...componentFiles())
  return [...new Set(files)].sort()
}

/**
 * Excluded host components that are no longer on disk: a stale exclusion is
 * harmless today and a hole tomorrow, when a library file takes the name.
 */
export function missingNamed() {
  return SHIM_COMPONENTS.filter(f => {
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
