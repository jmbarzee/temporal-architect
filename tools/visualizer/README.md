# @temporal-architect/visualizer

A React component for visualizing Temporal system architecture — namespaces,
workers, workflows, and Nexus — as an interactive tree and dependency graph.

This is the npm-publishable surface of the visualizer that ships inside the
[Temporal Architect VS Code extension](https://github.com/jmbarzee/temporal-architect).
Host applications can embed the same component directly in their own React apps —
spec builders, doc sites, internal review tools.

## Install

```bash
npm install @temporal-architect/visualizer
```

`react` and `react-dom` are peer dependencies (`^18 || ^19`). Versions are
synced to the upstream `temporal-architect` Git tag, so `0.3.x` of this package
corresponds to `v0.3.x` of the toolchain.

## Usage

```tsx
import { Visualizer } from '@temporal-architect/visualizer'
import '@temporal-architect/visualizer/styles.css'

import type { TWFFile } from '@temporal-architect/visualizer'

function MyApp({ ast }: { ast: TWFFile }) {
  return (
    <Visualizer
      ast={ast}
      onOpenFile={(file) => console.log('navigate to', file)}
      style={{ height: '100vh' }}
    />
  )
}
```

The `ast` prop accepts the `definitions` payload emitted by `twf parse` (the
JSON envelope's AST portion). Type definitions for every AST node are
exported from the package — see the [API](#api) section.

### Getting an AST

Use the `twf` CLI (installable via `curl | bash` — see the [repo
docs](https://github.com/jmbarzee/temporal-architect/tree/main/tools/lsp/cmd/twf)),
then pass the parser's output into the component:

```bash
twf parse workflow.twf > ast.json
```

```ts
import astJson from './ast.json'
import { Visualizer, type TWFFile } from '@temporal-architect/visualizer'

// `twf parse` emits an envelope with summary/diagnostics/definitions.
// The visualizer only needs the inner `definitions` payload wrapped in
// the AST shape it expects.
const ast: TWFFile = {
  definitions: astJson.definitions,
  summary: astJson.summary,
  diagnostics: astJson.diagnostics,
}

<Visualizer ast={ast} />
```

## API

### `<Visualizer>` props

| Prop          | Type                                | Default   | Notes                                                                          |
|---------------|-------------------------------------|-----------|--------------------------------------------------------------------------------|
| `ast`         | `TWFFile`                           | required  | Parsed TWF AST. Matches the `definitions` field of `twf parse`'s envelope.     |
| `onOpenFile`  | `(file: string) => void`            | no-op     | Fired when the file filter narrows to one — a "focus this file" hint for hosts. |
| `onRefocus`   | `() => void`                        | no-op     | Fired on any click inside the canvas. Hosts wire this to "give focus back to editor". |
| `className`   | `string`                            | undefined | Appended to the built-in `view-shell` class on the outer container.            |
| `style`       | `React.CSSProperties`               | undefined | Inline style on the outer container.                                           |

### Exported types

The package re-exports the full TWF AST type graph so host apps can write
their own walkers, badges, or side panels without re-declaring the shapes:

- `TWFFile`, `Definition`, `WorkflowDef`, `ActivityDef`, `WorkerDef`,
  `NamespaceDef`, `NexusServiceDef`
- `Statement` and its variants (`ActivityCall`, `WorkflowCall`, `NexusCall`,
  `AwaitStmt`, `IfStmt`, …)
- `AsyncTarget` variants (`TimerTarget`, `SignalTarget`, …)
- `Diagnostic`, `DiagnosticSeverity`, `DiagnosticKind` — the structured
  diagnostic shape carried alongside the AST in `twf parse`'s envelope
- `Position`, `ResolvedRef`, `OptionsBlock`, `OptionEntry`

The authoritative JSON Schema for the wire format lives at
[`tools/lsp/cmd/twf/twf.schema.json`](https://github.com/jmbarzee/temporal-architect/blob/main/tools/lsp/cmd/twf/twf.schema.json).

## Styling

CSS ships as a sibling asset — import it once at your app's root:

```ts
import '@temporal-architect/visualizer/styles.css'
```

The stylesheet scopes everything inside the component's `view-shell`
container, so it should not collide with your host app's styles. Override
selectors via your own CSS (loaded after `styles.css`) or use the
`className` / `style` props for container-level tweaks.

## SSR / Next.js

The visualizer is a client component — it uses `useState`, `useEffect`, and
DOM measurement extensively. In Next.js (App Router), wrap your import:

```tsx
'use client'

import { Visualizer } from '@temporal-architect/visualizer'
```

or load it dynamically with `{ ssr: false }`.

## Versioning

This package follows the upstream `temporal-architect` repo's `v*` Git tags
exactly — `0.3.2` of the package is built from the `v0.3.2` source tree.
The release pipeline (`/.github/workflows/release.yml` in the upstream
repo) publishes a new npm version on every tag push.

## License

MIT. See [LICENSE](https://github.com/jmbarzee/temporal-architect/blob/main/LICENSE).
