# Reposition Prompt

Use this to execute the repositioning. Pair it with the findings in
[`SURVEY.md`](./SURVEY.md) (same folder) — that doc has the per-surface
inventory, the message house, and the sequencing.

---

Read `internal/changes/temp-change-set/reposition/SURVEY.md` first. Then
reposition `temporal-architect` across its storefront and docs.

**Goal:** finish the rebrand by (1) dropping "DSL" as the lead noun, (2)
raising the pitch from "for Temporal workflows" to **designing entire Temporal
systems/ecosystems** (namespaces, workers, Nexus, deployment topology, infra),
and (3) gently distancing from the official Temporal skills — lead with our
differentiators (parseable `.twf` source of truth, visualizer, deterministic
`twf` harness, system-scale scope). Never name or knock the official skills.
Pull the vision from `AGENTS.md`'s North Star; it already exists, just surface it.

**Do, in this order (SURVEY § "Suggested sequencing"):**
1. `README.md` — new tagline + vision paragraph + Skills section (add the third
   skill, `author-infra`; refresh "Planned"). Everything inherits from here.
2. `packages/vscode/{package.json,README.md}` — description/displayName/keywords;
   retitle the "Install Temporal Skills" command; demote `"dsl"`.
3. Claude plugin: `.claude-plugin/marketplace.json` +
   `packages/npm/claude-plugin/{package.json,README.md}` — fix skills framing
   and the two-vs-three skill count.
4. Descriptions/keywords: `packages/npm/twf`, `packages/pypi/twf-cli`,
   `tools/visualizer` (package.json + README — drop "AST" speak).
5. `AGENTS.md` line 3, `examples/README.md`, `tools/visualizer/spec/PRODUCT.md`
   — align the noun.
6. Pre-publish: audit `desc`/`homepage` in `internal/release/bump-brew/main.go`.
7. Doc drift: surface `author-infra` everywhere; reconcile
   `publishing_setup.md:85`.

**Do NOT touch:** `.twf` extension, binary name `twf`, any registry
*identifiers* (npm scope, PyPI name, VSIX extension ID), the `temporal-skills`
LEGACY cleanup constant, or "DSL/grammar/language" inside `tools/spec/**` and
parser code (correct there). See SURVEY § 3.1 for the change-vs-leave table.

**Screenshots:** I'll capture them. Leave `[SCREENSHOT: …]` placeholders where
SURVEY's shot list (S1–S6) says, and point image paths at `docs/images/`
(and `packages/vscode/images/` for VSIX-bundled ones).

Show me the README tagline + vision paragraph rewrite for approval before
fanning out to the other surfaces.
