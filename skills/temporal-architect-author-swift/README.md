# Skill: Temporal Architect — Swift Authoring

Translates a validated `.twf` design (from the `design` skill) into built, tested code for the Swift Temporal SDK `apple/swift-temporal-sdk`. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, macro-declared definitions, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. SDK API: its DocC catalog, `Examples/` and source at `1.5.0`.
