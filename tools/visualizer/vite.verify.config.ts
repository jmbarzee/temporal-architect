// Build config for the golden harness's typechecked half.
//
// A second library entry, bundled to `dist-verify/` and run with plain `node`.
// No test framework and no new dependency: the harness is a program that prints
// a JSON snapshot, and `verify/run.mjs` is the thing that diffs it.
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
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
