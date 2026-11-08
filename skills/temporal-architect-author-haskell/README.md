# Skill: Temporal Architect — Haskell Authoring

Translates a validated `.twf` design (from the `design` skill) into compiled, tested Temporal Haskell code on the community SDK `MercuryTechnologies/hs-temporal-sdk`. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, worker registration, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. SDK idioms: `reference/idioms.md`. DSL semantics: `twf spec [<slug>]`. SDK API: its source and haddock at `e57a0ae`.
