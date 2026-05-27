# DSL Changes

**Source review(s):** investigation surfaced while addressing `parser/REVISIONS_003` (resolved deployment graph)
**REVISIONS file(s):** none — opportunistic spec tightening

## Summary

Documented that `task_queue` is intentionally not a nexus call option — routing is determined by the endpoint, not the call site. The parser already enforces this; the spec is now explicit about the *why* so future authors don't re-propose the option.

## Changes by Type

### Documentation

- **`tools/spec/sections/06-statement-syntax.md` § Nexus Call**: added a paragraph after the call-option list stating that `task_queue` is intentionally absent, explaining the endpoint-owns-routing contract, and noting the concrete parser error (`unknown option key: task_queue`).
