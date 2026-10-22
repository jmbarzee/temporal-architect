// Gate 2b — the published types must typecheck from a consumer's seat.
//
// The twin of tools/visualizer/verify/dts-gate.mjs: each package gates its own
// published surface, and the two differ only in which modules count as private.
//
// Gate 2 ran `build:lib` and checked the exit code. That is a weaker claim than
// it looks: vite-plugin-dts emits declarations from an `include` allowlist, and a
// file outside that list is simply not written — no warning, exit 0. The JS
// bundle still inlines the implementation, so everything *runs*. Only the `.d.ts`
// is wrong, and it is wrong in the specific way that `lib.d.ts` re-exports a
// module that does not exist beside it.
//
// Unit 2e did exactly that: moving `node-type-styles.ts` into `src/adapter/`
// left it off the include list, and the shipped `dist-lib/lib.d.ts` re-exported
// `./adapter/node-type-styles`, which was never emitted. Every gate stayed green.
//
// What a consumer sees depends on their config, and both outcomes are bad:
//   skipLibCheck: false -> hard failure, TS2307
//   skipLibCheck: true  -> compiles, and every export from that module is `any`
// The second is worse, because it is silent.
//
// So this compiles a throwaway consumer against the exact entry point
// `package.json` advertises, with skipLibCheck OFF.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'))

// Typecheck what is actually published, not a path we happen to know.
const typesEntry = pkg.exports?.['.']?.types ?? pkg.types
if (!typesEntry) {
  console.error('dts gate: package.json declares no types entry point.')
  process.exit(1)
}
const typesPath = resolve(PKG_ROOT, typesEntry)
console.log(`published types gate — ${typesEntry}`)

if (!existsSync(typesPath)) {
  console.error(`dts gate: ${typesEntry} does not exist. Run \`npm run build:lib\` first.`)
  process.exit(1)
}

const dir = join(PKG_ROOT, 'node_modules', '.cache', 'dts-gate')
rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })

// Import the namespace rather than named exports: this gate is about whether the
// declaration graph resolves, not about which names exist. A dangling re-export
// inside lib.d.ts fails the compile no matter what the consumer imports.
writeFileSync(join(dir, 'consumer.ts'),
  `import * as lib from ${JSON.stringify(typesPath.replace(/\.d\.ts$/, ''))}\n` +
  `export const _keep: keyof typeof lib | undefined = undefined\n`)

writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    strict: true,
    // The whole point. With this on, a missing declaration is invisible.
    skipLibCheck: false,
    noEmit: true,
    module: 'esnext',
    target: 'es2020',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    types: [],
    baseUrl: PKG_ROOT,
  },
  files: ['consumer.ts'],
}, null, 2))

// The engine's parameter and force modules are private: `ForceParams` is not
// part of the published surface, which is what made renaming a field inside it
// free (D53, #90). The surface gate compares export NAMES and cannot see a type
// that leaks through another exported type's field (REVIEW_5a C8), so this walks
// the declaration graph from lib.d.ts and refuses if a private module becomes
// reachable.
// The taxonomy (`createOntology`, the scalar axes) IS this package's surface; the
// force model behind it is not (D53, #90, D62).
const PRIVATE = [/\/graph\/simulation\.d\.ts$/, /\/graph\/forces\.d\.ts$/]
function reachableDts(entry) {
  const seen = new Set()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    let text = ''
    try { text = readFileSync(file, 'utf8') } catch { continue }
    for (const m of text.matchAll(/(?:from\s*|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = join(dirname(file), m[1])
      for (const candidate of [base + '.d.ts', join(base, 'index.d.ts'), base]) {
        try { if (statSync(candidate).isFile()) { queue.push(candidate); break } } catch { /* try next */ }
      }
    }
  }
  return [...seen]
}

try {
  execFileSync(join(PKG_ROOT, 'node_modules', '.bin', 'tsc'),
    ['-p', join(dir, 'tsconfig.json')], { stdio: 'pipe', cwd: PKG_ROOT })
  console.log('published types: consumer compile clean (skipLibCheck off)')
  const reachable = reachableDts(typesPath)
  const leaked = reachable.filter(f => PRIVATE.some(re => re.test(f)))
  if (leaked.length) {
    console.error('FAIL published types reach a private engine module:')
    for (const f of leaked) console.error('  ' + f.replace(PKG_ROOT + '/', ''))
    console.error('ForceParams and the force kernels are not part of the surface (D53, #90); an exported type now carries one of them.')
    process.exit(1)
  }
  console.log(`published types: ${reachable.length} declaration files reachable from the entry, none private`)
} catch (err) {
  const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')
  console.error(out.trim())
  console.error('\nFAIL published types gate.')
  console.error('A dangling re-export usually means a source tree is missing from')
  console.error("vite.lib.config.ts's dts `include` list. The build does not warn.")
  process.exit(1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
