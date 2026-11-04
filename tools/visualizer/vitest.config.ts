// Unit tests (`npm test`): `src/**/*.test.ts`, pure logic under node, resolving
// the graph-view library as the app and library builds do.
import { defineConfig } from 'vitest/config'
import { libraryResolve } from './vite.shared'

export default defineConfig({
  resolve: libraryResolve(__dirname),
  test: {
    include: ['src/**/*.test.ts'],
  },
})
