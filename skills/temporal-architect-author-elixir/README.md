# Skill: Temporal Architect — Elixir Authoring

Translates a validated `.twf` design (from the `design` skill) into compiled, tested Elixir for the community Erlang/Elixir SDK (`andrzej-mag/temporal_sdk`). Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, wire names, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. SDK API: `temporal_sdk`'s source and hexdocs at the pinned commit.
