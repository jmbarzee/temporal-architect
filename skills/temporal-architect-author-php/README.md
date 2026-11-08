# Skill: Temporal Architect — PHP Authoring

Translates a validated `.twf` design (from the `design` skill) into statically checked, tested Temporal PHP SDK code run under RoadRunner. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, worker registration, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. Current PHP SDK API: the Temporal docs MCP server.
