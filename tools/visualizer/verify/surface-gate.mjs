// Gate: the public surface of each package's entry is exactly its committed list —
// `src/lib.ts` against `kickoff/lib-surface.txt`, and the library's
// `../graph-view/src/index.ts` against `kickoff/graph-view-surface.txt` (D62).
//
// C3 freezes `src/lib.ts`: any removal, rename or signature change is a §8.3
// halt. Nothing checked it — `dts-gate` asserts that the declaration graph
// resolves, not which names are in it, so an export could leave and every gate
// stay green (Unit 4 review, cluster c19). This compares the names `lib.ts`
// exports against `kickoff/lib-surface.txt`, one per line, `type ` prefixed
// for type-only exports. A difference fails; `--write` records a deliberate
// change, which §8.3 says needs a DECISIONS.md entry first.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRIES = [
  { label: 'src/lib.ts', entry: join(PKG_ROOT, 'src', 'lib.ts'), list: join(PKG_ROOT, 'kickoff', 'lib-surface.txt'), listName: 'kickoff/lib-surface.txt' },
  { label: '@temporal-architect/graph-view', entry: join(PKG_ROOT, '..', 'graph-view', 'src', 'index.ts'), list: join(PKG_ROOT, 'kickoff', 'graph-view-surface.txt'), listName: 'kickoff/graph-view-surface.txt' },
]

let exitCode = 0
for (const { label, entry, list, listName } of ENTRIES) {
const src = readFileSync(entry, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// `export * from` puts every name of a module on the surface without naming one
// here, which is exactly what this gate cannot see (REVIEW_8 C5). Named only.
if (/^\s*export\s+\*\s+(?:as\s+\w+\s+)?from\b/m.test(src)) {
  console.error(`FAIL ${label}: an \`export *\` widens the surface past this gate; name the exports.`)
  exitCode = 1
  continue
}
const names = new Set()
for (const m of src.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
  const typeOnly = Boolean(m[1])
  for (const raw of m[2].split(',')) {
    const part = raw.trim()
    if (!part) continue
    const isType = typeOnly || part.startsWith('type ')
    const spec = part.replace(/^type\s+/, '')
    const exported = spec.includes(' as ') ? spec.split(/\s+as\s+/)[1].trim() : spec
    names.add(`${isType ? 'type ' : ''}${exported}`)
  }
}
for (const m of src.matchAll(/export\s+(const|function|class|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[2])
for (const m of src.matchAll(/export\s+(type|interface)\s+([A-Za-z_$][\w$]*)/g)) names.add(`type ${m[2]}`)

const actual = [...names].sort().join('\n') + '\n'
if (process.argv.includes('--write')) {
  writeFileSync(list, actual)
  console.log(`surface gate: wrote ${names.size} names to ${listName}`)
  continue
}
let expected = ''
try { expected = readFileSync(list, 'utf8') } catch { /* missing */ }
if (expected !== actual) {
  const was = new Set(expected.split('\n').filter(Boolean))
  const now = new Set(actual.split('\n').filter(Boolean))
  console.error(`FAIL public surface of ${label} differs from ${listName}`)
  for (const n of was) if (!now.has(n)) console.error(`  removed: ${n}`)
  for (const n of now) if (!was.has(n)) console.error(`  added:   ${n}`)
  console.error('C3 freezes this surface (KICKOFF §8.3). Record the decision, then `npm run surface-gate -- --write`.')
  exitCode = 1
  continue
}
console.log(`surface gate: ${label} exports ${names.size} names, as committed`)
}
process.exit(exitCode)
