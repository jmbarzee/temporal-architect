// Gate 4 — the domain-vocabulary ratchet.
//
// Counts domain-specific vocabulary across the manifest, per occurrence, case
// -insensitively, skipping any line carrying a URL so provenance links to
// issues do not count. The pattern is [immutable] (PLAN.md §6.5); this script
// implements it and does not get to change it.
//
// The count may never rise. It counts VOCABULARY, not dependencies — Gate 6
// counts import edges, and neither alone is sufficient: renaming a literal
// satisfies this gate and leaves Gate 6 red, while re-exporting a registry
// through a neutral barrel satisfies Gate 6 and leaves this one red.

import { manifestFiles, manifestBlindSpots, readLines, gateConfig, report } from './manifest.mjs'

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
process.exit(report('leak count', counts, total, gateConfig().leakCeiling,
  'Renaming a literal to get under it is the cheat this gate is paired with Gate 6 to catch: ' +
  'the test is whether a consumer outside this domain could supply that value.'))
