// The resolve settings the app, the published library and the unit tests share:
// `@` is this package's `src/`, and React is deduped to this package's one copy,
// so a linked `@jmbarzee/force-graph` (`npm link`) brings no second React.
import { resolve } from 'path'

export function libraryResolve(dir: string) {
  return {
    alias: [{ find: '@', replacement: resolve(dir, 'src') }],
    dedupe: ['react', 'react-dom'],
  }
}
