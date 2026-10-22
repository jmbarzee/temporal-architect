// The published declarations are what the entry reaches, and nothing else.
//
// vite-plugin-dts emits a `.d.ts` for every included source file (its
// `rollupTypes` is a no-op in this version, T31), so the tarball would ship the
// declarations of modules the entry never exports — the force model among them —
// and host-side declarations whose imports leave the package (REVIEW_8 C8). This
// walks the relative imports from the entry's declaration and deletes every
// `.d.ts` (and its map) it does not reach. Run by `build:lib`, so the artifact is
// pruned whether or not a gate runs after it.

import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
const entry = resolve(PKG_ROOT, pkg.exports?.['.']?.types ?? pkg.types)
const dist = dirname(entry)

function all(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) all(abs, out)
    else if (name.endsWith('.d.ts')) out.push(abs)
  }
  return out
}
function reachable(from) {
  const seen = new Set()
  const queue = [from]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { continue }
    for (const m of text.matchAll(/(?:from\s*|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = join(dirname(file), m[1])
      for (const candidate of [base + '.d.ts', join(base, 'index.d.ts'), base]) {
        try { if (statSync(candidate).isFile()) { queue.push(candidate); break } } catch { /* try next */ }
      }
    }
  }
  return seen
}

const keep = reachable(entry)
let pruned = 0
for (const file of all(dist)) {
  if (keep.has(file)) continue
  rmSync(file); rmSync(file + '.map', { force: true }); pruned++
}
console.log(`published types: ${keep.size} declaration file(s) reachable from ${pkg.exports?.['.']?.types ?? pkg.types}; ${pruned} unreachable pruned`)
