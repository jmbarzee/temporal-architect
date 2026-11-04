// Build config for the verification bundle: `src/verify/main.ts` bundled to
// `dist-verify/verify.js` and run with plain `node` by `verify/run.mjs`. No test
// framework and no new dependency: the checks are a program that prints its
// failures as JSON.
import { defineConfig } from 'vite'
import { libraryResolve } from './vite.shared'
import { resolve } from 'path'

export default defineConfig({
  resolve: libraryResolve(__dirname),
  publicDir: false,
  build: {
    outDir: 'dist-verify',
    emptyOutDir: true,
    sourcemap: false,
    // Never minify: a failing check's stack has to name real functions.
    minify: false,
    target: 'node20',
    lib: {
      entry: resolve(__dirname, 'src/verify/main.ts'),
      formats: ['es'],
      // Without it vite names the output from the package name.
      fileName: () => 'verify.js',
    },
  },
})
