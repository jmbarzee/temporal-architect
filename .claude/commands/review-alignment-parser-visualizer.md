# Align Visualizer to Parser JSON Contract

This command answers: "does the TypeScript layer correctly and completely consume what the parser's JSON contract provides?"

This is a boundary review — the parser's JSON output is the contract between Go and TypeScript. Implementation quality on either side belongs in `/project:review-quality-parser` and `/project:review-quality-visualizer`. This command is solely about the contract: shape mismatches, missing fields, incorrect types, and unhandled variants.

## Context

- `tools/lsp/parser/ast/ast.go` and `ast/json.go` — Go AST types and JSON serialization (authoritative source)
- `tools/visualizer/src/types/ast.ts` — TypeScript type declarations (primary target)
- `tools/visualizer/src/` — TypeScript consumers (secondary target — how types are actually used)
- `tools/visualizer/spec/TREE_VIEW.md` and `GRAPH_VIEW.md` — what the consumers need to provide
- `AST_REVISIONS.md` — changes in flight that will affect the contract
- `PARSER_OUTPUT_REVISIONS.md` — if present, read to avoid re-reporting known gaps

## Workflow

### Phase 1: Orient

Briefly scan `ast/ast.go`, `ast/json.go`, and `types/ast.ts`. Confirm the comparison units below still apply — add topics for new Go types without TypeScript counterparts, drop topics for removed types. Note any `AST_REVISIONS.md` changes that affect the contract and may already supersede findings in Phase 2.

**Standard comparison units:**

| # | Topic | Source (Go AST / JSON serialization) | Target (TypeScript types & consumers) |
|---|-------|--------------------------------------|---------------------------------------|
| 1 | Top-level definition types | `WorkflowDef`, `ActivityDef`, `WorkerDef`, `NamespaceDef`, `NexusServiceDef` → `Definition` union via `marshalDefinition()` | `Definition` union in `ast.ts`; `DefinitionBlock.tsx` router |
| 2 | Reference resolution | `Ref[T]` → `resolvedRefJSON` (Name, Line, Column); emitted on call/worker refs | `ResolvedRef` in `ast.ts`; usage in `CallBlocks.tsx`, `AwaitBlocks.tsx` |
| 3 | Async target discriminated union | `AsyncTarget` interface → 7 concrete types with `Kind` string; `marshalAsyncTarget()` | `AsyncTarget` union + `AsyncTargetKind` enum in `ast.ts`; `getAwaitTargetDisplay()` in `AwaitBlocks.tsx` |
| 4 | Workflow handler declarations | `SignalDecl`, `QueryDecl`, `UpdateDecl` in `WorkflowDefJSON`; bodies as `[]json.RawMessage` | `HandlerDecl` union in `ast.ts`; `HandlerContext` map in `DefinitionBlock.tsx` |
| 5 | Call statements & inline expansion | `ActivityCall`, `WorkflowCall`, `NexusCall` JSON structs; resolved refs on each | `ActivityCall`, `WorkflowCall`, `NexusCall` in `ast.ts`; `CallBlocks.tsx` inline expansion |
| 6 | Options blocks | `OptionsBlock` + recursive `OptionEntry` tree; `omitempty` on value/nested fields | `OptionsBlock`, `OptionEntry` in `ast.ts`; note suspected mismatch: some TS call types have `options?: string` |
| 7 | State block, conditions & promises | `StateBlock`, `ConditionDecl`, `PromiseStmt`, `SetStmt`, `UnsetStmt` and their JSON shapes | State types in `ast.ts`; ident resolution in `AwaitBlocks.tsx` |
| 8 | Nexus service definitions & operations | `NexusServiceDef`, `NexusOperation` with `opType` string (async/sync); optional Workflow vs Body fields | `NexusServiceDef`, `NexusOperation`, `NexusOperationType` in `ast.ts` |
| 9 | Worker definitions & references | `WorkerDef` with `Workflows`, `Activities`, `Services` (`[]Ref[T]`) → `WorkerRefJSON` | `WorkerDef`, `WorkerRef` in `ast.ts`; `WorkerDefBlock` expansion |
| 10 | Namespace definitions & instantiation | `NamespaceDef`, `NamespaceWorker`, `NamespaceEndpoint`; resolved worker refs | `NamespaceDef`, `NamespaceWorker`, `NamespaceEndpoint` in `ast.ts` |

### Phase 2: Parallel Alignment

Launch one sub-agent per topic. Each sub-agent reads the relevant **Go JSON serialization AND the corresponding TypeScript types and consumers** for its topic, then answers:

- Does the TypeScript type match the Go JSON shape? (field names, types, optionality)
- Are all Go enum variants / `kind` values handled in the TypeScript discriminated union?
- Are fields marked optional in TypeScript where Go uses `omitempty`, and vice versa?
- Are there fields the TypeScript accesses that Go no longer emits, or that Go emits but TypeScript ignores?

Where behavior is ambiguous, run `twf parse` against a representative `.twf` file and inspect the actual JSON. Don't infer the contract from type definitions alone.

Sub-agents run in parallel. **Every sub-agent reads both sides** — Go serialization and TypeScript consumers — for its topic.

### Phase 3: Catalog

Merge all findings. For each issue:
- **Status**: `aligned` | `mismatch` | `missing` | `stale`
- **Gap**: the specific field, type, or variant that diverges
- **Severity**: `critical` (would cause runtime errors or silent data loss) | `moderate` | `minor`

Drop anything already tracked in `PARSER_OUTPUT_REVISIONS.md`.

### Phase 4: Group & Prioritize

Group by concern type (discriminated union gaps, type mismatches, optionality drift, missing fields). Order: critical mismatches first, then missing fields, then minor drift.

### Phase 5: Write to `PARSER_OUTPUT_REVISIONS.md`

Write the grouped plan at the repo root:
- Brief summary: contract health, number and severity of mismatches found
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Schema` | `Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints

- **Go JSON is authoritative.** TypeScript must match what Go emits — not the other way around.
- **Sub-agents are scoped by topic, not by artifact.** Every sub-agent reads both Go serialization and TypeScript for its topic.
- **Run `twf parse`, don't infer.** Actual JSON output may differ from what the Go types suggest (omitempty, nil slices, etc.).
- **Stay at the boundary.** Don't review Go internals or TypeScript rendering logic — only the contract surface.
- **No backwards compatibility.** Pre-v1. If the contract should change, say so. Document breaking changes for the TS team.
