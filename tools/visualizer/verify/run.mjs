// The golden harness's untypechecked half.
//
// Plain JavaScript at the package root, deliberately OUTSIDE tsconfig.json's
// `include`, so it may use node builtins that the typechecked half may not:
// `@types/node` is absent and C2 forbids adding it (D10, T33).
//
// It spawns the bundled program, splits its one JSON object into one golden per
// key, diffs each against the committed file, and sets the exit code.
//
//   npm run verify              compare; non-zero on any difference
//   npm run verify -- --write   regenerate (needs a DECISIONS.md entry first)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const bundle = resolve(pkgRoot, 'dist-verify', 'verify.js')
const goldenDir = resolve(pkgRoot, 'kickoff', 'goldens')

const write = process.argv.includes('--write')

if (!existsSync(bundle)) {
  console.error(`verify: ${bundle} is missing — run the bundle step first (npm run verify).`)
  process.exit(2)
}

let raw
try {
  raw = execFileSync(process.execPath, [bundle], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
} catch (err) {
  console.error('verify: the harness threw before it could emit a snapshot.')
  if (err?.stderr) console.error(String(err.stderr))
  process.exit(2)
}

let snapshot
try {
  snapshot = JSON.parse(raw)
} catch {
  console.error('verify: the harness emitted something that is not JSON.')
  console.error(raw.slice(0, 2000))
  process.exit(2)
}

mkdirSync(goldenDir, { recursive: true })

const emitted = Object.keys(snapshot).sort()
const goldenPath = name => resolve(goldenDir, `${name}.golden.json`)
const serialize = value => JSON.stringify(value, null, 2) + '\n'

// A golden file with no corresponding key is a golden nobody checks any more.
// Say so rather than leaving it to rot as a false sense of coverage.
const orphans = existsSync(goldenDir)
  ? readdirSync(goldenDir)
      .filter(f => f.endsWith('.golden.json'))
      .map(f => f.replace(/\.golden\.json$/, ''))
      .filter(name => !emitted.includes(name))
  : []

if (write) {
  for (const name of emitted) writeFileSync(goldenPath(name), serialize(snapshot[name]))
  console.log(`verify --write: wrote ${emitted.length} golden(s) to kickoff/goldens/`)
  for (const name of orphans) console.log(`  note: ${name}.golden.json is no longer emitted`)
  process.exit(0)
}

// ── Compare ─────────────────────────────────────────────────────────────────

// First differing line, with a little context. The goldens are canonicalized
// (sorted keys, fixed float precision) precisely so this is a short answer.
function firstDifference(expected, actual) {
  const a = expected.split('\n')
  const b = actual.split('\n')
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return {
        line: i + 1,
        expected: a[i] ?? '<end of file>',
        actual: b[i] ?? '<end of file>',
        context: a.slice(Math.max(0, i - 3), i).map(l => l.trim()),
      }
    }
  }
  return null
}

let failures = 0
for (const name of emitted) {
  const path = goldenPath(name)
  const actual = serialize(snapshot[name])

  if (!existsSync(path)) {
    console.error(`FAIL ${name}: no committed golden. Run 'npm run verify -- --write' to create it.`)
    failures++
    continue
  }

  const expected = readFileSync(path, 'utf8')
  if (expected === actual) {
    console.log(`ok   ${name}`)
    continue
  }

  failures++
  const diff = firstDifference(expected, actual)
  const expectedLines = expected.split('\n').length
  const actualLines = actual.split('\n').length
  console.error(`FAIL ${name}: golden differs (${expectedLines} lines committed, ${actualLines} produced)`)
  if (diff) {
    for (const line of diff.context) console.error(`       … ${line}`)
    console.error(`  first difference at line ${diff.line}`)
    console.error(`    committed: ${diff.expected}`)
    console.error(`    produced:  ${diff.actual}`)
  }
  console.error(`  full diff: git diff --no-index kickoff/goldens/${name}.golden.json <(...)`)
}

for (const name of orphans) {
  console.error(`FAIL ${name}.golden.json is committed but no longer emitted by the harness.`)
  failures++
}

if (failures > 0) {
  console.error('')
  console.error(`verify: ${failures} golden(s) differ.`)
  console.error('Understand the difference before regenerating. Regenerating is the')
  console.error('default wrong answer: --write in a unit whose Goldens line says')
  console.error('byte-identical, or without the DECISIONS.md entry naming the rows')
  console.error('expected to move, is a halt condition, not a fix.')
  process.exit(1)
}

console.log(`verify: ${emitted.length} golden(s) match.`)
