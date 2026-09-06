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

import { manifestFiles, shimFiles, readLines, gateConfig, PKG_ROOT } from './manifest.mjs'
import { relative, resolve } from 'node:path'

const DOMAIN = /workflow|activity|activities|worker|namespace|nexus|temporal|twf|taskqueue/i

const RULES = [
  {
    // Broadened from `as NodeType` at the Unit 2 boundary. §5.1 says these casts
    // must be DELETED, never widened — and a rule naming one type enforces that
    // only until the type is renamed. `NodeType` no longer exists anywhere the
    // gate can see, so the rule measured 0 across the whole gated surface while
    // the identical cheat was re-introducible verbatim as `as DimensionValue`.
    // I had already made that exact mistake once this unit; the STALE check
    // caught it then, and would not have caught it a second time.
    id: 'as-identity-cast',
    re: /\bas\s+(?:NodeType|DimensionValue|DimensionId|EdgeTypeId)\b/g,
  },
  { id: 'as-record', re: /\bas\s+Record</g },
  // The double assertion is how a cast that no longer compiles gets forced
  // through — `x as unknown as NodeType` sheds the checking the single form
  // still does, so it must not be the escape hatch when the casts above are
  // deleted.
  { id: 'as-unknown-as', re: /\bas\s+unknown\s+as\b/g },
  {
    id: 'math-random',
    // Deliberately matches the NAME, not a call: a bound or aliased reference
    // (`const r = Math.random`) reaches the same generator, and the one
    // legitimate reference — the injected default — is allowlisted so it stays
    // visible rather than hiding behind a syntax the rule cannot see.
    re: /\bMath\.random\b/g,
    // Scoped as the friction table words it, plus the shim's graph builder:
    // `buildGraph` moved to src/adapter/ in Unit 2e, and it must stay
    // deterministic or every golden becomes a coin flip.
    scope: file => file.startsWith('src/graph/') || file.startsWith('src/adapter/'),
  },
  {
    id: 'silent-domain-fallback',
    // Both quote styles: a fallback is no less silent for being double-quoted.
    re: /\?\?\s*(?:'[^']*'|"[^"]*")/g,
    // Only a fallback to a DOMAIN literal counts; `?? ''` and `?? 'none'` are
    // ordinary defaulting, not a mislabel waiting to happen.
    accept: match => DOMAIN.test(match),
  },
]

const { forbiddenPatternAllowlist: allowlist } = gateConfig()
const budget = new Map(allowlist.map(e => [`${e.file}:${e.rule}`, e.max]))

// Manifest AND shim. The shim was outside this gate until the Unit 2 boundary,
// which mattered more than it sounds: `silent-domain-fallback` is not
// file-scoped, so it would have caught a `?? 'workflow'` mislabel anywhere in
// the manifest — and Unit 2e moved `build.ts`, the file T19's own defect lives
// in, out of the manifest. The only automated detector for that defect class
// retired itself, silently, in exactly the file that needed it.
//
// The shim is allowed its domain vocabulary; it is not allowed to be
// unmeasured. Extending the scan costs one allowlist entry today.
const measured = new Map()
for (const file of [...manifestFiles(), ...shimFiles()]) {
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
