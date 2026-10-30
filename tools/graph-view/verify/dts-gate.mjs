// Gate 2b — the published artifact must work from a consumer's seat.
//
// `build:lib` exiting 0 is a weaker claim than it looks: declarations are
// emitted from an allowlist, a declaration whose import points outside the
// package resolves fine while it sits in this repository, and a stylesheet has
// no type-checker. So this gate:
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
// The taxonomy (`createTaxonomy`, the scalar axes) IS this package's surface; the
// force model behind it is not (D53, #90, D62).
const PRIVATE = [/\/graph\/simulation\.d\.ts$/, /\/graph\/forces\.d\.ts$/]

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
// The README's code compiles against the same copy: every ```tsx block, its
// package import pointed at the artifact, its stylesheet import dropped (a
// stylesheet has no type-checker). A README that names a prop the surface
// lost fails here, not in a reader's editor.
const readme = readFileSync(join(PKG_ROOT, 'README.md'), 'utf8')
const blocks = [...readme.matchAll(/```tsx\n([\s\S]*?)```/g)].map(m => m[1])
if (blocks.length === 0) { console.error('dts gate: README.md has no ```tsx block.'); process.exit(1) }
const pkgImport = JSON.stringify('./pkg/' + typesEntry.replace(/^\.\//, '').replace(/\.d\.ts$/, ''))
const readmeFiles = blocks.map((code, i) => {
  const name = `readme-${i + 1}.tsx`
  writeFileSync(join(tmp, name), code.split('\n').filter(line => !/\.css['"]/.test(line)).join('\n').replace(/'@temporal-architect\/graph-view'/g, pkgImport))
  return name
})
writeFileSync(join(tmp, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { strict: true, skipLibCheck: false, noEmit: true, module: 'esnext', target: 'es2020', moduleResolution: 'bundler', jsx: 'react-jsx', types: [] },
  files: ['consumer.ts', ...readmeFiles],
}, null, 2))
try {
  execFileSync(join(PKG_ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(tmp, 'tsconfig.json')], { stdio: 'pipe', cwd: tmp })
  console.log(`published types: consumer compile clean outside the repository (skipLibCheck off); ${shipped.length} declaration file(s) shipped, none private; the README's ${readmeFiles.length} code block(s) compile`)
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
  for (const [token, expected] of [['--gv-accent:', 2], ['--gv-color-bg:', 2], ['--gv-font-sans:', 1]]) {
    const n = (css.match(new RegExp(token.replace(/[-:]/g, '\\$&'), 'g')) ?? []).length
    if (n !== expected) { console.error(`FAIL published stylesheet: ${token} declared ${n} time(s), expected ${expected} — the token sheet is missing or doubled.`); failed = true }
  }
  if (!failed) console.log('published stylesheet: the design tokens are declared, once per theme where themed')
}

// 5. No project record reaches a consumer's IDE hover. The doc comments ship
//    with the declarations; a decision, trap or review id, a plan section or a
//    spec file name in one of them means nothing outside this repository, and
//    "the first host" is a host the package must not know. Only comments are
//    read, so a type parameter named `T1` in code is not a hit.
const RECORD = /\b(?:D\d{1,3}|T\d{1,2}|B\d{1,2}|R\d{1,2}|C\d{1,2}|REVIEW_\d+)\b|PLAN §|KICKOFF|GRAPH_VIEW\.md|VIEW_FRAMEWORK|PRODUCT\.md|first host|the visualizer/
const records = []
for (const file of shipped) {
  const text = readFileSync(file, 'utf8')
  for (const comment of text.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? []) {
    const m = RECORD.exec(comment)
    if (m) records.push(`${relative(PKG_ROOT, file)}: ${JSON.stringify(m[0])} in ${JSON.stringify(comment.replace(/\s+/g, ' ').slice(0, 80))}`)
  }
}
if (records.length) {
  console.error('FAIL published declarations carry project records in their doc comments:')
  for (const r of records) console.error('  ' + r)
  failed = true
} else {
  console.log(`published docs: no project record in ${shipped.length} declaration file(s)`)
}

// 6. Every shipped export carries a doc comment. The declarations are what a
//    consumer's editor shows; a name without a sentence is a name the host
//    guesses at. Re-exports (`export { X } from`) are followed to where X is
//    declared, so a type declared once and re-exported counts as documented
//    there.
const DECL = /^export (?:default )?(?:declare )?(?:abstract |async )?(?:const|let|var|function|interface|type|class|enum|namespace) ([A-Za-z_$][\w$]*)/gm
const undocumented = []
for (const file of shipped) {
  const text = readFileSync(file, 'utf8')
  let last = null
  for (const m of text.matchAll(DECL)) {
    // A further overload of a function shares the first signature's comment.
    const overload = m[1] === last && /\bfunction\b/.test(m[0])
    last = m[1]
    if (overload) continue
    const before = text.slice(0, m.index).trimEnd()
    if (!before.endsWith('*/')) undocumented.push(`${relative(PKG_ROOT, file)}: ${m[1]}`)
  }
}
if (undocumented.length) {
  console.error('FAIL published declarations without a doc comment:')
  for (const u of undocumented) console.error('  ' + u)
  failed = true
} else {
  console.log(`published docs: every exported declaration in ${shipped.length} file(s) carries a doc comment`)
}

// 7. Every identifier the README names in backticks that is declared somewhere
//    in the source is on the surface — the entry's exports — so the README
//    never names a module-internal function as if a host could import it.
const srcDir = join(PKG_ROOT, 'src')
function allSource(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) allSource(abs, out)
    else if (/\.tsx?$/.test(name)) out.push(abs)
  }
  return out
}
const declared = new Set()
// A word that is also a string value in the source (a summary kind, a
// relation, a scalar id) is a value when the README writes it, not a name a
// host would import; those are skipped.
const valueWords = new Set()
for (const file of allSource(srcDir)) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/^export (?:default )?(?:abstract |async )?(?:const|let|var|function|interface|type|class|enum|namespace) ([A-Za-z_$][\w$]*)/gm)) declared.add(m[1])
  for (const m of text.matchAll(/'([A-Za-z_$][\w$]*)'/g)) valueWords.add(m[1])
}
const entry = readFileSync(typesPath, 'utf8')
const surface = new Set([...entry.matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap(m => m[1].split(',').map(s => s.trim().replace(/^type /, '').replace(/^[\w$]+\s+as\s+/, '')).filter(Boolean)))
// Every identifier inside every backtick span: a type annotation, a member
// access or a generic names a declaration as surely as a bare word does.
const named = new Set()
for (const span of readme.matchAll(/`([^`\n]+)`/g)) for (const id of span[1].matchAll(/[A-Za-z_$][\w$]*/g)) named.add(id[0])
const internal = [...named].filter(n => declared.has(n) && !surface.has(n) && !valueWords.has(n)).sort()
if (internal.length) {
  console.error('FAIL the README names declarations that are not on the surface (a host cannot import them):')
  for (const n of internal) console.error('  ' + n)
  failed = true
} else {
  console.log(`published docs: every declaration the README names is on the surface (${surface.size} names)`)
}

process.exit(failed ? 1 : 0)
