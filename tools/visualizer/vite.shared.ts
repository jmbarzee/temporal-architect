// The seam to the graph-view library, declared once for the three builds (the
// app, the published library, the verification bundle): the bare specifier is
// the library's entry, from source; the deep form is the harness's road to its
// internals; and React is deduped to this package's one copy, because the
// library's files sit beside their own node_modules (D62, REVIEW_8 C23).
import { resolve } from 'path'

export function libraryResolve(dir: string) {
  return {
    alias: [
      { find: /^@temporal-architect\/graph-view$/, replacement: resolve(dir, '../graph-view/src/index.ts') },
      { find: /^@temporal-architect\/graph-view\/(.+)$/, replacement: resolve(dir, '../graph-view/src/$1') },
      { find: '@', replacement: resolve(dir, 'src') },
    ],
    dedupe: ['react', 'react-dom'],
  }
}
