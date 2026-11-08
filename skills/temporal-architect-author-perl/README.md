# Skill: Temporal Architect — Perl Authoring

Translates a validated `.twf` design (from the `design` skill) into compile-checked, tested code for the community Temporal Perl SDK (sdk-perl). Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, wire names, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. Perl SDK API: sdk-perl's README and POD at the pinned commit.
