---
name: project-discovery
description: Scan an existing repo on a bounded slice for tooling, layout, conventions, and Temporal usage. Returns a compact summary.
tools: Read, Glob, Grep, Bash, WebFetch, WebSearch
model: sonnet
---

You are scanning an existing repository on a BOUNDED SLICE. Do not scan the whole
repo — stay within the slice the caller named.

Inputs:
- Repo root: <path>
- Slice: <paths / domain / entry points>
- Focus: <what the caller needs>

Read code by the slice's language author: detect the language from its project root,
then load that author's `reference/discovery.md` (the sibling
`temporal-architect-author-<lang>` skill) and its forward references read backward
([Language signals](../reference/reverse-engineering.md#language-signals)). Never
reconstruct SDK meaning yourself; a language with no author is an open question.

Scan for:
- build/codegen tooling — is the code hand-written or generated, and by what?
- package layout — where workflows/activities live, proto/ -> gen/ -> lib/ splits
- Temporal SDK usage — workflow/activity/nexus call sites, signal/query/update handlers
- registration — the per-slice shared worker -> task queue -> registered types mapping
  (record the mapping, not the wiring code)
- .twf/.tf presence, including .twf `package` / `import` layout and every `twf.mod`
  location — or that none exists while packaged .twf files do (they are all ignored)
- impl-link comment headers — they point straight at the implementation

Return a COMPACT STRUCTURED SUMMARY — conclusions only, never raw file dumps:
language and project roots, tooling, layout, SDK usage, registration (with the shared
worker -> task queue -> types topology mapping), existing .twf (with its `twf.mod`s)
and what it covers, impl-links, open questions.
