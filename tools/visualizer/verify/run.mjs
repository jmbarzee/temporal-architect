// Runs the verification bundle and owns the exit code.
//
// Plain JavaScript outside tsconfig.json's `include`, so it may use node
// builtins: the typechecked checks in src/verify/ have no node typings and only
// print. Run through `npm run verify`, which bundles them first.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundle = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist-verify', 'verify.js')
if (!existsSync(bundle)) {
  console.error(`verify: ${bundle} is missing — run 'npm run verify'.`)
  process.exit(2)
}

let report
try {
  report = JSON.parse(execFileSync(process.execPath, [bundle], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
} catch (err) {
  console.error('verify: the checks did not produce a report.')
  console.error(String(err?.message ?? err))
  process.exit(2)
}

for (const f of report.failures) console.error(`FAIL ${f.check}: ${f.message}`)
if (report.failures.length > 0) {
  console.error(`verify: ${report.failures.length} of ${report.checks} checks failed.`)
  process.exit(1)
}
console.log(`verify: ${report.checks} checks passed.`)
