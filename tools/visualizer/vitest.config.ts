// Unit tests run under node; a test that renders names its DOM (`// @vitest-environment happy-dom`).
import { defineConfig } from 'vitest/config'
import { libraryResolve } from './vite.shared'

export default defineConfig({
  resolve: libraryResolve(),
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
