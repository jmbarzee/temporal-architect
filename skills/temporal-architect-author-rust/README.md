# Skill: Temporal Architect — Rust Authoring

Translates a validated `.twf` design (from the `design` skill) into compiled, tested Temporal Rust SDK code. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, wire names, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. Current Rust SDK API: the Temporal docs MCP server.
