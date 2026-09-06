// Gate 4 — the domain-vocabulary ratchet.
//
// Counts domain-specific vocabulary across the manifest, per occurrence, case
// -insensitively, skipping any line carrying a URL so provenance links to
// issues do not count. The pattern is [immutable] (PLAN.md §6.5); this script
// implements it and does not get to change it.
//
// The count may never rise. It counts VOCABULARY, not dependencies — Gate 6
// counts import edges, and neither alone is sufficient.
//
// A correction, because this header used to claim more than the gates deliver:
// it said a registry re-exported through a neutral barrel "satisfies Gate 6 and
// leaves this one red". It does not. The registry's own symbol names
// (`NODE_TYPE_REGISTRY`, `ALL_NODE_TYPES`) contain no word in PATTERN, so a
// manifest file importing them through a barrel in an unmeasured tree is
// invisible to BOTH gates. That hole is closed on Gate 6's side by resolving
// re-exports transitively; it cannot be closed here, because this gate reads
// text and the laundered text is domain-neutral by construction.
//
// Second number, added after Unit 2: the shim's vocabulary, and the TOTAL.
// Moving a file from the manifest into `src/adapter/` drops it out of the
// ratchet entirely, so relocation reads exactly like deletion — and the
// vocabulary can grow on the way across while the headline still falls. Unit 2
// did precisely that: -308 from the manifest, +330 into the shim.
//
// The total is therefore ratcheted too, but the rule is "may not rise WITHOUT A
// LOGGED REASON", not "may never rise". Frozen-forever was the first instinct
// and it is wrong: the shim is allowed its domain, so an ordinary shim refactor
// that names its own domain type once more is not a regression. That distinction
// was settled empirically — the flat version failed on the very commit that
// introduced it, over one extra `TemporalEdgeTypeDefinition` in a doc comment.
//
// **Relocation is never a valid reason.** That is the whole point: a move keeps
// the total flat by construction, so it can no longer be reported as a drop.

import { manifestFiles, manifestBlindSpots, shimFiles, readLines, gateConfig, report } from './manifest.mjs'

const PATTERN =
  /workflow|activity|activities|worker|namespace|nexus|temporal|twf|signalsend|dispatchkind|taskqueue|task_queue/gi
const URL_LINE = /https?:\/\//

const files = manifestFiles()
const counts = []
let total = 0
for (const file of files) {
  let n = 0
  for (const line of readLines(file)) {
    if (URL_LINE.test(line)) continue
    n += (line.match(PATTERN) ?? []).length
  }
  counts.push([file, n])
  total += n
}

console.log(`leak gate — ${files.length} files in the manifest`)

// What the manifest structurally cannot cover. Not a failure — the manifest is
// fixed — but this is exactly how the library-to-be grows a limb no ratchet
// sees, so it is named on every run instead of being left to be discovered.
const blind = manifestBlindSpots()
if (blind.skipped.length > 0) {
  console.log('  unmatched inside a globbed directory:')
  for (const f of blind.skipped) console.log(`      ${f}`)
}
if (blind.siblings.length > 0) {
  console.log(`  ${blind.siblings.length} file(s) beside the named components are NOT in the manifest:`)
  for (const f of blind.siblings) console.log(`      ${f}`)
}
// The shim's own vocabulary. NOT ratcheted down — the shim is allowed its
// domain, that is what it is for — but counted, so that a move out of the
// manifest is visible as a move rather than reading as a deletion.
const shim = shimFiles()
let shimTotal = 0
for (const file of shim) {
  for (const line of readLines(file)) {
    if (URL_LINE.test(line)) continue
    shimTotal += (line.match(PATTERN) ?? []).length
  }
}

const cfg = gateConfig()
const manifestCode = report('leak count', counts, total, cfg.leakCeiling,
  'Renaming a literal to get under it is the cheat this gate is paired with Gate 6 to catch: ' +
  'the test is whether a consumer outside this domain could supply that value.')

console.log(`shim vocabulary: ${shimTotal} across ${shim.length} file(s) (not ratcheted down — the shim is allowed its domain)`)

// The total is ratcheted FLAT. Relocation is legitimate and this does not
// forbid it; it forbids relocation that quietly *adds* vocabulary, which is the
// form the accounting could not previously distinguish from progress.
let totalCode = 0
if (cfg.totalCeiling !== undefined) {
  const grand = total + shimTotal
  console.log(`total vocabulary: ${grand} (ceiling ${cfg.totalCeiling})`)
  if (grand > cfg.totalCeiling) {
    console.error('')
    console.error(`FAIL total vocabulary rose above its ceiling (${grand} > ${cfg.totalCeiling}).`)
    console.error('Moving a file from the manifest into the shim lowers the leak count without')
    console.error('deleting anything; this ceiling is what stops that from reading as progress.')
    totalCode = 1
  } else if (grand < cfg.totalCeiling) {
    console.log(`  ${cfg.totalCeiling - grand} below the total ceiling — lower it in kickoff/gates.json at the unit boundary.`)
  }
}

process.exit(manifestCode || totalCode)
