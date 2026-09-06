// The forbidden-pattern check.
//
// Four patterns, each one a way this refactor can silently write a wrong value
// instead of failing:
//
//   as-nodetype   a cast into a keyed record. Once ids are dimension-scoped a
//                 cast still compiles and writes a bogus key. These are to be
//                 DELETED, never widened.
//   as-record     the same hazard one level up: asserting a record's key space
//                 rather than proving it.
//   math-random   an unreproducible draw inside a force, which is what made the
//                 engine uncharacterizable in the first place. Scoped to
//                 `src/graph/`.
//   silent-domain-fallback
//                 `?? '<domain literal>'` — a lookup miss quietly resolving to
//                 a default instead of throwing. Two of these already bridge
//                 the two type vocabularies, and they are why an unmapped key
//                 mislabels rather than crashes.
//
// Every pattern is present at Unit 0, so the check ships with a committed
// baseline allowlist in kickoff/gates.json. That allowlist is APPEND-FORBIDDEN:
// entries may only be removed or lowered, and the gate enforces the "lowered"
// half itself — an entry whose budget exceeds the measured count fails, so the
// ratchet cannot silently go slack.

import { manifestFiles, readLines, gateConfig, PKG_ROOT } from './manifest.mjs'
import { relative, resolve } from 'node:path'

const DOMAIN = /workflow|activity|activities|worker|namespace|nexus|temporal|twf|taskqueue/i

const RULES = [
  { id: 'as-nodetype', re: /\bas\s+NodeType\b/g },
  { id: 'as-record', re: /\bas\s+Record</g },
  {
    id: 'math-random',
    re: /\bMath\.random\s*\(/g,
    // Scoped exactly as the friction table words it.
    scope: file => file.startsWith('src/graph/'),
  },
  {
    id: 'silent-domain-fallback',
    re: /\?\?\s*'[^']*'/g,
    // Only a fallback to a DOMAIN literal counts; `?? ''` and `?? 'none'` are
    // ordinary defaulting, not a mislabel waiting to happen.
    accept: match => DOMAIN.test(match),
  },
]

const { forbiddenPatternAllowlist: allowlist } = gateConfig()
const budget = new Map(allowlist.map(e => [`${e.file}:${e.rule}`, e.max]))

const measured = new Map()
for (const file of manifestFiles()) {
  if (file.endsWith('.css')) continue
  const text = readLines(file).join('\n')
  for (const rule of RULES) {
    if (rule.scope && !rule.scope(file)) continue
    const hits = (text.match(rule.re) ?? []).filter(m => (rule.accept ? rule.accept(m) : true))
    if (hits.length > 0) measured.set(`${file}:${rule.id}`, hits.length)
  }
}

let failures = 0
console.log('forbidden-pattern check')

for (const [key, count] of [...measured].sort()) {
  const allowed = budget.get(key)
  if (allowed === undefined) {
    console.error(`  NEW      ${key} — ${count} occurrence(s), not in the allowlist`)
    failures++
  } else if (count > allowed) {
    console.error(`  GREW     ${key} — ${count}, allowed ${allowed}`)
    failures++
  } else {
    console.log(`  ok       ${key} — ${count}`)
  }
}

for (const [key, allowed] of [...budget].sort()) {
  const count = measured.get(key) ?? 0
  if (count < allowed) {
    console.error(`  STALE    ${key} — allows ${allowed} but only ${count} remain; lower it in kickoff/gates.json`)
    failures++
  }
}

// An allowlist entry naming a file that no longer exists is dead weight that
// would silently permit the pattern if the file ever came back.
for (const entry of allowlist) {
  const abs = resolve(PKG_ROOT, entry.file)
  if (relative(PKG_ROOT, abs).startsWith('..')) {
    console.error(`  BADPATH  ${entry.file} — escapes the package root`)
    failures++
  }
}

if (failures > 0) {
  console.error('')
  console.error(`FAIL forbidden-pattern check: ${failures} problem(s).`)
  console.error('The allowlist is append-forbidden. A NEW entry is not the fix for a')
  console.error('new occurrence — deleting the occurrence is.')
  process.exit(1)
}

const total = [...measured.values()].reduce((a, b) => a + b, 0)
console.log(`forbidden patterns: ${total} allowlisted occurrence(s), 0 new`)
