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

/** Directories whose matching files are all in the manifest. */
const GLOBS = [
  { dir: 'src/graph', exts: ['.ts'] },
  { dir: 'src/components/graph-view', exts: ['.ts'] },
  { dir: 'src/components/controls', exts: ['.tsx'] },
  { dir: 'src/filter', exts: ['.ts'] },
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

function walk(dir, exts, out) {
  let entries
  try {
    entries = readdirSync(resolve(PKG_ROOT, dir))
  } catch {
    return out // the directory does not exist yet (e.g. the sibling package)
  }
  for (const name of entries.sort()) {
    const rel = join(dir, name)
    if (statSync(resolve(PKG_ROOT, rel)).isDirectory()) walk(rel, exts, out)
    else if (exts.some(e => name.endsWith(e))) out.push(rel)
  }
  return out
}

/** Every manifest file, repo-relative to the package root, sorted. */
export function manifestFiles() {
  const files = []
  for (const g of GLOBS) walk(g.dir, g.exts, files)
  files.push(...NAMED)
  return [...new Set(files)].sort()
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
