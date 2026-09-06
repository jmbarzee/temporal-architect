// Fixture generator for the golden harness and the browser pass.
//
// A fixture is a composite envelope and NO single `twf` command produces it:
// `twf graph --json` emits nodes carrying only `id` and `definition` — no
// `sourceFile`, no AST — and `normalizePayload` routes that shape to an *empty*
// AST, which silently empties the file dimension and flips the app into
// history mode (Tree tab disabled). So each fixture is assembled from all three
// commands:
//
//   twf parse <file...>                -> {summary, diagnostics, definitions}  = `ast`
//   twf graph --json <file...>         -> {summary, diagnostics, graph}        = `parserGraph`
//   twf graph chunks --json <file...>  -> {summary, diagnostics, chunks}       = `decomposition`
//
// All three accept multiple files. `twf parse` has no --json flag; it is always
// JSON. Run from the repository root with `twf` on PATH:  npm run fixtures
//
// Plain JS on purpose: this lives outside tsconfig's `include`, so it may use
// node builtins that the typechecked half (src/verify/main.ts) may not — see
// DECISIONS.md D10 and NON_INFERABLE.md T33.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')          // tools/visualizer
const repoRoot = resolve(pkgRoot, '..', '..')
const outDir = resolve(pkgRoot, 'public', 'fixtures')

const TOPICS = 'skills/temporal-architect-design/topics'
const FIXTURES = [
  { name: 'nexus-sample',      files: [`${TOPICS}/nexus.twf`] },
  { name: 'taskqueues-sample', files: [`${TOPICS}/task-queues.twf`] },
  { name: 'stress-sample',     files: ['examples/human-in-the-loop-access-control/access-control.twf'] },
  { name: 'multifile-sample',  files: [`${TOPICS}/nexus.twf`, `${TOPICS}/task-queues.twf`] },
]

const run = (args) =>
  JSON.parse(execFileSync('twf', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))

mkdirSync(outDir, { recursive: true })

let failed = false
for (const { name, files } of FIXTURES) {
  const payload = {
    ast: run(['parse', ...files]),
    parserGraph: run(['graph', '--json', ...files]).graph,
    decomposition: run(['graph', 'chunks', '--json', ...files]).chunks,
  }
  writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify(payload, null, 2) + '\n')

  // Acceptance: an empty AST half is the silent failure this recipe exists to
  // prevent, and the multi-file fixture is only useful if it actually carries
  // more than one source file.
  const defs = payload.ast.definitions ?? []
  const sourceFiles = new Set(defs.map(d => d.sourceFile).filter(Boolean))
  const g = payload.parserGraph
  console.log(
    `${name}: ${g.nodes.length} nodes, ${g.edges.length} edges, ` +
    `${g.coarsenedEdges.length} coarsened, ${defs.length} definitions, ` +
    `${sourceFiles.size} source file(s)`,
  )
  if (defs.length === 0) {
    console.error(`  FAIL ${name}: empty AST half`)
    failed = true
  }
  if (name === 'multifile-sample' && sourceFiles.size < 2) {
    console.error(`  FAIL ${name}: needs at least two distinct source files`)
    failed = true
  }
}

process.exit(failed ? 1 : 0)
