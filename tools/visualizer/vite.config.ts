import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
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
})
