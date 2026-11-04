// Unit tests (`npm test`): `src/**/*.test.ts`, pure logic under node.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
