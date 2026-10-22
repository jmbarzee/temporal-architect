// Build config for the golden harness's typechecked half.
//
// A second library entry, bundled to `dist-verify/` and run with plain `node`.
// No test framework and no new dependency: the harness is a program that prints
// a JSON snapshot, and `verify/run.mjs` is the thing that diffs it.
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    // The graph-view library, from source: one install, HMR, and no build order
    // between the two packages (D62). The bare specifier is the public entry;
    // the deep form is the harness's road to internals.
    alias: [
      { find: /^@temporal-architect\/graph-view$/, replacement: resolve(__dirname, '../graph-view/src/index.ts') },
      { find: /^@temporal-architect\/graph-view\/(.+)$/, replacement: resolve(__dirname, '../graph-view/src/$1') },
      { find: '@', replacement: resolve(__dirname, 'src') },
    ],
    // The library's files sit beside their own node_modules; React must still
    // resolve to this package's one copy, or hooks meet two Reacts at runtime.
    dedupe: ['react', 'react-dom'],
  },
  // The fixtures are imported as JSON modules, not served — copying `public/`
  // into the output would only duplicate them.
  publicDir: false,
  build: {
    outDir: 'dist-verify',
    emptyOutDir: true,
    // Node runs this directly; a sourcemap buys nothing and the bundle is large.
    sourcemap: false,
    // Never minify: when the harness throws, the stack has to name real
    // functions or the failure is unreadable.
    minify: false,
    target: 'node20',
    lib: {
      entry: resolve(__dirname, 'src/verify/main.ts'),
      formats: ['es'],
      // Required. Without it vite names the output from the package name and
      // the run step fails with MODULE_NOT_FOUND.
      fileName: () => 'verify.js',
    },
  },
})
