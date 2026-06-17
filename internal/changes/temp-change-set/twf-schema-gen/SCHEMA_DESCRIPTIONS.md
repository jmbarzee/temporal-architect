# `twf.schema.json` descriptions — migration inventory (T7)

The hand-maintained JSON Schema (`tools/lsp/cmd/twf/twf.schema.json`,
`$schemaVersion: 1.2.0`) is being retired (decision D1). Nothing consumes it at
runtime; the Go DTO structs + generated `@temporal-architect/wire-types` are the
contract. Before deletion, this inventory reviews every `description` string in
the schema so genuinely-useful prose is preserved as a Go doc-comment (which
then flows into the generated TS JSDoc via tygo).

Verdict legend: **migrate** = move/merge into the named Go doc-comment;
**skip** = an equivalent Go doc-comment already exists.

| # | JSON path | Target Go DTO | Verdict |
|---|-----------|---------------|---------|
| 1 | *(root)* — "Stable wire contract emitted by `twf parse` / `symbols --json` / `graph --json` / `graph chunks --json`; adding optional fields/codes is non-breaking, renaming/removing is breaking; `$schemaVersion` semver" | `envelope.Envelope` (type doc) | **migrate** — fold the emitted-by list + non-breaking/breaking note into the Envelope doc |
| 2 | `properties/definitions` — "Present on `twf parse`. The AST definitions array. Item shape intentionally permissive — see the discriminated union." | `envelope.Envelope.Definitions` | **migrate** — point at the `Definition` union in `@temporal-architect/wire-types` |
| 3 | `properties/symbols` — "Present on `twf symbols --json`. The symbol list." | `envelope.Envelope.Symbols` | **migrate** |
| 4 | `properties/graph` — "Present on `twf graph --json`. Resolved deployment graph: nodes are runtime deployments, edges are confirmed dispatches." | `envelope.Envelope.Graph` | **migrate** |
| 5 | `properties/chunks` — "Present on `twf graph chunks --json`. Topology-based decomposition: hard partition + inter-chunk DAG + (with a ceiling) ranked soft divisions." | `envelope.Envelope.Chunks` | **migrate** |
| 6 | `$defs/ChunkNode` — "One authorable definition (deployment-duplicates collapsed). Kind is workflow / activity / nexusOperation." | `decompose.Node` | **skip** — Go doc: "one authorable definition (a unique AST entry)…" |
| 7 | `$defs/ChunkRootDecl` — "A heuristic entry point. source is heuristic this pass; declared is reserved." | `decompose.Root` | **skip** — Go doc covers source/reasons |
| 8 | `$defs/Chunk` — "One element of the hard partition (WCC of binding+soft subgraph). Every definition lands in exactly one chunk." | `decompose.Chunk` | **skip** — Go doc is verbatim-equivalent |
| 9 | `$defs/ChunkEdge` — "Contract-cut dependency between two hard chunks (via == nexusCall)." | `decompose.ChunkEdge` | **skip** — Go doc covers it |
| 10 | `$defs/Division` — "One candidate way to cut an over-ceiling chunk into sections, with a dependency DAG. Rank 1 is most balanced." | `decompose.Division` | **skip** — Go doc covers it |
| 11 | `$defs/Section` — "One proposed sub-unit. id/members/complexity authoritative; divisions is the recursive refinement of a still-over-ceiling section." | `decompose.Section` | **skip** — Go doc covers it |
| 12 | `$defs/SectionEdge` — "Orders two sections: From depends on (calls into) To." | `decompose.SectionEdge` | **skip** — Go doc covers it |

## Outcome

- Migrated #1–#5 into `tools/lsp/cmd/twf/internal/envelope/model.go` (the
  `Envelope` type doc + per-payload field comments). These now flow into the
  generated `envelope.ts` JSDoc.
- #6–#12 already have equivalent (often richer) doc-comments in
  `tools/lsp/parser/decompose/result.go`; no migration needed.
- No `description` text is lost by retiring the schema.
