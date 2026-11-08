# Skill: Temporal Architect — Clojure Authoring

Translates a validated `.twf` design (from the `design` skill) into tested Temporal Clojure code on the community SDK `manetu/temporal-clojure-sdk`. Design decisions are already made; the work is mapping each construct to its SDK idiom — determinism, dynamic dispatch, error handling. It does not make design decisions, change the DSL, or target other languages.

Entry: `SKILL.md`, then `reference/` per construct. DSL semantics: `twf spec [<slug>]`. SDK API: its `doc/` and source at `v2.4.1`.
