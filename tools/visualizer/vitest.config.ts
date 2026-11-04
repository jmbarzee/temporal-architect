// Unit tests (`npm test`): `src/**/*.test.{ts,tsx}`, resolving the graph-view
// library as the app and library builds do. They run under node; a test that
// renders names its DOM (`// @vitest-environment happy-dom`).
import { defineConfig } from 'vitest/config'
import { libraryResolve } from './vite.shared'

export default defineConfig({
  resolve: libraryResolve(__dirname),
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
