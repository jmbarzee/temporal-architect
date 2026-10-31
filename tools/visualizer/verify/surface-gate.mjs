// Gate: the public surface of `src/lib.ts` is exactly the committed list.
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
const LIB = join(PKG_ROOT, 'src', 'lib.ts')
const LIST = join(PKG_ROOT, 'kickoff', 'lib-surface.txt')

const src = readFileSync(LIB, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
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
  writeFileSync(LIST, actual)
  console.log(`surface gate: wrote ${names.size} names to kickoff/lib-surface.txt`)
  process.exit(0)
}
let expected = ''
try { expected = readFileSync(LIST, 'utf8') } catch { /* missing */ }
if (expected !== actual) {
  const was = new Set(expected.split('\n').filter(Boolean))
  const now = new Set(actual.split('\n').filter(Boolean))
  console.error('FAIL public surface of src/lib.ts differs from kickoff/lib-surface.txt')
  for (const n of was) if (!now.has(n)) console.error(`  removed: ${n}`)
  for (const n of now) if (!was.has(n)) console.error(`  added:   ${n}`)
  console.error('C3 freezes this surface (KICKOFF §8.3). Record the decision, then `npm run surface-gate -- --write`.')
  process.exit(1)
}
console.log(`surface gate: src/lib.ts exports ${names.size} names, as committed`)
