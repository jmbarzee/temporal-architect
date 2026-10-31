// Run from tools/graph-view: npx vite --config examples/course-catalog/vite.config.ts
// The library resolves from source, as a published install would resolve it
// from dist-lib; React is deduped to the one copy beside the library.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { '@temporal-architect/graph-view': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5179 },
})
