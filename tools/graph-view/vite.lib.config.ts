// Library build config for `@temporal-architect/graph-view`: an ESM bundle with
// externalized React peer dependencies, one sibling stylesheet (the tokens and
// every component's rules), and bundled `.d.ts` files. In this repository the
// visualizer consumes the library from source through its own build's alias
// (D62), so this build is the standalone, extractable artifact — R36 — and what
// `make pack-graph-view-lib` attaches to a Release.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    dts({
      rollupTypes: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.test.*'],
    }),
  ],
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'react-dom/server'],
      output: {
        assetFileNames: (assetInfo) => (assetInfo.name?.endsWith('.css') ? 'styles.css' : 'assets/[name].[ext]'),
      },
    },
  },
})
