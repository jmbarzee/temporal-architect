# Design Skill Alignment Review

Align the design skill to the parser. The parser is authoritative — the skill documentation is the target.

This command answers: "does the design skill accurately and completely document what the parser actually accepts?"

The parser is the ground truth here, not `LANGUAGE_SPEC.md` — the spec and parser are kept in sync separately via `/project:review-alignment-parser`. The skill must reflect reality: what the parser parses, what errors it emits, what the resulting design means.

Skill craft and structure belong in `/project:review-quality-skill`. This command is solely coverage alignment: does the skill document everything the parser provides?

## Context

- Parser implementation: `parser/lexer/`, `parser/parser/`, `parser/ast/`, `parser/resolver/` — authoritative source
- `skills/design/README.md` — declared goal and scope of the skill
- `skills/design/SKILL.md` and `skills/design/reference/` — the target under review
- `AST_REVISIONS.md` — changes in flight that may introduce new constructs requiring pre-emptive documentation
- `DESIGN_SKILL_ALIGNMENT_REVISIONS.md` — if present, read to avoid re-reporting known gaps

## Dependencies to Check

The design skill has three dependencies on the parser, all of which must be covered:

1. **Constructs**: every syntactic construct the parser accepts — workflows, activities, workers, namespaces, nexus services, all statement types, all option types
2. **Error model**: every error and warning the resolver emits — what triggers them, what they mean, how a designer should respond
3. **AST semantics**: what the parsed output represents — cross-references, resolution behavior, what a design means in terms of Temporal primitives

## Workflow

### Phase 1: Explore

Use sub-agents in parallel:
- **Parser construct agent**: Read `parser/parser/` and `parser/ast/`. Build a complete inventory of every parseable construct and its semantics.
- **Error model agent**: Read `parser/resolver/`. Build a complete inventory of every error and warning: trigger condition, message, severity.
- **Skill agent**: Read `skills/design/SKILL.md` and all files in `skills/design/reference/`. Note what's documented vs. what the parser agents found. Run `twf check` on all `.twf` examples in `skills/design/topics/`.

### Phase 2: Catalog

For each parser construct and error:
- **Status**: `documented` | `partial` | `missing`
- **Gap**: what's absent or incompletely described
- **Severity**: `critical` (common construct or frequent error, undocumented) | `moderate` | `minor`

Also flag any skill documentation that describes behavior the parser doesn't actually implement — stale content is as harmful as missing content.

### Phase 3: Group & Prioritize

Group by construct family and error category. Order: missing critical constructs first, then stale content, then missing errors, then minor gaps.

### Phase 4: Write to `DESIGN_SKILL_ALIGNMENT_REVISIONS.md`

Write the grouped plan to `DESIGN_SKILL_ALIGNMENT_REVISIONS.md` at the repo root:
- Brief summary: coverage state, stale content found, `twf check` result
- One `## Group N: Title` section per group
- Each group: gaps addressed, files touched, change type (`Internal`), parallelism notes

**STOP after writing. Present a summary and wait for approval. To execute, invoke `/project:address-review`.**

## Constraints
- **Parser is authoritative.** If the skill documents something the parser doesn't support, that's stale content — flag it for removal, not parser addition.
- **Run `twf check` on all examples.** Don't trust correctness by reading alone.
- **Error documentation is first-class.** A designer who doesn't understand parser errors cannot effectively use the tool.
- **Don't modify the parser.** If a gap reveals a parser deficiency, note it for `/project:review-alignment-parser`, don't fix it here.
- **Prefer improving existing examples over creating new ones.** More docs ≠ better docs.
