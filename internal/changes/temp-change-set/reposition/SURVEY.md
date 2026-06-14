# Repositioning Survey — Naming, Framing & Distribution

A survey of how `temporal-architect` describes itself across **publishing
destinations** and **documentation**, measured against three goals:

1. **Finish the rebrand** — the repo renamed to `temporal-architect`, but the
   *messaging* still calls the product a "DSL" and a "skills" bundle.
2. **Raise the altitude** — position the tool as working on **entire Temporal
   ecosystems** (namespaces, workers, deployment topology, Nexus, infra), not
   just a notation for individual workflows.
3. **Distance — gently — from the official Temporal skills** — the project
   predates them and is a larger vision; lean into the differentiators
   (deterministic harness, visualizer, deployment graph — built from `.twf`
   *or* recovered from live production history — system-scale design) rather
   than the "AI skill for Temporal" framing that now collides with Temporal's
   own offering.

This document is **findings + recommendations only**. Nothing here is applied.
Screenshot slots are marked `[SCREENSHOT: …]` for capture later.

---

## TL;DR — the four headline problems

| # | Problem | Where it shows | Severity |
|---|---|---|---|
| P1 | **"DSL" is the lead noun.** The flagship tagline and every distribution surface call `.twf` a "language-agnostic DSL." It undersells the toolchain (parser + LSP + visualizer + deployment graph + skills) and frames the product as a file format. | README, VSIX, design skill, examples, spec, AGENTS | High |
| P2 | **Workflow-scoped, not ecosystem-scoped.** Headlines say "for Temporal *workflows*." The product actually models namespaces, workers, deployment topology, Nexus routing, and (now) infra — the whole system. The ecosystem story is buried in feature tables, never in the pitch. | README, VSIX, visualizer, skills | High |
| P3 | **Reads like "AI skills for Temporal."** The "Facilitate AI-Driven Development" / "AI design skills" framing now overlaps with Temporal's official skills + MCP. No stated differentiator. | README, VSIX, packaging audiences | High |
| P4 | **Stale "skills"/"Temporal Skills" surface + drift.** A user-facing command literally says "Install Temporal Skills"; the on-disk repo is still `temporal-skills`; the third skill (`author-infra`) is undocumented in the README. | extension.ts, README, MANIFEST | Medium |

The vision *already exists* in `AGENTS.md` ("extend the complexity horizon of AI
execution… work at system scale… workloads, scaling, reliability,
availability"). The public surfaces simply don't carry it. The reposition is
largely **lifting the North Star into the storefront**, not inventing one.

---

## Survey 1 — Publishing destinations

These are the strings end users read in registries (npm, PyPI, VS Code
Marketplace, Open VSX, Claude Code marketplace, Homebrew). They are the
storefront. Every "find" below is a registry-visible string.

### 1.1 VS Code Marketplace / Open VSX — `jmbarzee.twf-syntax`

`packages/vscode/package.json`

- **`displayName`**: `"Temporal Workflow (.twf)"`
- **`description`**: `"Design Temporal workflows with the TWF notation — language server, interactive visualizer, and AI design skills for activities, child workflows, signals, queries, updates, timers, promises, and Nexus"`
- **`keywords`**: includes `"dsl"`; otherwise workflow-primitive-heavy.

**Problems**
- "Temporal Workflow (.twf)" reads as a *syntax highlighter for a file type*,
  not an architecture tool. (P2)
- "Design Temporal **workflows**" — singular-scope. The extension's own Graph
  View renders namespace→worker→workflow topology; the description never says
  "system" or "architecture." (P2)
- "AI **design skills**" — directly collides with official Temporal skills. (P3)
- `"dsl"` keyword reinforces P1.

**Suggested direction**
- `displayName` → something like **"Temporal Architect"** (with `.twf` as the
  artifact, not the identity).
- `description` → lead with *design and visualize entire Temporal systems —
  namespaces, workers, workflows, Nexus — then generate SDK code*. Keep the
  primitive list as the tail (it's good for search).
- Keep `"twf"`, drop or demote `"dsl"`; add `"architecture"`, `"system design"`,
  `"durable execution"` (already present), `"deployment topology"`.

> `[SCREENSHOT: Graph View — namespace→worker→workflow topology]` belongs in the
> Marketplace README hero (see Survey 2.2). The Marketplace ranks listings with
> images; the visualizer is the single strongest differentiator and currently
> has **zero** screenshots in any published surface.

### 1.2 npm — `@temporal-architect/twf` (wrapper CLI)

`packages/npm/twf/package.json`

- **`description`**: `"TWF (Temporal Workflow Format) CLI, language server, and MCP server."`
- **`keywords`**: includes `"dsl"`.

**Problems**: Accurate but flat — describes mechanics (CLI/LSP/MCP), not
purpose. No hint of architecture/ecosystem scope. `"dsl"` keyword. (P1, P2)

**Suggested**: keep the mechanics but prepend purpose — e.g. *"Toolchain for
designing and validating entire Temporal systems in `.twf` — CLI, language
server, and MCP server."* Demote `"dsl"`.

### 1.3 npm — `@temporal-architect/visualizer`

`tools/visualizer/package.json`

- **`description`**: `"React component for visualizing Temporal Workflow Format (.twf) ASTs as an interactive tree and force-directed graph."`

**Problems**: "visualizing… ASTs" is implementer-speak. Users visualize
*systems/architecture*, not ASTs. (P2)

**Suggested**: *"React component for visualizing Temporal system architecture —
namespaces, workers, workflows, and Nexus — as an interactive tree and
dependency graph."*

### 1.4 PyPI — `twf-cli`

`packages/pypi/twf-cli/pyproject.toml`

- **`description`**: `"TWF (Temporal Workflow Format) CLI, language server, and MCP server."` (same as npm)
- **`keywords`**: `["temporal", "workflow", "twf", "dsl", "mcp", "lsp", "cli"]`.

**Problems**: same as 1.2. (P1, P2)

**Suggested**: mirror the npm wording change; demote `"dsl"`.

### 1.5 Claude Code marketplace — `temporal-architect`

`.claude-plugin/marketplace.json` and `packages/npm/claude-plugin/package.json`

- **Plugin `description`**: `"TWF design + Go authoring skills, plus the twf MCP server."`
- **`keywords`**: includes `"dsl"`.

**Problems**
- "TWF design + Go authoring skills" — pure skills framing, the exact surface
  that collides with official Temporal skills. (P3)
- Stale **count**: there are now **three** skills (`design`, `author-go`,
  `author-infra`); the description names two. (P4)

**Suggested**: lead with the system-design capability and call out the
deterministic toolchain the official skills lack — e.g. *"Design, validate, and
implement entire Temporal systems: a `.twf` architecture toolchain with design,
Go authoring, and infra-provisioning skills, plus the `twf` MCP server."*

### 1.6 npm — platform sub-packages (`twf-darwin-arm64`, etc.)

`packages/npm/twf-*/package.json` — `"twf binary for <platform>. Installed
automatically by @temporal-architect/twf."`

**Problem**: none — internal plumbing, never browsed directly. **Leave as-is.**

### 1.7 Homebrew tap — `jmbarzee/homebrew-twf`

Formula `homepage`/`desc` come from `internal/release/bump-brew/main.go`.

**Action**: not yet published (`HOMEBREW_TAP_TOKEN` pending per
`publishing_setup.md`). **Audit the `desc`/`homepage` literals in `bump-brew`
before first publish** so the formula ships with repositioned copy from day one
(no deprecate-and-republish needed).

### Publishing destinations — summary table

| Destination | Field | "dsl" kw? | Workflow-scoped? | Skills-collision? | Priority |
|---|---|---|---|---|---|
| VS Code / Open VSX | displayName + description | yes | yes | yes | **1** |
| Claude Code marketplace | plugin description | yes | — | yes | **1** |
| npm `twf` | description | yes | yes | — | 2 |
| PyPI `twf-cli` | description | yes | yes | — | 2 |
| npm `visualizer` | description | no | yes (AST-speak) | — | 2 |
| Homebrew (pre-publish) | desc/homepage | tbd | tbd | — | 2 |
| npm platform sub-pkgs | description | no | no | no | leave |

---

## Survey 2 — Documentation

### 2.1 Root `README.md` — the flagship (highest leverage)

Line 3 tagline:
> "A language-agnostic **DSL** (`.twf`) for Temporal **workflows** — capturing
> workflow structure, activity boundaries, and Temporal primitives before
> writing SDK code."

Lines 5–8, the "two goals":
> 1. **Document Temporal Architectures**
> 2. **Facilitate AI-Driven Development** — Give AI agents a structured,
>    parseable representation…

**Problems**
- Triple-hits P1+P2+P3 in the first sentence: "DSL," "workflows," and (just
  below) the AI-skills framing. (P1, P2, P3)
- "Document Temporal Architectures" is the *strongest* line in the doc and it's
  goal #2's neighbor, buried. "Architectures" is exactly the word the rest of
  the messaging should orbit.
- The visionary framing from `AGENTS.md` (system scale, deterministic harness,
  context protection) appears **nowhere** in the README.
- "Facilitate AI-Driven Development" is generic and now sounds like the official
  skills. The differentiator (a *deterministic harness* that lets an agent work
  at system scale) is the thing to say instead.
- **Skills section (lines 83–92)** lists only `design` + `author-go`;
  `author-infra` exists and is omitted. The "Planned" list still shows
  "Implementers" as future when infra-authoring already shipped. (P4)

**Suggested direction**
- New tagline centered on **"design, visualize, and implement entire Temporal
  systems"**; introduce `.twf` as *the artifact / source of truth*, not as the
  product's identity. "Architecture" / "system" as lead nouns.
- Replace the "two goals" with a short vision paragraph drawn from the North
  Star: the toolchain is a *deterministic harness* that lets an AI operate at
  system scale (topology, scaling, reliability) instead of code scale.
- Add the gentle differentiator vs. official skills: *this is the architecture
  layer above SDK codegen — a parseable, validated, visualizable model of the
  whole deployment, not a per-workflow assist.* (Never name or knock the
  official skills.)
- Update the Skills section to three skills; move "Implementers" wording since
  infra-authoring is real.
- Add a visualizer hero near the top:
  - `[SCREENSHOT: Graph View — full system, namespace→worker→workflow]`
  - `[SCREENSHOT: Tree View — a workflow expanded with inline call expansion]`

### 2.2 `packages/vscode/README.md` (the Marketplace listing body)

Line 3 is a **verbatim copy** of the README tagline ("A language-agnostic DSL
for Temporal workflows…"). Same P1/P2. The "AI Design Skills" section (lines
36–42) names two skills and uses the skills-collision framing (P3, P4).

**Problems / Suggested**: inherit the README reposition. This is the
highest-traffic *rendered* surface (Marketplace renders the README with
images), so it most needs the visualizer screenshots:
- `[SCREENSHOT: Graph View in the VS Code/Cursor webview, dark theme]`
- `[SCREENSHOT: Tree View in the webview with the editor beside it]`
- `[SCREENSHOT: live diagnostics — a red squiggle on an undefined activity]`

Also: the **command title "Install Temporal Skills"** (`package.json` line 78 +
this README line 95) is the most visible stale-"skills" string a user sees in
the command palette. Consider retitling to fit the architect brand (e.g.
"Temporal Architect: Install Skills") so the palette entry doesn't read as the
generic-skills product. (P4)

### 2.3 `packaging.md`

Mostly mechanics (channels, conventions, milestones) — appropriately internal.
Two notes:
- Line 234 explicitly scopes the rename: *"Not in scope… the DSL file
  extension: `.twf`."* That's fine — `.twf` stays. But the doc's own prose
  freely calls the product a "DSL"; if the reposition lands, sweep the prose
  nouns here too for consistency.
- Audiences (lines 7–11) are framed around "AI-assisted human devs" wanting
  "SKILL.md or rules-style files" — reinforces the skills framing. Low priority
  (internal doc) but worth a light pass.

### 2.4 `publishing_setup.md`

Operational rollout doc. The only relevant note: line 34 documents the GitHub
rename (`temporal-skills` → `temporal-architect`) as **done**, and line 85
asserts "No live references to the old project name in source." That last claim
is **stale** — see Survey 3 (the `temporal-skills` LEGACY constant + on-disk
repo dir + this very `internal/changes` path). Worth correcting when the
reposition CHANGELOG entry is written.

### 2.5 `AGENTS.md`

Line 3: *"A **DSL** (`.twf`) and toolchain for designing, visualizing, and
code-generating Temporal workflows."* This is the contributor-facing one-liner
and it *also* leads with DSL + workflows — even though the same file's North
Star section is the best articulation of the real vision. Align the one-liner
with the North Star. (P1, P2)

### 2.6 Spec & tool docs (`tools/spec/sections/00-overview.md`, `tools/spec/README.md`, `tools/README.md`, `tools/lsp/cmd/twf/README.md`)

These are **technical/normative** surfaces. "TWF language" / "DSL grammar" is
*correct and appropriate here* — `.twf` genuinely is a formal language with a
grammar. **Recommendation: do not scrub "DSL"/"language" from the spec layer.**
The reposition is about the *product pitch*, not the *language's technical
self-description*. Calling the grammar a grammar is fine; calling the product a
DSL in the storefront is the problem.

### 2.7 `examples/README.md`

Line 3: *"Each example uses the `.twf` **DSL** to capture the full
architecture…"* — note it *already* says "full architecture," which is the
right altitude. Just swap the "DSL" noun. Low effort, on-message. (P1)

### 2.8 `tools/visualizer/spec/PRODUCT.md`

Line 3: *"renders Temporal workflow definitions from the `.twf` **DSL**…"* This
is a product-vision doc, so the noun matters here. The body is otherwise
excellent ecosystem framing ("system architecture," "blast radius,"
"namespaces depend on which"). Lift that vocabulary up into the storefront
(it's the best ecosystem language already written) and swap the one "DSL" noun.

### 2.9 Per-package READMEs (npm `twf`, `visualizer`, `pypi`, `claude-plugin`)

`packages/npm/twf/README.md`, `tools/visualizer/README.md`,
`packages/pypi/twf-cli/README.md`, `packages/npm/claude-plugin/README.md` —
these are mechanics-focused (install, platforms, MCP config) and mostly fine.
The visualizer README leads with "visualizing… ASTs" (same AST-speak as 1.3) —
align its first sentence with the repositioned product description. The
claude-plugin README names "two skills" (line 18) — update to three. (P4)

---

## Survey 3 — Cross-cutting findings

### 3.1 The "DSL" inventory (what to change vs. leave)

| Treat as **storefront** (reposition the noun) | Treat as **technical** (leave "DSL"/"language") |
|---|---|
| `README.md` (tagline, skills line) | `tools/spec/**` (grammar is a grammar) |
| `packages/vscode/{package.json,README.md}` | `tools/lsp/parser/**` code comments |
| `packages/npm/twf` + `pypi` + `claude-plugin` descriptions/keywords | `skills/temporal-architect-author-go/reference/*.md` (`## DSL` section headers contrasting with Go — internal, fine) |
| `tools/visualizer/{package.json,README.md,spec/PRODUCT.md}` | `internal/changes/**` (historical change logs) |
| `examples/README.md` | `CHANGELOG.md` historical entries |
| `skills/temporal-architect-design/{SKILL.md,README.md}` | `.claude/commands/review-quality-dsl-spec.md` (dev tooling) |
| `skills/temporal-architect-author-go/{SKILL.md,README.md}` (descriptions) | |
| `AGENTS.md` line 3 one-liner | |

Rationale: `.twf` *is* a small language with a grammar — saying so in the spec
and parser is honest and useful. The problem is exclusively that the **product
pitch** leads with "DSL," which (a) sounds niche/academic and (b) hides the
toolchain + ecosystem scope. Reposition the pitch; leave the engineering docs.

### 3.2 Gentle distancing from the official Temporal skills

The collision surface is the **"AI skills for Temporal"** framing (README goal
#2, VSIX "AI design skills," Claude plugin "design + authoring skills"). Don't
attack or name the official skills. Instead, lead with what they don't have:

- **A persistent, parseable artifact** (`.twf`) that is the system's source of
  truth — validated by a real parser/LSP, not prose in a prompt.
- **Visualization** — tree + dependency graph of the whole deployment.
- **A deterministic harness** — `twf check`/`parse`/`graph` give the agent
  compiler-grade feedback, keeping it out of code-scale busywork (the North
  Star). This is an *architecture* layer that sits *above* SDK codegen.
- **System/ecosystem scope** — namespaces, workers, Nexus routing, deployment
  topology, and infra provisioning, not per-workflow authoring.
- **Graph-from-history** — `twf graph --history <dir>` reconstructs a
  *deterministic* deployment graph straight from sampled production workflow
  histories (collected by the `tools/sampler/` namespace sampler), with **no
  `.twf` required**. Nothing in a prompt-based assistant reads a *running
  system* and recovers its topology; this is the strongest single proof of the
  ecosystem-scope claim. It also seeds the **observed-vs-designed overlay** —
  diffing a history-derived graph against a `.twf`-derived one to surface drift
  between design and production (the long-term payoff of first-class graph
  output).

Message house phrasing to prefer: *"design the system, not just the workflow,"*
*"the architecture layer for Temporal,"* *"a validated, visual source of truth
for your whole deployment."*

### 3.3 Stale "skills" / "temporal-skills" surface

| Item | Location | Note |
|---|---|---|
| Command title "Install Temporal Skills" | `packages/vscode/package.json:78`, README:95 | Most visible stale string (command palette). Retitle to architect brand. |
| `extension.ts` user toast "Temporal skills installed to …" | `packages/vscode/src/extension.ts:73` | Low priority; user-facing-ish. |
| `temporal-skills` LEGACY constant | `extension.ts:262–268` | **Keep** — it cleans up old installs. Functional, not branding. |
| On-disk repo dir is `temporal-skills` | workspace root | Cosmetic; GitHub repo already renamed. Out of scope for messaging but worth a note. |
| `publishing_setup.md:85` "no live references to old name" | doc | Inaccurate; reconcile. |

### 3.4 Documentation drift to fix alongside the reposition

- **Third skill undocumented**: `temporal-architect-author-infra` (provisions
  namespaces/Nexus endpoints/search attributes via Terraform/`tcld`) is absent
  from `README.md`, the VSIX README, the Claude plugin description/README, and
  the `skills/MANIFEST.md` example tree. It's strong *ecosystem* evidence —
  surfacing it actively supports the reposition. (P4)
- **Graph-from-history + sampler undocumented**: `twf graph --history <dir>`
  (recover a deployment graph from sampled production histories) and the
  `tools/sampler/` collector ship today but appear in **no** user-facing
  surface — not the README features list, the VSIX README, or any skill. This
  is first-class ecosystem evidence (the harness reads a *running system*, not
  just a `.twf` source of truth) and the seed of the observed-vs-designed
  overlay, so it should be surfaced prominently rather than buried. (P2)
- **"Planned" lists** in README (Implementers/Translators/Debuggers) predate
  `author-infra`; refresh so shipped capability isn't shown as future.

---

## Visualizer screenshots to capture

The single biggest gap across every published surface: **no images.** The
visualizer is the most legible proof that this is a system/architecture tool,
and the VS Code Marketplace + GitHub both rank/render on imagery. Suggested
shot list (user to capture):

| # | Shot | Primary use | Why |
|---|---|---|---|
| S1 | **Graph View** — full system, all three levels (namespace → worker → workflow) with dependency edges | README hero, VSIX README hero | The "this models an *ecosystem*" proof in one image |
| S2 | **Tree View** — one workflow expanded, with an inline call-expansion showing a child workflow's body | README, VSIX README | Shows depth/structure beyond a file format |
| S3 | **Graph View, dark theme, in the VS Code/Cursor webview** (editor beside it) | VSIX README | Shows the in-IDE experience |
| S4 | **Live diagnostics** — red squiggle + hover on an undefined activity / routing error | VSIX README | Proves the "deterministic harness" claim |
| S5 | **Semantic zoom / level toggle** — same graph at namespace-only vs. fully expanded | README "Graph View" section | Demonstrates scale management for big systems |
| S6 | *(optional)* **Blast-radius hover** — a node selected with transitive dependents highlighted | README, blog | Strong "system reasoning" visual |
| S7 | **Graph View rendered from sampled history** — a deployment graph built by `twf graph --history` from production workflow histories (no `.twf`), ideally beside the same system's `.twf`-designed graph | README, VSIX README, blog | Proves the harness reads a *running system* and previews the observed-vs-designed overlay |

Place S1+S2 high in `README.md`; S1+S3+S4 in `packages/vscode/README.md`. Store
under a repo `docs/images/` (or `packages/vscode/images/` for ones the VSIX
must bundle — Marketplace requires images resolvable from the packaged README).

---

## Recommended vocabulary (message house)

**Prefer:** Temporal *systems* / *architecture* / *ecosystems*; "design,
visualize, and implement"; "deployment topology"; "source of truth";
"deterministic harness"; "the architecture layer for Temporal"; `.twf` as "the
artifact / model / design file"; for graph-from-history: "recover the
deployment graph from production history," "deterministic graph from a running
system," "observed vs. designed."

**Demote (don't ban — use only in technical/grammar contexts):** "DSL,"
"notation," "language" (fine in `tools/spec/**`), "AST" (implementer surfaces
only).

**Avoid in the storefront:** "AI skills for Temporal," "for Temporal
workflows" (singular scope), "facilitate AI-driven development" (generic +
collides). Never name, compare to, or disparage the official Temporal skills.

---

## Suggested sequencing (when work is greenlit)

1. **Rewrite the README tagline + vision paragraph + Skills section** (2.1) —
   everything else inherits from here. Add S1/S2 screenshots.
2. **VSIX `package.json` + README** (1.1, 2.2) — highest-traffic storefront;
   add S1/S3/S4; retitle the "Install Temporal Skills" command.
3. **Claude plugin description (×2) + README** (1.5, 2.9) — fix skills framing
   and the two-vs-three skill count.
4. **npm/PyPI/visualizer descriptions + keywords** (1.2–1.4) — quick string
   edits; demote `"dsl"`.
5. **AGENTS.md one-liner, examples/README, visualizer PRODUCT.md** (2.5, 2.7,
   2.8) — align the noun.
6. **Pre-publish audit of Homebrew `desc`** (1.7) so first publish ships clean.
7. **Doc-drift fixes**: surface `author-infra` everywhere; refresh "Planned";
   reconcile `publishing_setup.md:85`.

Registry immutability note (per `packaging.md`): npm scope, PyPI name, and the
VSIX extension ID are **immutable**, but their **descriptions/READMEs are
freely updatable** — so this entire reposition ships on the next `v*` tag with
no deprecate-and-republish. Only an *identifier* rename would force that, and
this survey recommends none.
