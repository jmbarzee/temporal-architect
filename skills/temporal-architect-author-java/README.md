# Skill: Temporal Architect — Java Authoring

Translates a validated `.twf` design (from the `design` skill) into compiled, tested Temporal Java SDK code. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, interface and impl pairs, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. Current Java SDK API: the Temporal docs MCP server.
