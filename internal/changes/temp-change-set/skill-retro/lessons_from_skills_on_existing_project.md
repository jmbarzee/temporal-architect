# Reflection: temporal-design skill

**Skill:** `skills/temporal-design/SKILL.md`
**Scope:** Reverse-engineering 10 Go workflow/activity domains into `.twf` files for a proto-generated (PFI) Temporal codebase
**Cases explored:** Off-script worked better, Assuming X, Don't know what I don't know, Hard tradeoff
**Sub-agents dispatched:** 0 (context budget exhausted; self-assessment substituted — see note at bottom)

---

## Self-Assessment

This was a reverse-engineering task, not a design task. The skill was written for
the design direction (human description → TWF). Almost everything in the core loop
("orient → write TWF → twf check → fix → design review") required adaptation for the
reverse direction (code → TWF). The skill was largely silent on that adaptation.

What went well: the TWF grammar itself held up. `twf check` was a fast feedback loop.
The activity-body pseudocode convention was well-matched to the task.

What required improvisation — and where the skill gaps live:

---

## Reconciled Observations

### 1. Go Proto Plugins (PFI Pattern) — Hardest Gap

**What happened:** The codebase uses generated Go code from `.proto` files via
`buf generate`. This produces constructor+Execute workflow patterns, generated
activity name constants (`vaultpb.CreatePolicyActivityName`), and generated Nexus
client helpers (`fabricv1nexustemporal.NewFabricNexusClient`). None of these patterns
appear in the skill or its references.

**The specific friction:**
- "Where is the workflow's input type?" requires reading the constructor function
  signature (`func (w *Workflows) BootstrapShard(ctx, input *pb.BootstrapShardWorkflowInput)`),
  not the Execute signature (which takes only `ctx`).
- Activity calls appear as both `workflow.ExecuteActivity(ctx, vaultpb.CreatePolicyActivityName, input)`
  AND as generated typed helpers `temporalpb.CreateNexusEndpoint(ctx, input)`. Both
  must be treated as `activity Name(...)` in TWF. The skill has no guidance for this.
- Nexus service exposure is declared in proto via `tags: "nexus-enabled"` and operation
  exclusion via `tags: "activity"`. The connection between proto annotation and TWF
  `nexus service` definition is completely undocumented.
- The reverse task required understanding PFI in order to know WHAT to put in TWF —
  specifically, whether an RPC was a workflow, activity, or neither.

**Structural cause:** The skill assumes the designer is starting from an informal
description. PFI is a formal, generated source. The skill's "orient" step says to
look for existing `.twf` files and design docs. In a PFI codebase, the proto files
ARE the source of truth and require a different reading strategy.

**Generative change:** The skill should add a section or reference:
> "In proto-first codebases (PFI), the proto file is the source of truth. Each RPC
> annotated `temporal.v1.workflow` maps to a TWF `workflow`. Each annotated
> `temporal.v1.activity` maps to a TWF `activity`. Constructor+Execute Go patterns,
> generated activity name constants, and generated Nexus client helpers are all just
> call sites — treat them as activity/workflow/nexus calls in TWF. The `nexus service`
> definition corresponds to an RPC service annotated `nexus-enabled` in proto."

---

### 2. .twf Files Distributed Throughout Packages — Structural Mismatch

**What happened:** The task asked for one `.twf` per domain, co-located with the Go
implementation. This produced 10 files across 10 different packages. Each file needed
to be self-contained enough to pass `twf check`, which required:
- Reproducing cross-domain activity definitions as local stubs (e.g. `CreatePassword`
  appears in both `secrets.twf` and `fabric.twf`)
- Reproducing cross-domain workflow stubs (`CreateDeployment` in `fabric.twf`)
- Defining forward-reference nexus service stubs (`nexus service Secrets` in `fabric.twf`,
  `nexus service Fabric` in `cell.twf`) with stub workflows to satisfy the resolver

This is not a flaw in the placement decision — it's the only sane placement given the
codebase structure. But TWF has no `import` or `package` syntax. The result is:
- Duplication of definitions across files (every cross-domain call requires a local stub)
- The stubs are implementation stubs, not just type stubs — the validator checks them
- When the real definition evolves, stubs in consumer files must be updated manually

**Structural cause:** TWF was designed for single-file or multi-file whole-program
checking (checked together), not for per-package partial files. The `twf check`
resolver has two modes: "no services defined — may be external" (warning) and
"service is defined somewhere in this file set" (strict). This creates a sharp cliff:
once you define ANY nexus service in a file, ALL service references become strict.

**Generative change:**
- Short-term (skill): document the stub strategy explicitly. "In multi-package
  codebases, reproduce cross-domain activity/workflow stubs in consumer files for
  resolution. Mark them with a standard comment (`# cross-domain stub — defined in X.twf`)."
- Medium-term (tool): TWF should add an `import` or `extern` declaration for
  cross-file resolution without requiring full stub bodies.

---

### 3. Reverse Engineering Application Code → TWF — Skill Blindspot

**What happened:** The skill's design flow is linear: description → draft → check.
Reverse engineering is a reading task first, then a mapping task. The skill provides
no guidance on:
- How to read Go workflow bodies to extract TWF orchestration (what counts as a
  workflow call vs. a raw SDK call vs. a helper function?)
- How to identify which activities are cross-domain (registered elsewhere, called here)
- How to handle "stub" implementations (no body, no logic) — the skill mentions these
  in the task spec but the skill itself doesn't address intent-filling for stubs
- How to represent hardcoded constants (peer IDs ["peer0","peer1","peer2"]) as design
  intent (input fields) vs. implementation detail

**Language-specific friction (Go):**
- Go's error wrapping pattern (`if err != nil { return nil, fmt.Errorf(...) }`) appears
  after every activity call and adds noise when reading for orchestration logic
- `workflow.WithActivityOptions(ctx, options)` creates new contexts that carry options —
  the options apply to ALL subsequent calls in that context, not just the next one.
  This is easy to misread when mapping to per-call `options:` blocks in TWF.
- `errgroup` / `workflow.Go` patterns (parallel fan-out) look like sequential Go code
  until you spot the goroutine launch. The exploration agent correctly identified
  "no parallel fan-out" in this codebase, but a less careful reading could miss it.

**Generative changes:**
- Add a "Reverse Engineering" section to SKILL.md with:
  - Reading strategy: focus on the Execute() body; ignore error handling, context
    plumbing, and options setup; look for ExecuteActivity/ExecuteChildWorkflow/
    Nexus client calls
  - Stub handling: "When a workflow body is empty, represent the design intent from
    proto comments and domain knowledge. Mark with `# stub — design intent`."
  - Parallel detection: "Look for `workflow.Go`, `errgroup`, or goroutine launches
    to identify parallel fan-out."
- Add Go-specific guidance (or a separate file `reverse-engineering-go.md`):
  - The constructor+Execute split
  - `workflow.WithActivityOptions` context scope
  - Generated name constants as activity identifiers
  - `*Child` helpers as child workflow calls
  - `*NexusClient` helpers as nexus calls

---

### 4. Parser Binary — Ease of Use

**What went well:**
- `twf check` was fast and its error messages were specific: line/col, error code, and
  a human-readable explanation. This made iteration tight.
- `twf symbols` gave a clean inventory that validated completeness.
- `twf spec <slug>` was extremely useful for understanding grammar nuances during
  implementation (especially `statement-syntax`, `grammar-summary`, `tokens-and-keywords`).

**What was hard:**
- **Discovery:** The binary was not on PATH. It was installed as a VS Code/Cursor
  extension (`jmbarzee.twf-syntax-0.8.1`) in `~/.cursor-server/extensions/`. The
  skill says "run `twf check`" but gives no installation guidance. A `find` command
  was required to locate it. This is a friction point every session.
- **Strict vs. warning mode — undocumented cliff:** The transition from
  `NEXUS_UNRESOLVED_*` (warning, exit 0) to `NEXUS_UNDEFINED_*` (error, exit 1)
  depends on whether ANY nexus service is defined in the file. This is a significant
  behavioral discontinuity that required empirical testing to discover. The spec does
  not document it. The skill does not document it.
- **Function calls inside struct constructors in activity args:** This produced
  `DEDENT at top level` parse errors with no useful diagnostic pointing to the actual
  cause. The rule (no nested function calls inside struct constructor field values in
  activity/workflow call argument positions) was only discoverable by bisection. This
  should be documented in `common-errors.md`.
- **`--lenient` flag doesn't suppress validation errors:** Only parse errors are
  tolerated. Validation errors (`ENDPOINT_SERVICE_LINKAGE`, `IMPLICIT_ROUTING_MISMATCH`)
  remain errors even with `--lenient`. The skill implies `--lenient` is for "incomplete
  designs" but doesn't clarify what class of errors it suppresses.

**Generative changes:**
- Add to SKILL.md: "The `twf` binary ships as a Cursor/VS Code extension. If not on
  PATH, find it at `~/.cursor-server/extensions/jmbarzee.twf-syntax-*/bin/twf`."
- Add to `common-errors.md`:
  1. "Function calls inside struct constructors in activity/workflow call args produce
     confusing `DEDENT at top level` errors. Fix: assign the struct to a variable first."
  2. "The nexus resolution mode changes from warning to error when ANY nexus service
     is defined in the file. If calling an external service, either define the service
     as a stub in the same file, or ensure no services are defined and accept warnings."
- Add to `notation-reference.md` or options table: clarify `--lenient` scope.

---

## Intentional Tradeoffs (that the skill should document)

1. **One .twf per package vs. one .twf for the whole system:** We chose per-package
   for co-location with code. A single topology file would validate cleanly but would
   be divorced from the code it describes. The skill should document both patterns and
   their tradeoffs.

2. **Cross-domain activity stubs vs. omitting them:** We reproduced stubs so
   `IMPLICIT_ROUTING_MISMATCH` errors were resolved and `twf check` was clean. The
   alternative (omit stubs, accept routing errors) would have been cleaner files but
   with persistent errors. Skill should document the tradeoff.

3. **Design-intent activities for stubs (channel workflows):** We added proto-future
   activities (`FetchChannelConfig`, `JoinOrdererChannel`) that don't exist yet. This
   is design intent, not PFI alignment. The skill should explicitly authorize this for
   stub workflows, separate from the PFI constraint (which applies to implemented code).

---

## Note on Sub-Agent Phase

With <10% context budget, Phase 2 sub-agents were not dispatched. The observations
above are drawn entirely from the executing agent's live experience during the task —
which is unusually high-fidelity for this phase since the gap between intention and
outcome was experienced directly. The baseline agent (isolated, no context) was not
run; a future reflection on a fresh session should run it to surface blind spots
in this document.