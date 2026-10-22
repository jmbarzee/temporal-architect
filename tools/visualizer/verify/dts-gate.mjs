// Gate 2b — the published artifact must work from a consumer's seat.
//
// `build:lib` exiting 0 is a weaker claim than it looks: declarations are
// emitted from an allowlist, a declaration whose import points outside the
// package resolves fine while it sits in this repository (REVIEW_8 C8), and a
// stylesheet has no type-checker (REVIEW_6 C1, REVIEW_8 C10). So this gate:
//
//   1. walks every shipped `.d.ts` and refuses an import that resolves outside
//      the published directory — the repo-relative path a declaration gets when
//      it names a type from a sibling package's source;
//   2. refuses any shipped declaration of a PRIVATE module (`build:lib` prunes
//      the unreachable ones, so a private module present here is reachable);
//   3. compiles a throwaway consumer against a COPY of the artifact placed
//      outside the repository, with skipLibCheck OFF, so nothing resolves by
//      accident of where the build ran;
//   4. reads the published stylesheet for the design tokens the components
//      read, once per theme — the token sheet reaches the artifact through one
//      side-effect import that no other gate can see.
//
// The twin of the other package's verify/dts-gate.mjs; the two differ in what
// counts as private.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))
// The engine's parameter and force modules are private everywhere: `ForceParams` is not
// part of either published surface (D53, #90, D62).
const PRIVATE = [/\/graph\/simulation\.d\.ts$/, /\/graph\/forces\.d\.ts$/, /\/graph\/ontology\.d\.ts$/, /\/graph\/scalar\.d\.ts$/]

const typesEntry = pkg.exports?.['.']?.types ?? pkg.types
if (!typesEntry) { console.error('dts gate: package.json declares no types entry point.'); process.exit(1) }
const typesPath = resolve(PKG_ROOT, typesEntry)
const dist = dirname(typesPath)
console.log(`published artifact gate — ${typesEntry}`)
if (!existsSync(typesPath)) { console.error(`dts gate: ${typesEntry} does not exist. Run \`npm run build:lib\` first.`); process.exit(1) }

const inside = (root, abs) => { const r = relative(root, abs); return r === '' || (!r.startsWith('..') && !isAbsolute(r)) }
function all(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) all(abs, out)
    else if (name.endsWith('.d.ts')) out.push(abs)
  }
  return out
}
const shipped = all(dist)
let failed = false

// 1. No declaration imports outside the package.
const escaping = []
for (const file of shipped) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/(?:from\s*|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    if (!inside(dist, resolve(dirname(file), m[1]))) escaping.push(`${relative(PKG_ROOT, file)} -> ${m[1]}`)
  }
}
if (escaping.length) {
  console.error('FAIL published declarations import outside the package (they dangle once installed):')
  for (const e of escaping) console.error('  ' + e)
  failed = true
}

// 2. No private module ships.
const leaked = shipped.filter(f => PRIVATE.some(re => re.test(f)))
if (leaked.length) {
  console.error('FAIL the published types carry a private engine module:')
  for (const f of leaked) console.error('  ' + relative(PKG_ROOT, f))
  console.error('ForceParams and the force kernels are not part of any surface (D53, #90, D62); an exported type now reaches one of them.')
  failed = true
}

// 3. A consumer compiles against a copy of the artifact outside the repository.
const tmp = join(tmpdir(), `dts-gate-${pkg.name.replace(/[^a-z0-9]+/gi, '-')}-${process.pid}`)
rmSync(tmp, { recursive: true, force: true })
mkdirSync(join(tmp, 'pkg'), { recursive: true })
cpSync(dist, join(tmp, 'pkg', relative(PKG_ROOT, dist)), { recursive: true, filter: src => statSync(src).isDirectory() || src.endsWith('.d.ts') })
writeFileSync(join(tmp, 'pkg', 'package.json'), JSON.stringify({ name: pkg.name, type: 'module', types: typesEntry, exports: pkg.exports }))
// React's types resolve from the consumer's own node_modules, as they would for a real consumer.
symlinkSync(join(PKG_ROOT, 'node_modules'), join(tmp, 'node_modules'), 'dir')
writeFileSync(join(tmp, 'consumer.ts'),
  `import * as lib from ${JSON.stringify('./pkg/' + typesEntry.replace(/^\.\//, '').replace(/\.d\.ts$/, ''))}\n` +
  `export const _keep: keyof typeof lib | undefined = undefined\n`)
writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { strict: true, skipLibCheck: false, noEmit: true, module: 'esnext', target: 'es2020', moduleResolution: 'bundler', jsx: 'react-jsx', types: [] },
  files: ['consumer.ts'],
}, null, 2))
try {
  execFileSync(join(PKG_ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(tmp, 'tsconfig.json')], { stdio: 'pipe', cwd: tmp })
  console.log(`published types: consumer compile clean outside the repository (skipLibCheck off); ${shipped.length} declaration file(s) shipped, none private`)
} catch (err) {
  console.error(((err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')).trim())
  console.error('\nFAIL published types: a consumer outside this repository cannot compile against the artifact.')
  failed = true
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// 4. The published stylesheet carries the design tokens, once per theme.
const cssPath = join(dist, 'styles.css')
if (!existsSync(cssPath)) { console.error(`FAIL ${relative(PKG_ROOT, cssPath)} is missing from the artifact.`); failed = true }
else {
  const css = readFileSync(cssPath, 'utf8')
  // The themed tokens once per theme block; the fonts, which no theme changes, once.
  for (const [token, expected] of [['--accent:', 2], ['--color-bg:', 2], ['--font-sans:', 1]]) {
    const n = (css.match(new RegExp(token.replace(/[-:]/g, '\\$&'), 'g')) ?? []).length
    if (n !== expected) { console.error(`FAIL published stylesheet: ${token} declared ${n} time(s), expected ${expected} — the token sheet is missing or doubled.`); failed = true }
  }
  if (!failed) console.log('published stylesheet: the design tokens are declared, once per theme where themed')
}

process.exit(failed ? 1 : 0)
