# Harness (Entry-Point) Skill Revisions

**Source:** skill-retro planning session
(`internal/changes/temp-change-set/skill-retro/lessons_from_skills_plan.md`, Stage 4 / item E0).
**New skill.** Ships as **`temporal-architect`** (bare brand = umbrella front-door). *Capstone.*

## Summary

The shipped product is a skill **set** with no always-on user-side AGENTS file, so the only
"always-on" mechanism is an **entry-point skill whose `description` makes it load first**. This skill
is that front door: it carries the North Star, selects a flow from project-state + user-request, and
orchestrates the specialists (`temporal-architect-design`, `-author-go`, `-author-infra`) — using the
graph-tree tooling to decompose work at contract boundaries. It also **pulls the routing/Handoff logic
out of `design`**, shrinking design back to "produce/review `.twf`".

**Gated on:** Stage 1–2 skills existing (`design-skill/REVISIONS_002`, `author-go-skill/REVISIONS_001`,
`author-infra-skill/REVISIONS_001`) and ideally Stage 3 graph-tree tooling (`parser/REVISIONS_002` G1).

## Group 1: Skill skeleton + entry-point description + North Star

**Files touched:** `skills/temporal-architect/SKILL.md` (new).
**Change type:** `Internal`
**Parallelism:** Group 5 (design trim) can proceed once this lands.

**Specific changes:**
1. `description` written as the broad de-facto entry trigger ("designing, building, adopting, or
   evolving Temporal systems — start here").
2. Body carries the **North Star** (system-scale not code-scale; deterministic harness; keep AI out of
   the weeds) — this is the user-facing home for the philosophy.

## Group 2: Flow selection (project-state × user-request)

**Specific changes:**
1. Triage flows: **greenfield design** (→ design), **adopt existing** (→ reverse path + authors),
   **implement** (→ authors + infra), **evolve/drift** (→ design drift + authors). Selection keyed on
   project state (detected) + user request.

## Group 3: Contract-boundary decomposition + dispatch

**Findings:**
- Decompose at contract boundaries (`.twf` *is* the contract), **never finer**: coarsest = per
  language; within a language = per **workflow-tree** (from `twf graph trees`, `parser/REVISIONS_002`);
  cross-language interface = pin that one boundary contract. **Pin types/signatures once** (author-go
  Layer-1 generalized) before parallelizing bodies → avoids repeated work + conflicting API decisions.

**Specific changes:**
1. Use the graph-tree/chunk tool to enumerate decomposable units.
2. Dispatch author subagents per chunk against frozen `.twf` contracts; reconcile.

## Group 4: Handoff / routing protocol (subsumes E1)

**Specific changes:**
1. Load design + **one** language-author + optional `author-infra` (orthogonal). **Never co-load two
   SDK-language authors.**
2. Genuine cross-language interface layer (uncommon, not rare): pin the boundary contract, dispatch
   isolated per-language author subagents that exchange only the contract.
3. `@lang` annotations (coming to the spec) become the dispatch key — don't over-engineer routing now.

## Group 5: Trim `design` (pull routing/Handoff out)

**Files touched:** `skills/temporal-architect-design/SKILL.md` (Handoff section).
**Change type:** `Internal`
**Parallelism:** After Group 1.

**Specific changes:**
1. Move multi-skill routing/orchestration out of design into this harness skill; design's Handoff
   reduces to "produce/review `.twf`; the harness routes implementation."

## Follow-on docs (F2/F3)

After the skill lands, echo the North Star in the main `README` (F2) and the published package
descriptions (F3). The dev-repo `AGENTS.md` North Star (F1) is separate (Stage 1, dev-only).

---

## Rationale & North Star (preserved from the skill-retro)

This skill is the architectural keystone; the reasoning below justifies it and the SDK split, and is
the source text for the user-facing North Star. (Preserved here so it survives the skill-retro cleanup.)

### North Star (the philosophy this skill carries)

`.twf` exists to **extend the complexity horizon of AI execution** — let AI work at *system* scale,
not code scale. (Atlas analogy: you don't cross the country on square-mile maps.) The biggest gains in
AI-assisted dev came from wiring AIs into **deterministic tooling** — compilers, linters, testers.
temporal-architect is that deterministic harness for **Temporal architecture**: keep the AI out of the
weeds (error handling, library choices, application-code pedantics) so it focuses on the large scale —
**workloads, scaling, reliability, availability**. The product is a **context-protecting harness for
the main agent**, so we fit bigger problems into the same context window. (Open: the "main agent" isn't
always the *design* agent — sometimes author/reverse. Don't assume.)

### Why an umbrella entry skill + split-by-SDK (skill-scope research)

- "Modular vs monolithic" writing is mostly about runtime agent *services* (latency/scaling/isolation)
  — a category error for skills (prompt/context artifacts; no hops, no scaling unit).
- What actually applies: (1) **progressive disclosure** → unused skills/refs ≈ free; (2) **skill-selection
  scaling** — accuracy is a phase transition (>90% at ≤20 skills, degrades past ~30, half-capacity
  κ≈84–92 on GPT-4o-family; synthetic/preliminary). **The lever is confusability, not count** — similar
  "competitor" skills hurt selection more than distinct ones; **hierarchy mitigates**.
- Provider bias to discount: Anthropic's "hundreds of skills" narrative serves their ecosystem; the
  independent finding is that cost = semantic overlap, not headcount.
- For this tiny, cohesive library, size is moot; the only real lever is **trigger confusability**. So:
  an **umbrella front-door** (hierarchy) + **split-by-SDK** (language = a sharp, low-confusability
  discriminator; per-SDK worker *process* genuinely differs) is the research-aligned shape — not a
  flat pile of confusable peers, and not one monolith.

### Why design's reverse path delegates to authors (author-go audit)

Nearly every reverse-reading concern already exists in `author-go`, framed forward (read right-to-left):
`activity-call.md` (string vs fn vs nil-pointer method), `options.md` (context-scoped options), nexus
client mapping + option-key map, parallel patterns (`workflow.Go`/`Selector` → await all/one/promise).
These are **directional-framing gaps, not knowledge gaps** → the design reverse section stays thin and
delegates. The one genuinely reverse-only item is the **proto-first codegen layer** (generated name
constants, constructor+Execute, `buf generate`, proto `tags`) → it lives in `author-go` (`proto-driven.md`),
since author-go correctly teaches idiomatic hand-written Go and this is a framework layered on the SDK.
