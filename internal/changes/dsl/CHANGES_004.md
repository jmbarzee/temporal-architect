# DSL Changes

**Source review(s):** ad-hoc design review of signal/query/update completeness (June 2026), follow-up to `REVISIONS_001`; adjusted by handler-option research (see below).
**REVISIONS file(s):** `internal/changes/dsl/REVISIONS_002.md` (consumed)

## Summary

Added an optional `options:` sub-block to signal, query, and update handler declarations, reusing the existing `options_block` grammar. The block leads the handler body (same placement as a `state:` block at the top of a workflow). Initial admitted keys: `unfinished_policy` (signal + update) and `description` (all three handler kinds). Setting up the slot now lets future per-handler options land as additive key additions rather than grammar changes.

## Research-driven adjustments to REVISIONS_002

A review of the actual Temporal handler-option surface (Go SDK, cross-checked against 5 other SDKs) corrected two points in the REVISIONS:

- **`description` is admitted on all three handler kinds**, superseding D4's "empty query key set." `description` is the single universal handler option and the *only* query option (`QueryHandlerOptions.Description`, Go SDK v1.29.0), so queries get a real key rather than an empty slot.
- **`unfinished_policy` is design-intent on signal + update**, but the Go SDK exposes it only on update handlers (`UpdateHandlerOptions.UnfinishedPolicy`); `SignalChannelOptions` has only `Description`. So a signal-level policy is expressible in the DSL but not emittable to Go — to be documented in the author-go propagation. This corrects REVISIONS_002's reference to a non-existent `workflow.SignalHandlerOptions{UnfinishedPolicy}`.
- `validator` (update-only, a function reference) remains deferred to BACKLOG.

## Changes by Type

### Grammar

- **`tools/spec/sections/01-workflows.md`**: `signal_decl`, `query_decl`, `update_decl` productions now allow `[options_block]` at the head of the handler body, before `statement*`. Each handler section notes the allowed option keys.
- **`tools/spec/sections/12-grammar-summary.md`**: mirrored the three productions into the `INDENT [options_block] statement* DEDENT` form.

### Semantic

- **`tools/spec/sections/06-statement-syntax.md`** "Allowed keys per context": signal handler = `unfinished_policy` (`abandon` | `warn_and_abandon`, default `warn_and_abandon`), `description` (string); update handler = same; query handler = `description` (string). Added the `unfinished_policy` design-intent note (abandoned update handler ⇒ waiting caller gets `NotFound`) and a worked example.
- **`tools/spec/sections/11-resolution-and-errors.md`**: no new error codes — handler `options:` blocks use the existing `Unknown option key` / wrong-value-type / invalid-enum diagnostics (e.g. `unfinished_policy` on a query handler is an unknown key; a non-`abandon`/`warn_and_abandon` value is an invalid enum). Validated at parse time.

## Downstream propagation

`/project:propagate-changes` should produce downstream REVISIONS:

- **`internal/changes/parser/`** — covered by `internal/changes/parser/CHANGES_002.md` (landed in the same effort): `Options *OptionsBlock` on the three handler AST nodes, options-block parsing at the handler-body head, three new `OptionsContext` schemas, JSON `options` on handler decls.
- **`internal/changes/visualizer/`** — display handler-level options on handler nodes (small chip / annotation near the handler name when present). No new edge kinds. Minor.
- **`internal/changes/design-skill/`** — extend `skills/design/topics/signals-queries-updates.md` with a "Handler Options" subsection: `unfinished_policy` semantics, when each value is appropriate, the update-caller `NotFound` implication, and that `description` is available on all three kinds.
- **`internal/changes/author-go-skill/`** — map `unfinished_policy` → `workflow.UpdateHandlerOptions{UnfinishedPolicy}` (update) and `description` → the `Description` field on `UpdateHandlerOptions` / `SignalChannelOptions` / `QueryHandlerOptions`. **Document the Go gap:** `SignalChannelOptions` has no `UnfinishedPolicy`, so a signal-handler `unfinished_policy` is design-intent that Go cannot currently emit.

## Future per-handler options to reserve mental space for

- `validator` — update-only; a validation function reference. Deferred (BACKLOG).
