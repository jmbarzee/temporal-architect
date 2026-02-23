# Parser Output Contract Revisions

Go JSON output (authoritative) vs TypeScript type declarations. Two groups of contract mismatches found.

## Coverage Summary

| Topic | Status | Notes |
|-------|--------|-------|
| Top-level definition types | aligned | All 5 types, discriminators, FileSummary |
| Reference resolution | aligned | resolvedRefJSON ↔ ResolvedRef, all 12 use sites |
| Async target union | aligned | All 7 kinds, field-for-field match |
| Handler declarations | aligned | Signal/Query/Update decls + array emission |
| Call statements | **mismatch** | ActivityCall.options and WorkflowCall.options typed as `string` |
| Options block structure | aligned | OptionsBlock/OptionEntry types correct |
| State/conditions/promises | aligned | StateBlock, ConditionDecl, PromiseStmt, Set/Unset |
| NexusServiceDef | aligned | Semantic looseness tolerated by defensive consumers |
| WorkerDef refs | **mismatch** | Array fields required in TS but omitted by Go when empty |
| NamespaceDef | **mismatch** | Array fields required in TS but omitted by Go when empty |

---

## Group 1: Options Type Mismatch on Call Statements

**Severity:** Critical | **Blocked:** No | **Type:** Schema

Go emits `options` as `*OptionsBlockJSON` (a structured object with `entries: OptionEntryJSON[]`) on `activityCallJSON` and `workflowCallJSON`. TypeScript declares these as `options?: string`.

`NexusCall.options` is already correctly typed as `OptionsBlock?`. The mismatch is only on activity and workflow calls.

No current consumer reads `options` on ActivityCall or WorkflowCall, so this is latent. But the type is fundamentally wrong — any future code accessing `stmt.options.entries` would get a type error even though the data is there.

### Fix

In `tools/visualizer/src/types/ast.ts`:
- `ActivityCall.options`: change `string` → `OptionsBlock`
- `WorkflowCall.options`: change `string` → `OptionsBlock`

### Files touched
- `tools/visualizer/src/types/ast.ts` — 2 field type changes

---

## Group 2: Optionality Drift on Array Fields

**Severity:** Moderate | **Blocked:** No | **Type:** Schema

Go uses `omitempty` on slice fields that TypeScript declares as required arrays. When the Go slice is nil/empty, `json.Marshal` omits the field entirely, producing `undefined` in JavaScript. TypeScript's type says non-optional `T[]`, creating a contract lie.

Affected fields:

| Type | Field | Go tag | TS declaration | Should be |
|------|-------|--------|---------------|-----------|
| `WorkerDef` | `workflows` | `omitempty` | `WorkerRef[]` | `WorkerRef[]?` |
| `WorkerDef` | `activities` | `omitempty` | `WorkerRef[]` | `WorkerRef[]?` |
| `WorkerDef` | `services` | `omitempty` | `WorkerRef[]` | `WorkerRef[]?` |
| `NamespaceDef` | `workers` | `omitempty` | `NamespaceWorker[]` | `NamespaceWorker[]?` |
| `NamespaceDef` | `endpoints` | `omitempty` | `NamespaceEndpoint[]` | `NamespaceEndpoint[]?` |

All current consumers already use defensive patterns (`|| []`, `?.length`), so no runtime crashes today. But the types mislead future code.

### Fix options

**Option A (TS side):** Mark the 5 fields optional in `ast.ts`. Consumers already handle `undefined`.

**Option B (Go side):** Emit empty arrays instead of nil — change `marshalWorkerRefs` to return `[]WorkerRefJSON{}` for empty input (and similarly in `NamespaceDef.MarshalJSON` init the slices). Then the TS required types become correct.

Option B is cleaner — it makes the Go output self-consistent (always emit the field) and removes the need for defensive fallbacks in TypeScript.

### Files touched (Option A)
- `tools/visualizer/src/types/ast.ts` — 5 field optionality changes

### Files touched (Option B)
- `tools/lsp/parser/ast/json.go` — `marshalWorkerRefs` return empty slice; `NamespaceDef.MarshalJSON` init slices

---

## Future Notes

- **NexusOperation semantic looseness:** Go populates `workflowName`, `params`, `returnType`, `body` on all operations regardless of `opType`. TypeScript treats them as conditional. No runtime issue — consumers check `opType` before accessing. Could be tightened on the Go side in the future but not a contract violation.
- **Defensive `|| []` patterns in consumers:** If Option B (Group 2) is chosen, these become unnecessary. They're harmless to leave but could be cleaned up in a quality review.
