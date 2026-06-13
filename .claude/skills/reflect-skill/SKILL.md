---
name: reflect-skill
description: Reflect on how a skill was applied in the current session and propose concrete revisions to that skill. Use after completing a task that was guided by a skill, to surface intention-vs-outcome gaps and write a skill-revisions file.
---

# Reflect on Skill Application

Reflect on how a skill was applied in this conversation. Surface what worked, what didn't, what was invisible, and what the skill should say differently so the next application is better.

This is not evaluation. Evaluation asks "was this good?" Reflection asks "what happened, and what does that reveal about the process?" The goal is not a score — it's understanding that changes the skill.

## The Mechanism

Reflection produces insight when it creates a gap between **what was intended** and **what actually occurred**, then traces that gap to a cause. Without the gap, there's nothing to learn. Without tracing to a cause, you get awareness but not change.

Three elements drive this:
1. **Intention** — what was the skill guiding you toward?
2. **Outcome** — what actually happened, concretely?
3. **Attribution** — why did the gap exist? Was it the skill, the context, the application, or the interaction between them?

Push past surface observations. "The skill could be clearer" is almost useless. "When I needed to decide between X and Y, the skill said Z, which pushed me toward X, but Y would have been better because..." — that specificity is where insight lives.

## Depth Hierarchy

Most reflection stops at description or analysis. The payoff lives deeper:

- **Surface**: What happened? (descriptive)
- **Causal**: Why did it happen? (analytical)
- **Structural**: What about the system made this likely? (systemic)
- **Generative**: What change to the system would make the better outcome the default? (constructive)

Your job is to reach the generative level — not "what went wrong" but "what would the skill need to say so the right behavior becomes natural."

## Skill Selection

If a skill path is not apparent from conversation context, list the contents of `skills/` and present the options. Wait for selection before proceeding.

## Workflow

### Phase 1: Self-Assessment

Before dispatching sub-agents, sit with your own experience. Don't rush to categorize — understand first.

Write an honest account of what happened:
- What did the skill guide you to do? Where did it have strong influence?
- Where were you improvising without guidance?
- What felt uncertain? What felt confident? What felt too easy?
- Where did you diverge from the skill, and why?
- What decisions did you make that the skill was silent on?

Then, review the **reflection cases** below. These are a vocabulary for naming what you're experiencing — not a checklist to fill out. Some will resonate. Some won't. Use the ones that feel true.

#### Reflection Cases

| Case | Felt State | What It Reveals |
|---|---|---|
| Missed something | "I think there's a gap I can't see" | Blind spots in output or reasoning |
| Hard tradeoff | "I chose, but I'm not sure I chose right" | Decision quality under constraints |
| Skill felt wrong | "The guidance fought the natural flow" | Friction or error in the skill itself |
| Framing too narrow | "I may have locked in too early" | Premature closure on an approach |
| Nailed it | "This went well" | Overconfidence; invisible assumptions |
| Assuming X | "I've been taking something for granted" | Deep unexamined premises |
| Off-script worked better | "I diverged and the result improved" | The skill falling behind practice |
| Pieces fine, whole off | "Every part seems right but something's wrong" | Emergent incoherence |
| Don't know what I don't know | "No particular signal — just... done" | Unknown unknowns |
| Converged too easily | "Agreement came fast" | Suppressed tension; accommodation |

Based on what resonates, compose sub-agent dispatches for Phase 2. Use the context-sharing guide below to decide what each agent sees.

**Run many agents.** The cost of a redundant perspective is low. The cost of a missing one is high.

#### Context-Sharing Guide

Every sub-agent prompt is composed from a palette of context blocks. Share what grounds the agent in the problem. Withhold what would anchor it to your reasoning.

**Available context blocks:**
- **Skill text** — the SKILL.md and relevant topic/reference docs
- **Artifacts** — files produced during the work
- **Goal** — the high-level objective, stripped of approach
- **Problem** — the specific problem being solved
- **Decision points** — specific forks where choices were made
- **Constraints** — what limited the options
- **Self-assessment** — your narrative from this phase
- **Named assumptions** — specific assumptions to probe
- **Divergence description** — where and how the work departed from the skill
- **Collaboration summary** — what was proposed, accepted, debated (sanitized of reasoning)

**Recommended sharing by case:**

| Case | Share | Withhold |
|---|---|---|
| Missed something | Skill, artifacts | Reasoning, decisions |
| Hard tradeoff | Skill, decision point, constraints | Which choice was made |
| Skill felt wrong | Skill, goal | Output, approach taken |
| Framing too narrow | Goal only | Skill, output, approach |
| Nailed it | Skill, artifacts | — (frame adversarially) |
| Assuming X (targeted) | Skill, artifacts, named assumption | — |
| Assuming X (blind) | Skill, artifacts | The named assumption |
| Off-script worked better | Skill, artifacts, divergence description | Reasoning for divergence |
| Pieces fine, whole off | Artifacts only | Skill, reasoning, decision sequence |
| Don't know what I don't know | Skill, artifacts | Everything else |
| Converged too easily | Skill, artifacts, collaboration summary | Detailed reasoning |

These are recommendations, not rules. You understand your situation better than this table does. Adjust the boundaries based on what kind of insight you're after.

### Phase 2: Dispatch

Launch sub-agents in parallel.

**Always dispatch the baseline agent.** This agent receives only the skill text and the artifacts — no conversation context, no framing, no steering. Its prompt is genuinely open-ended:

> You're seeing this skill and this output for the first time with no context about how or why decisions were made.
>
> What do you notice? What questions would you ask? What seems assumed rather than decided? What's conspicuously absent?
>
> Don't just describe what you see — say what it reveals about the process that produced it, and what would need to change so a better outcome becomes the default.

**Dispatch case-specific agents** based on Phase 1. For each, compose a prompt using the relevant context blocks and a framing question that pushes past surface observation.

**Front-load depth in every prompt.** Sub-agents can't ask follow-up questions, so the initial prompt must push them to structural and generative depth. Don't just ask "what do you notice" — ask "what do you notice, what does it reveal about the system that produced this, and what would need to be different so the better outcome becomes natural?"

**Multi-round deepening.** After reading a sub-agent's response, you may dispatch a follow-up agent to deepen a specific thread. Give the follow-up agent the original context plus the first agent's specific observation, and ask it to go further on that point. This is the closest analog to a real conversation — use it when a sub-agent surfaces something worth pursuing but stops short of structural or generative insight. Name what landed ("your observation about X is interesting") and ask a specific deepening question, rather than a generic "tell me more."

### Phase 3: Reconciliation

This is the thinking phase, not the sorting phase.

Sub-agents produce raw material. Your job is to do the thinking they couldn't — the follow-up questions, the connections between observations, the push from causal to structural to generative. A sub-agent might say "the skill doesn't address X." Your job is to ask: *why* doesn't it? Is that an oversight, or does the skill's framing make X invisible? What would the skill need to say so that X becomes naturally visible to the next application?

For each sub-agent observation, engage with it before categorizing it:

- **Blind spot** — "I didn't see this at all." High value. Why was it invisible to you but obvious to a fresh reader? What about your reasoning (or the skill's framing) made this blind spot likely?
- **Intentional tradeoff** — "I knew this and chose differently because..." Should the skill document this tradeoff so future applications don't have to rediscover it?
- **Context-dependent** — "The sub-agent is wrong because it doesn't know X." Strong signal: X is implicit knowledge the skill should make explicit. When you find yourself saying "they're wrong because they lack context," that's the skill's job to provide.
- **Confirming** — "I suspected this and now have validation." Strengthens existing direction.
- **Novel reframe** — "I hadn't thought about it this way." Not yet actionable but shifts understanding.

Write the results to `REFLECTION_{NAME}.md` at the repo root, where `{NAME}` is derived from the skill path (e.g., `skills/temporal-architect-design` → `REFLECTION_DESIGN.md`).

```
# Reflection: {Skill Name}

**Skill:** `{path}`
**Scope:** {what was reflected on — brief description of the work}
**Cases explored:** {which reflection cases were used}
**Sub-agents dispatched:** {count and brief description of each}

## Self-Assessment
{Honest account from Phase 1}

## Sub-Agent Perspectives

### Baseline (Isolated)
{Findings from the zero-context agent}

### {Case Name}
{Findings from each case-specific agent}
{If multi-round deepening was used, include the thread}

## Reconciled Observations

### Blind Spots
{What was missed, why it was invisible, what structural change would prevent it}

### Intentional Tradeoffs
{Decisions that were deliberate — should the skill document these?}

### Context-Dependent
{What sub-agents got "wrong" due to missing context — what implicit knowledge should the skill encode?}

### Novel Reframes
{New perspectives that shift understanding}

### Confirming
{Validation of existing direction}
```

**STOP. Present the reflection to the user. Ask which observations should be promoted to skill revisions.**

### Phase 4: Distill

Take the user's selections and group them by theme. Write `SKILL_{NAME}_REVISIONS.md` at the repo root following the standard revisions format:

```
# Skill Revisions: {Skill Name}

**Source:** `reflect-skill`
**Reflection file:** `REFLECTION_{NAME}.md` (consumed)

## Summary
{1-2 sentences on what the reflection surfaced and what will change}

## Group N: {Theme}

**Findings:**
- {Finding with location, severity, and description}

**Files touched:** {which skill files will change}
**Change type:** `Internal`
**Parallelism:** {what can be done in parallel}
```

Delete `REFLECTION_{NAME}.md` after writing the revisions file.

**Cross-layer changes (rare).** If the reflection surfaces a genuine issue in a layer other than the skill — for example, the parser doesn't support a construct the skill assumes exists, or the visualizer misrepresents something the skill relies on — write a `{LAYER}_CHANGES.md` for the affected layer and flag it for `internal/harness/commands/propagate-changes.md`. The bar is high: "this is broken in the other layer," not "it would be nice if the other layer also changed." If you're unsure whether it meets the bar, it doesn't.

**To execute revisions, invoke `internal/harness/commands/address-review.md`.**

## Constraints

- **Reflection is not evaluation.** Don't score the work. Understand what happened and trace it to causes.
- **Specificity over abstraction.** "The skill should be clearer about X" is not a finding. "When I hit decision point Y, the skill's guidance on X pushed me toward Z, but A would have been better because B" — that's a finding.
- **The baseline agent always runs.** Even if you're confident about what the reflection will surface. Especially then.
- **Reconciliation is thinking, not sorting.** Don't just categorize sub-agent findings into buckets. Engage with them. Deepen them. Ask what they imply.
- **The skill is the target.** The goal is skill improvement, not self-criticism. Every observation should trace back to: what should the skill say differently?
- **Depth before output.** Resist the pull toward producing the reflection file before you've genuinely understood what happened. The file is a byproduct of understanding, not the goal.
- **Open-ended before evaluative.** When composing sub-agent prompts, prefer "what do you notice?" over "what's wrong?" Generation before judgment.
