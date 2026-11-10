// React is deduped to this package's one copy, so a linked
// `@jmbarzee/force-graph` (`npm link`) brings no second React.
export function libraryResolve() {
  return { dedupe: ['react', 'react-dom'] }
}
