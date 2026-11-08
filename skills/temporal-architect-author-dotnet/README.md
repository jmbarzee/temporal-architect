# Skill: Temporal Architect — .NET Authoring

Translates a validated `.twf` design (from the `design` skill) into compiled, tested Temporal .NET SDK code in C#. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, worker registration, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. Current .NET SDK API: the Temporal docs MCP server.
