# Parser Backlog

Unimplemented validation/analysis features and design ideas for the parser pipeline (lexer → parser → resolver → validator → graph). Not committed to any cycle — just a place to drop thoughts.

These checks live in the shared `validator` package (`tools/lsp/parser/validator/`), which is called by **both** the CLI (`cmd/twf/files.go`) and the LSP server (`internal/server/document.go`). Anything added here surfaces on both surfaces at once — there is no CLI-vs-LSP divergence to manage.

---

## Structural Completeness Validation

Context: today the validator's `checkCoverage` pass checks *worker-registration* coverage (is a definition registered on an instantiated worker) and only runs when namespaces are declared. It does **not** check whether a definition is ever *called*, nor whether it is *reachable* from an entry point. `REFLECTION_DESIGN.md` surfaced both gaps.

### Unused-Definition Check (orphan category B)

Flag any `activity`, `workflow`, or `nexus service` definition that has **zero structured call sites** anywhere in the file set.

**Why needed:** A defined-but-never-called activity is almost always a mistake (a dropped step, or — until the raw-statement fix lands — a call swallowed as `raw`; see `internal/changes/dsl/BACKLOG.md`). This check is also the **backstop for the raw-statement disambiguation**: a *typo'd* call name won't resolve to its symbol and so won't be flagged as a miswritten call, but the real definition then shows up here as unused.

**Dependencies:** Most precise once the raw-statement fix lands (otherwise calls written as raw produce false "unused" positives). Must treat handler-bearing and entry-annotated workflows as legitimately "used by an external trigger" — see the reachability nuance and Entry Point Annotation in the DSL backlog.

**Open questions:** Warning or error? Should it run unconditionally (today's coverage check is gated on `len(namespaces) > 0`)? How does it interact with multi-file designs where the caller is in another file?

### Reachability Check (orphan category C)

Walk the call/Nexus graph from declared entry points; report any workflow not reachable from an entry as dead code, and distinguish intended top-level entries from leftover workflows.

**Hard dependency:** This is **impossible without an entry-point concept** — a graph walk needs roots. See **Entry Point Annotation** in `internal/changes/dsl/BACKLOG.md`. Until entries are declarable, the validator cannot tell `Comparanda` (the real root) from leftover dead code.

**Out-of-band triggers:** Signal/query/update handlers and Nexus-operation-backing workflows are entered externally; the walk must seed roots with entry-annotated *and* handler-bearing workflows, or it will flag legitimately-triggered code as unreachable (the reachability nuance on the signal-sends backlog item).

**Substrate already exists:** `parser/graph/` performs resolved deployment-graph extraction, so the reachability walk has a graph to traverse — this is surfacing existing analysis, not inventing it.

**Open questions:** Is reachability opt-in once any `@entry` exists (files with zero entries = libraries, no warnings)? Warning vs error? Should it integrate into `twf check`, or sit behind a `twf reachability` / `twf check --strict` command (the latter ties into the broader twf-command-ergonomics discussion)?

---

## Design-Quality Linting (cross-reference)

Heuristic, intent-aware checks (missing `continue_as_new` on large loops, missing timeout/retry, wrapper workflows, sequential child-workflow loops, etc.) are tracked under **Design Quality Linting / `twf lint`** in `internal/changes/dsl/BACKLOG.md`. Those are advisory and judgment-heavy; the two checks above are structural-completeness checks closer to `twf check` proper. Keep the distinction: *completeness* (is everything wired up and reachable?) vs *quality* (is this a good design?).

---

## CLI / Query Surface

Motivation (from `REFLECTION_DESIGN.md` + the twf-command-ergonomics discussion): in a headless design session the agent had no push diagnostics and no question-shaped access to the model, so it repeatedly wrapped `twf parse --json | jq/python` to drill into specific questions ("what calls X?", "is anything unused?") and the user had to approve each shell invocation. The data largely already exists (`parse`, `graph`, `symbols --json`); what's missing is *question-shaped, compact, trusted* access. These two items address that. They are also the shared core that the CLI, LSP, and MCP server all expose (all three already run the same parser/resolver/validator).

### Question-Shaped Query Commands

Give the model (and humans) commands that answer the questions it actually asks, returning **compact text by default** (`--json` optional), instead of forcing it to scrape the full envelope.

Capabilities wanted:

- **Relationship queries on a single definition** — who calls this? what does this call? show everything about this one definition (signature, body, call sites, deployment, options). All derivable from the existing resolved graph + AST.
- **Whole-set structural findings** — definitions with no structured call site (unused), and workflows unreachable from a declared entry point (reachability — depends on Entry Point Annotation in the DSL backlog).

**Naming / organization is intentionally left open** — bring an API mindset when this is picked up. Some *suggestions*, not decisions:

- The whole-set structural findings are *validation* in nature, so they may fit best as diagnostics behind something like `twf check --strict` (codes e.g. `UNUSED_DEFINITION`, `UNREACHABLE_WORKFLOW`) — which would make them ride the existing `parse` envelope and the LSP/MCP diagnostic stream for free, rather than a standalone verb.
- The per-definition relationship queries are projections of the resolved graph, so they may fit as lenses under the existing `graph` noun (e.g. `twf graph callers/calls/show <name>`) rather than new top-level verbs — keeping the first subcommand layer uncluttered.
- Whatever the CLI grouping, the MCP layer (below) will likely flatten these into one tool per question.

**Open questions:** Which structural findings are checks (diagnostics) vs interactive queries (or both)? Default output format for the relationship queries — compact text shape? How do multi-file designs and cross-file callers factor in? Does `unused` precision depend on the raw-statement disambiguation landing first (see `internal/changes/dsl/BACKLOG.md`)? (It does — note the dependency.)

### `twf mcp` Subcommand

Implement the `twf mcp` server that the distribution **already advertises but does not yet provide**.

**Current state:** `.claude-plugin/marketplace.json` wires `mcpServers.twf = npx -y @temporal-architect/twf mcp` alongside the bundled skills, and both `@temporal-architect/twf` and the claude-plugin package descriptions/READMEs promise a "twf MCP server … exposing TWF parser tools, embedded spec resources, and skill prompts." But `cmd/twf/main.go` routes only `check/parse/symbols/graph/spec/lsp` — there is **no `mcp` case**, so `npx … twf mcp` currently exits with "Unknown command: mcp." (Also: source `version` const is `0.1.0` while the published packages are `0.3.2` — verify/realign on the next release.)

**Why this is the high-leverage delivery:** it hits all four ergonomics levers at once — push diagnostics (the Go/TS-style feedback loop), question-shaped tools (no shell wrapping), an allowlistable surface (no per-command approvals), and it works in headless CLI/subagent sessions (the exact context the reflection ran in). The distribution/wiring is already done; the remaining work is the subcommand itself.

**Proposed surface (to refine):** expose the query capabilities above as one MCP tool per question (e.g. `twf_diagnostics`, `twf_callers`, `twf_calls`, `twf_show`, `twf_unused`, `twf_symbols`), plus the embedded spec as resources and (optionally) the skill prompts the README mentions. May embed/reuse the existing `twf lsp` machinery for push diagnostics.

**Open questions:** Minimum-viable first cut (diagnostics + spec + the core verbs) vs full surface (incl. skill prompts)? Should it run the LSP internally for `publishDiagnostics` caching, or compute on demand per tool call? Tool naming/namespacing convention? Where does the MCP server's code live — `cmd/twf/mcp.go` alongside `lsp.go`, or its own package?

**Note:** Independent of when this is built, the packaging already promises it — worth either implementing or softening the README/marketplace claims so the advertised contract matches reality.
