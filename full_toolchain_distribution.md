# Open Question: Full-Toolchain Distribution

**Status:** Parked — to revisit. Surfaced during the post-split publishing rollout
(all channels live as of `v0.9.3`); deferred because a parallel build/publishing
review is in flight. This doc captures the question and findings so we can
evaluate and fix later. Not yet scoped or scheduled.

## The fundamental question

We ship the toolchain through many entry points. **Can a prospective user easily
acquire the _full_ toolchain — parser/LSP (`twf`), visualizer, AI skills, and MCP
— from whichever entry point they start at?**

Today the answer is essentially **"only via the VS Code / Open VSX extension."**
Every other entry point delivers a single component, and the cross-linking that
would let a user assemble the rest is thin or broken.

## Current state (what each entry point delivers)

| Entry point | twf | Visualizer | Skills | MCP |
|---|---|---|---|---|
| VS Code / Open VSX extension | ✅ bundled (+ `~/.local/bin`) | ✅ webview GUI | ✅ auto → `~/.cursor/skills/` | ✅ via bundled `twf mcp` |
| Claude Code plugin | ⚠️ via `npx … twf mcp` | ❌ | ✅ | ✅ (parser tools + spec resources) |
| npm `@temporal-architect/twf` | ✅ | ❌ | ❌ | ✅ `twf mcp` |
| PyPI `twf-cli` | ✅ | ❌ | ❌ | ✅ `twf mcp` |
| Homebrew | ✅ | ❌ | ❌ | ✅ `twf mcp` |
| install.sh / GitHub Release | ✅ | ❌ | ❌ | ✅ `twf mcp` |
| `go install` | ✅ (source) | ❌ | ❌ | ✅ `twf mcp` |
| npm `visualizer` / `wire-types` | ❌ | lib / types only | ❌ | ❌ |

## The gaps

1. **MCP is shipped (parser tools + spec resources).** `twf mcp` exists and is
   wired into every binary channel; the long-standing "advertised but doesn't
   exist" broken promise is resolved. Residual: **skills are not exposed over
   MCP** (the binary doesn't embed them — parked M1 in `ROADMAP.md`), so any
   "MCP exposes skill prompts" copy stays aspirational until M1 lands.

2. **Skill-only users have no in-skill path to the binary.** `SKILL.md` files
   assume `twf` is on PATH but never say how to install it; the acquisition hint
   lives only in the toolchain README, not in the skill payload. A skill-only
   install (Claude plugin or copied skill) fails the moment a skill shells out to
   `twf`.

3. **The visualizer GUI is extension-only.** The design skill says "suggest the
   TWF visualizer extension" without a name or install line. The npm `visualizer`
   is a React lib to embed yourself (you feed it `twf parse` output), not a
   drop-in GUI.

Note: binary-only channels (npm/PyPI/Homebrew/curl/go) ship the binary (and its
embedded spec) but **no** skills — only the editor and Claude Code channels
bundle skills. The README/packaging summaries now state this rather than
claiming every path converges on the same skills.

## Worked example

> "If I install the skill, do I have — or can I easily add — the parser/MCP and
> visualizer?"

No. You get the skills only. The parser must be installed separately and the
skill doesn't point you there (though once `twf` is on PATH, `twf mcp` gives the
agent the parser tools); the visualizer GUI needs the IDE extension. There is no
single "assemble the rest" path from the skill entry point.

## Candidate fixes (to evaluate later)

- ~~Build & ship `twf mcp` (M2)~~ — **done** (parser tools + spec resources). The
  remaining MCP work (exposing skills as prompts/resources) is gated on M1.
- Add a short "Requires the `twf` binary — install via …" header to each
  `SKILL.md`, or have the Claude plugin / extension guarantee the binary is
  present.
- Name the exact extension and the `@temporal-architect/visualizer` embed option
  wherever the visualizer is referenced.
- ~~Reconcile the README "all paths converge" claim with reality~~ — **done**;
  the README/packaging summaries now distinguish binary-only from skill-bearing
  channels.

## Decision needed

What is the intended "full toolchain" acquisition story per audience (IDE user,
CLI user, AI/agent user), and which entry points must deliver it end-to-end vs.
point to the rest? MCP (the load-bearing piece for the agent entry points) is
now shipped, so the remaining decision is about the skill→binary and
visualizer-GUI acquisition paths.
