# Review Sampler Go Code Quality

Review the Go implementation in `tools/sampler/` — the binary that pulls workflow histories from a live Temporal namespace, folds them into a deployment graph in memory, and writes a single `observed-graph.json`.

This review is about the *producer* of observed graphs. The wire shape it emits, `observe.ObservedGraph`, is **owned by the parser** (`tools/lsp/parser/observe`) — the sampler populates a contract it does not define. Parser quality itself belongs in `.claude/skills/dev-cycle/references/review-quality-parser.md`.

## Context

Before starting, read:
- `tools/sampler/README.md` — the declared behaviour, flags, node-identity contract, event→graph mapping table, and the limitations inherent to history input. This is the calibration point for the review.
- `tools/lsp/parser/observe/` — the wire types the sampler must populate, and `observe.ToGraph` / `observe.Merge`
- in-flight files in `internal/changes/parser/` — the contract may be changing underneath this component
- All existing files in `internal/changes/sampler/` — both `*_REVISIONS_*.md` and `CHANGES_*.md` — to avoid re-reporting issues already tracked or addressed

`tools/sampler/` is **its own Go module** (`go.mod` with a `replace` onto `../lsp`). Build and test from that directory.

## Review Rubric

### 1. Contract Population
- Does the sampler populate every field of `observe.ObservedGraph` that it can, and leave the rest genuinely absent rather than zero-valued?
- Node IDs must match `graph.Extract`'s scheme exactly, using the shared exported constructors — a hand-built ID string is drift waiting to happen, because the whole value of the observed graph is that it is comparable to a `.twf`-derived one.
- Are the per-edge occurrence buckets laid out on the declared absolute-time window, and does a single-bucket default still mean "total"?

### 2. Event Decoding Fidelity
- Does every event type in the README's mapping table have a decoder, and does every decoder appear in that table? A decoder the docs don't mention, or a documented row with no decoder, is the gap this lens exists to find.
- Are events the sampler deliberately does *not* decode (local-activity markers, nexus operations) skipped explicitly, with the reason, rather than falling through silently?
- Continue-as-new: is the `workflowID → startInfo` index run-aware, or do chained runs collapse so later runs go invisible?

### 3. Sampling Correctness
- Is the expansion ladder (`--sample-percent`, `--min-per-type`) deterministic for a fixed input, and is the running-preference branch actually reachable?
- Visibility enumeration: is the `CountWorkflowExecutions GROUP BY` path correctly falling back to a paginated `ListWorkflow` scan when the server lacks grouping?
- Do the time-window and status filters thread consistently through *both* enumeration and candidate selection, or can one be applied and the other skipped?

### 4. Server Interaction
- Is anything unbounded against a live server — unpaged listing, unlimited concurrency, no rate limiting, no retry on a transient gRPC failure?
- Are connection concerns (address, TLS/mTLS, Cloud auth) separated from sampling logic, and is a partial failure distinguishable from an empty namespace?

### 5. Go Quality
- Error handling: are errors wrapped with enough context to identify *which* workflow or event failed, or do they surface as a bare gRPC status?
- Are the pure functions (sampling math, query construction, bucketing, path/flag parsing) genuinely pure and unit-testable — and tested? Those are the parts CI can cover with no Temporal server.
- Is anything that needs a live server hidden inside a function that otherwise looks pure?

## Workflow

**Follow this phased approach strictly. Do not skip or combine phases.**

### Phase 1: Explore

Use sub-agents in parallel:
- One agent for `tools/sampler/sampling/` — lenses 3 and 4
- One agent for `tools/sampler/history/` — lenses 1 and 2, cross-reading `tools/lsp/parser/observe/` for the contract it must populate
- One agent for `tools/sampler/main.go` + `main_test.go` — lenses 4 and 5, plus flag/output-path handling
- One agent for the context: `tools/sampler/README.md`, the integration suite at `test/integration/sampler/`, and any in-flight files in `internal/changes/parser/`

Agents work from source. Do **not** attempt to reach a live Temporal server.

### Phase 2: Catalog

Each finding must include:
- **Location**: `file:function` or `file:line`
- **Lens**: which rubric section (1–5)
- **Severity**: `critical` | `moderate` | `minor`
- **Theme**: a short grouping label (e.g., "contract drift", "silent event drop", "unbounded server call")
- **Finding**: 1–2 sentences on the issue and why it matters

Cross-reference against in-flight files in `internal/changes/parser/`: note any sampler code that will break when a planned parser contract change lands. Also cross-reference the open GitHub issues labelled `area:sampler` (`gh issue list --label area:sampler --state open`) and drop findings already filed.

### Phase 3: Group & Prioritize

Group by theme. Order by:
1. Contract-population drift — an observed graph that isn't comparable to a designed one has lost its whole purpose
2. Silently dropped events — data loss the operator cannot see
3. Unbounded or unsafe server interaction
4. Internal Go quality and test coverage

### Phase 4: Write to `internal/changes/sampler/quality_REVISIONS_{NNN}.md`

Write the grouped plan to `internal/changes/sampler/quality_REVISIONS_{NNN}.md` (create the `internal/changes/sampler/` directory if needed). Use the sequence number the dispatching agent gave you. If none was given (a human running this directly), use `_001` and increment past any file that already exists.
- `**Source:**` immediately after the H1 — the upstream `CHANGES` path when this review was triggered by a propagation, `—` when it was not. Required; `propagate-changes` dedups on it. See `.claude/skills/dev-cycle/SKILL.md` § REVISIONS file contract.
- Brief summary: scope of this review, what was found
- One `## Group N: Title` section per group
- Each group: findings addressed, files touched, change type (`Internal` | `Semantic`), parallelism notes

Sampler changes are `Internal` or `Semantic`. The sampler is a **leaf** — it owns no contract, so it never emits `Schema` or `API`. A finding that *would* require changing the observed-graph shape belongs to `parser` instead: record it as a propagation bullet aimed at `parser`, not as a sampler group.

**Return the REVISIONS file path and a one-line summary of each group.** Do not begin executing them — that is `.claude/skills/dev-cycle/references/address-review.md`, dispatched separately.

## Constraints
- **No live server.** Every finding must be reachable by reading source and running `go test ./...` from `tools/sampler/`. CI has no Temporal server and neither do you.
- **The sampler does not own the wire shape.** If the fix is "change `observe.ObservedGraph`", that is a `parser` change — route it there rather than editing the type from here.
- **Don't re-review the parser.** `observe`, `graph`, and `history.Build`'s dependencies belong to `review-quality-parser`.
- **Partial by construction is not a bug.** A history shows only what that run did; unsampled branches being invisible is documented behaviour, not a finding. Sampling *incorrectness* is.
- **No backwards compatibility.** Pre-v1. Propose clean fixes.
