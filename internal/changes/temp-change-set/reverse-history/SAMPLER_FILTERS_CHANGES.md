# Sampler Changes — time-window / status filters

**Source:** [BACKLOG.md](BACKLOG.md) → "Deferred: sampler ergonomics / Time-window / status filters"
**Workstream:** reverse-history ([GRAPH_FROM_HISTORY.md](GRAPH_FROM_HISTORY.md))
**REVISIONS file(s):** none — sampler-only, implemented inline and linked back here.

## Summary

Added time-window and status filtering to `tools/sampler/`. The sampler can now
restrict which executions it enumerates and samples to a `StartTime` window and
a single `ExecutionStatus`, threading the filters through every Visibility query
the sampler builds so the count path and the candidate path stay consistent.

## Changes by Type

### CLI (`tools/sampler/main.go`)

- New flags:
  - `--since` / `--until` — a `StartTime` window. Each accepts an RFC3339
    timestamp **or** a Go duration like `24h`, the latter taken relative to now
    (`now - d`). Empty = unbounded on that side.
  - `--status` — an `ExecutionStatus` filter (e.g. `Running`, `Completed`,
    `Failed`). Empty = any status.
- New `parseTimeFlag(s, now)` helper interprets the RFC3339-or-duration value;
  invalid values are rejected with a clear error before dialing the server.
- `run` parses both time flags against a single `now` and passes `Status` /
  `Since` / `Until` into `sampling.Options`.

### API (`tools/sampler/sampling/sampling.go`)

- `Options` gained `Status string`, `Since time.Time`, `Until time.Time`.
- `Sample` builds an internal `filters` value and threads it through
  `enumerate` → `countByType` / `scanByType` and into `queryByType`.
- `countByType` now issues `countQuery(f)` (filter clauses prepended before
  `GROUP BY WorkflowType`) so per-type counts reflect the filtered set.
- `scanByType` (the portable GROUP BY fallback) now passes `scanQuery(f)` as the
  `ListWorkflow` query — empty preserves the v1 "list everything" behavior.
- `queryByType` applies the filters and **skips the prefer-running first pass
  when an explicit `--status` is set**, so the running pass never contradicts a
  `--status=Completed`-style filter. Without `--status` the original
  running-first-then-top-up behavior is unchanged.

### Internal query building (`tools/sampler/sampling/select.go`)

- New unexported `filters` type (`status`, `since`, `until`) plus pure,
  deterministic query builders:
  - `whereClauses()` — emits clauses in a stable order (status, then
    `StartTime`). Uses `StartTime BETWEEN 'a' AND 'b'` when both bounds are set,
    and `StartTime >= 'a'` / `StartTime <= 'b'` for single-sided windows.
  - `countQuery(f)` — filter clauses + `GROUP BY WorkflowType`.
  - `scanQuery(f)` — filter clauses only (empty = all).
  - `typeQuery(wfType, f, runningOnly)` — `WorkflowType` selector + filters,
    optionally appending `ExecutionStatus = 'Running'` for the prefer-running
    pass.

## Consistency / determinism

- The count path and candidate path share the same `filters`, so a filtered
  count always matches the executions the candidate queries can return — the
  `GROUP BY`-then-scan fallback is preserved on both sides.
- Clause ordering is fixed and timestamps are formatted RFC3339, so generated
  queries (and therefore sampled output) are stable across runs.

## Tests

- `tools/sampler/sampling/select_test.go` (existing style): unit tests for
  `whereClauses`, `countQuery`, `scanQuery`, and `typeQuery` covering no-filter,
  status-only, single-sided window, `BETWEEN`, combined status+window, and the
  running-only pass.
- `tools/sampler/path_test.go`: `parseTimeFlag` tests (empty, RFC3339, duration
  relative to now, invalid).
- Validated with `GOMODCACHE=$HOME/go/pkg/mod go build ./... && go test ./...`
  across all workspace modules — green.

## Remaining sampler-ergonomics backlog (unchanged)

Transitive sampling, concurrency / rate limiting, and Temporal Cloud env auth
remain deferred under the same BACKLOG section.
