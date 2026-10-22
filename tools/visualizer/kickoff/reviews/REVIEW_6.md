# Review — Unit 6 (colour scheme + node sizes)

**§3.2 review record. PR scope.** Third run under rule 12: five finders
(Opus on the model and the gates, Sonnet elsewhere) in isolated worktrees
told the sha and detaching to it (every one started at main and said so), a
Sonnet grouper that only groups, severity and the verify trigger computed
from the finders' own claims.

**42 findings, 41 reproduced** (as filed: 9 blocker, 23 major, 10 minor),
across **17 clusters**, **12 verified, 0 refuted** — both blocker clusters
confirmed at major, four majors downgraded, five "partly". **18 agents,
2.66M subagent tokens, 1072 tool uses, 23.5 minutes.**

Every cluster at blocker or major is resolved in `4f3c543` (D58); the one
cluster that is a record matter (the ceiling) is resolved by this close.

## The rules, measured

| | Unit 3 | Unit 4 | Unit 5a | Unit 5b | Unit 6 |
|---|---:|---:|---:|---:|---:|
| agents | 15 | 24 | 14 | 15 | **18** |
| tokens | 1.86M | 3.52M | 2.14M | 2.27M | **2.66M** |
| findings → clusters | 42 → 20 | 55 → 26 | 39 → 11 | 39 → 16 | 42 → **17** |
| clusters verified | 8 of 20 | 17 of 26 | 8 of 11 | 9 of 16 | **12 of 17** |
| refuted | 1 | 0 | 0 | 0 | **0** |
| blockers downgraded by verification | — | 5 of 7 | 3 of 5 | 1 of 1 | 2 of 2 |

The heaviest review since Unit 4, and the most it has been worth. Nine
findings were filed at blocker across two mechanisms, and both were real:
eighteen dark rules that could never match because a generated edit had
written `\"` into CSS (C1 — five finders found it independently, and my
own Gate 5 pass had not, because the one correctly-spelled block in
`index.css` made the pane *look* dark), and two resolvers for one theme (C2
— the hook read the OS, the stylesheets read the host's class, and the
committed "light" captures were dark because the machine was). Both were
invisible to every automated gate: a stylesheet has no type-checker, and a
screenshot does not say which rule produced its pixels. The fix for both is
one rule — the themed root carries the theme as an attribute and as tokens,
and every component rule reads tokens — which also closed C3 (ancestor-keyed
rules), C4 (the accent as the workflow fill) and T13 for real.

The spend went to the finders (five lenses, three of them in headless Chrome
of their own) rather than to verification: twelve clusters verified, eleven
of them on the "contradicts a decision" trigger — D57 had made claims
("stored once", "no longer depends on `mountNodeTypeStyles`", "sixteen
tints gone", "R16 already the spec's") that the tree did not support, and
every one was checked. The lesson is F24: a claim in a decision is a
measurement to take before the record is written, not after.

| lens | findings | reproduced | blocker / major / minor |
|---|---:|---:|---|
| model | 9 | 9 | 2 / 4 / 3 |
| gates | 7 | 6 | 2 / 5 / 0 |
| surface | 8 | 8 | 2 / 4 / 2 |
| dist | 7 | 7 | 1 / 4 / 2 |
| record | 11 | 11 | 2 / 6 / 3 |

## Clusters, as computed (severity = max filed; verdict where verified)

| cluster | severity | verdict | members | mechanism | resolution |
|---|---|---|---|---|---|
| escaped-quote-selectors | blocker | confirmed (major) | model-1, gates-2, surface-1, dist-2, record-1 | Dark selectors were written with backslash-escaped quotes ([data-theme=\"dark\"]) in plain CSS, so the attribute value includes the quote characters and never matches data-theme=dark. | the eighteen rules are gone — every theme difference is a token on the themed root; the pattern gate refuses a backslash-quote in any stylesheet (D58 §1) |
| js-css-theme-resolver-mismatch | blocker | confirmed (major) | model-2, gates-1, surface-2, dist-1, record-2, record-3 | The JS theme hook resolves Auto via prefers-color-scheme and vscode-high-contrast while the stylesheets key dark only on .vscode-dark/[data-theme=dark], so canvas/inline vars and CSS chrome disagree. | the pane always carries its resolved theme as `data-theme` and the canvas root the host's; the stylesheets' token blocks key on the attribute; `hostTheme` reads high-contrast-light before high-contrast; `screenshot.mjs` emulates the preference and fails a wrong-theme capture; the light captures retaken (D58 §2) |
| ancestor-keyed-dark-rules | major | confirmed (minor) | gates-3, surface-4, dist-6, record-10 | Dark rules are descendant selectors keyed on any dark ancestor with no nearest-boundary scoping or light counter-rules, so a pane choosing Light inside a dark host still gets dark rules. | no component rule keys on an ancestor class; a variable inherits from the nearest themed root, so a Light pane in a dark host is light in every rule — checked in the browser (D58 §2) |
| colour-stored-multiple-times | major | confirmed (minor) | model-4, record-6 | Workflow/activity colours exist as index.css variables and many literal rgba/hex copies alongside the scheme, with nothing tying them together (T13 unresolved). | `--accent` is the chrome's own token; the forty literal tints are `color-mix` of it; `--node-*` is the scheme's namespace and the injector no longer emits `--color-workflow` (T13 closed) (D58 §3) |
| csssuffix-non-injective | major | partly (minor) | model-3, surface-8, dist-7, record-9 | The --color-<suffix> custom-property name is a lossy derivation of the value id in the chrome's namespace with no uniqueness or reserved-name check, so values can collide with each other or with UI tokens. | `--node-<suffix>` namespace; `createOntology` refuses a shared or empty suffix, pinned in `schemeProbes.refusals` (D58 §3) |
| gate-ceiling-not-ratcheted | major | — | record-5 | The leak-gate ceiling was not ratcheted after Unit 6, so the unmet plan target (58) is compared against nothing and the remaining leaks go unrecorded. | ceilings ratcheted at this close to 54 / 1118, with the per-file arithmetic in PROGRESS (D58 §11) |
| gates-pin-declarations-not-readers | major | partly (minor) | gates-4, surface-6 | The verification gates pin the declared data (strokes, schemeVars) but never exercise the reader path (edgeStrokeFor, color[theme], hook), so sabotage of the readers leaves all gates green. | Tier A `edgeClassification.byStroke` reads the stroke path the canvas reads; `schemeProbes.markers` pins the hook's marker rule; the canvas's `color[theme]` read stays Gate 5's (D58 §7) |
| host-cannot-supply-scheme | major | partly (minor) | dist-4 | The published package hard-wires DEFAULT_ONTOLOGY and does not export the scheme/taxonomy types, so a host has no way to supply a scheme or labels. | configured through `OntologySpec`, in-tree until Unit 8 publishes the library's surface (C3); recorded as such (D58 §9) |
| normaliser-unwired | major | partly (minor) | gates-5, surface-5, record-7 | withAlpha's colour normaliser is called only on the library's hex palette, so host-supplied scheme colours reach the canvas context unnormalised and the normaliser has no real input or reader. | the 2D-context pass is deleted; a taxonomy colour must be hex or `rgb()`, refused at construction, so no reader meets a colour it cannot read (D58 §3) |
| persisted-graphtheme-unvalidated | major | confirmed (major) | model-6, gates-6, surface-3, dist-3, record-8 | accept() validates only the schema version and graphTheme is trusted as a ThemeChoice, so an out-of-range stored value throws in GraphView render outside the error boundary. | `themeChoiceOf` answers system for anything outside the three; pinned in `schemeProbes.choices` (D58 §5) |
| summary-abbreviations-hardcoded | major | partly (minor) | record-4 | Node-summary text hard-codes domain abbreviations instead of reading the taxonomy's abbreviationFor, duplicating one fact in a literal. | `summaryKind` is `children | degree | none`; a children summary names each contained value by the taxonomy's abbreviation (D58 §6) |
| tree-chips-depend-on-root-vars | major | confirmed (major) | model-5, gates-7, dist-5 | Tree-view FilterBar chips resolve var(--color-<suffix>) from :root outside the scheme-carrying pane, so they still depend on mountNodeTypeStyles contrary to D57. | the canvas root carries the scheme's variables for the host's theme; checked in the browser — a tree chip tints from the taxonomy (D58 §4) |
| chip-tint-unchecked-string | minor | — | model-7 | FilterChip.tint is a free string restating which style value a chip stands for with no validation, so wrong or unknown tints silently misrender. | checked at render, said once on the console, never thrown (D58 §11) |
| decision-record-falsified | minor | partly (minor) | record-11 | D57 and the spec were written from the fixture view and make claims (fixture rows, spliced-edge wording, byte-identical output, no mountNodeTypeStyles dependency) the tree falsifies. | D58 §10 records the 115 synthetic pair rows and 3 synthetic-case rows beside the 66, and the spliced-edge wording |
| hosttheme-marker-lookup | minor | — | surface-7 | hostTheme's closest() lookup includes the pane's own data-theme and stops at the first marker it cannot interpret, so it mis-reads the host. | `hostTheme` reads the marker above the pane and walks past a marker that declares nothing (D58 §2) |
| neutral-bucket-colour-duplicated | minor | — | model-9 | The 'unstyled bucket neutral colour' rule is written in several places with different values, so band and token disagree. | an unstyled bucket's overlay colour is `undefined`; the canvas draws its one neutral, the token's (D58 §8) |
| pair-stroke-fabricated | minor | — | model-8 | Spring categories reuse EdgeTypeDefinition, forcing a fabricated PAIR_STROKE that duplicates GraphCanvas's NEUTRAL_STROKE and is read by nothing. | `EdgeCategoryDescription` is what a token needs; the pair stroke is gone (D58 §8) |

## Findings, as filed

- **model-1** [blocker] Every new [data-theme=\"dark\"] branch is dead: the escaped quotes compile to [data-theme='"dark"'] — `src/components/GraphView.css:135`
- **model-2** [blocker] hostTheme reads vscode-high-contrast as dark, but the CSS has no high-contrast rule: in High Contrast hosts the pane draws the dark palette on light chrome — `src/components/graph-view/useTheme.ts:21`
- **model-3** [major] cssSuffix is not injective and shares --color-* with the chrome; createOntology accepts colliding ids — `src/graph/scheme.ts:38`
- **model-4** [major] --color-workflow and --color-activity are both a value's fill and the chrome's accent; index.css and 40 rgba() literals are uncompared second copies (T13 still open) — `src/styles/index.css:12`
- **model-5** [major] The tree's FilterBar resolves chip tints from :root, not from the scheme; mountNodeTypeStyles is still a dependency — `src/components/FilterBar.tsx:242`
- **model-6** [major] A persisted graphTheme outside the three choices bypasses D4 and throws inside GraphView's render, blanking the app on every load — `src/components/WorkflowCanvas.tsx:217`
- **model-7** [minor] FilterChip.tint restates, by unchecked string, which style value a chip stands for; a wrong or unknown tint silently greys the chip — `src/adapter/node-types.ts:328`
- **model-8** [minor] PAIR_STROKE is a stroke nothing reads, fabricated to satisfy EdgeTypeDefinition.style, and a copy of GraphCanvas's NEUTRAL_STROKE — `src/graph/forces.ts:482`
- **model-9** [minor] One unstyled bucket gets two colours: the band uses a '#94A3B8' literal, the token uses var(--color-text-muted) — `src/components/GraphView.tsx:204`
- **gates-1** [blocker] 'System' theme is resolved by two rules: the hook uses prefers-color-scheme and high-contrast, the CSS uses neither. The committed light Gate 5 captures draw the dark palette on a light page — `src/components/graph-view/useTheme.ts:24`
- **gates-2** [blocker] 18 of the 19 converted dark selectors carry literal backslash-quotes; the build emits [data-theme='"dark"'], so a pane choosing Dark in a light host keeps light component chrome — `src/components/GraphView.css:135`
- **gates-3** [major, unreproduced] A pane choosing Light in a dark host still gets every dark component rule: ancestor .vscode-dark matches and no light counter-rules exist — `src/components/FilterBar.css:404`
- **gates-4** [major] Nothing reads the canvas's stroke path (ontology.edgeStrokeFor over resolveEdgeType); the '66 rows pinned as a composition' claim pins the declaration, not the resolution — `src/verify/scheme-probes.ts:49`
- **gates-5** [major] withAlpha's 2D-context normaliser has no production input and no reader; making it throw leaves every gate green — `src/graph/scheme.ts:94`
- **gates-6** [major] The persisted graphTheme is never validated: a version-2 state holding any other value passes the D4 guard and throws inside GraphView's render, which no error boundary covers — `src/components/WorkflowCanvas.tsx:217`
- **gates-7** [major] D57's claim that 'the library's components no longer depend on' mountNodeTypeStyles is false: the tree view's FilterBar chips read --color-<suffix> outside the pane, and the T13 literals remain — `src/components/FilterBar.tsx:242`
- **surface-1** [blocker] Every dark-variant rule written as [data-theme=\"dark\"] never matches data-theme="dark" (18 sites in the shipped stylesheet) — `src/components/GraphView.css:135`
- **surface-2** [blocker] Auto resolves via prefers-color-scheme but no stylesheet honours it: OS-dark plain browser paints the dark palette on light chrome (and the committed 'light' Gate 5 screenshots show it) — `src/components/graph-view/useTheme.ts:24`
- **surface-3** [major] A persisted graphTheme outside the three blanks the whole app and survives reload — `src/components/WorkflowCanvas.tsx:217`
- **surface-4** [major] A forced-Light pane inside a dark host still gets every dark rule: dark overrides are ancestor-keyed, the resolver is nearest-wins — `src/components/GraphView.css:415`
- **surface-5** [major] The colour normaliser (T6) is wired only to the group glow; every scheme colour goes unnormalised to ctx.fillStyle/strokeStyle, where an unparseable colour silently keeps the previous fill — `src/components/GraphCanvas.tsx:879`
- **surface-6** [major] Nothing checks that the canvas reads color[theme], that edges are stroked from the map, or that the hook resolves the theme: four sabotages, all gates green — `src/verify/scheme-probes.ts:33`
- **surface-7** [minor] hostTheme reads the pane's own data-theme as 'the host' and stops at the first marker it cannot interpret — `src/components/graph-view/useTheme.ts:17`
- **surface-8** [minor] cssSuffix is not injective and values are not namespaced from the pane's own --color-* UI tokens; schemeVars overwrites silently — `src/graph/scheme.ts:47`
- **dist-1** [blocker] Auto theme reads prefers-color-scheme and .vscode-high-contrast; the stylesheets read neither, so the pane renders half dark — `src/components/graph-view/useTheme.ts:17`
- **dist-2** [major] Eighteen dark rules are spelled [data-theme=\"dark\"] with a literal backslash and never match data-theme=dark — `src/components/GraphView.css:135`
- **dist-3** [major] A persisted graphTheme is trusted; any value other than system, light or dark blanks the whole Visualizer on every load — `src/filter/storage.ts:98`
- **dist-4** [major] The published package gives a host no way to supply the colour scheme or labels (R10, R11, R15, R16); dts-gate only checks the opposite direction — `src/components/WorkflowCanvas.tsx:420`
- **dist-5** [major] The library still depends on mountNodeTypeStyles: tree-view filter chips read --color-<suffix> from :root, contrary to D57 and the scheme.ts header — `src/components/FilterBar.tsx:242`
- **dist-6** [minor] An explicit Light pane inside a .vscode-dark host keeps the dark half of every descendant rule — `src/components/FilterBar.css:404`
- **dist-7** [minor] The derived custom-property name is lossy and createOntology does not refuse two values that share it — `src/graph/ontology.ts:176`
- **record-1** [blocker] 18 dark-theme selectors are written [data-theme=\"dark\"] and can never match, so an explicit Dark pane in a light host leaves them inert — `src/components/FilterBar.css:45`
- **record-2** [blocker] Auto theme resolves dark from the OS media query in JS but no stylesheet has a prefers-color-scheme counterpart, so a dark-OS user with no host marker gets the dark palette on a light page — `src/components/graph-view/useTheme.ts:24`
- **record-3** [major] The ten committed 'light' Unit 6 screenshots show the dark palette, so Gate 5 never evidenced the light theme; screenshot.mjs does not pin the scheme and its header misstates when --dark is applied — `verify/screenshot.mjs:208`
- **record-4** [major] R16 is recorded as already covered, but node-summary text hard-codes 'wf', 'act', 'nxs', 'worker(s)', 'endpoint(s)', 'op(s)' and ignores the taxonomy's abbreviations — `src/components/graph-view/visibleGraph.ts:147`
- **record-5** [major] Unit 6 left 32 of its own assigned leaks and the gate ceiling still reads 180, so PLAN's 58 is unmet while D57 and the commit are silent on the gap — `kickoff/gates.json:13`
- **record-6** [major] 'Colour is stored once and read everywhere' is false: the workflow purple still lives as 31 literal rgba/hex copies in the pane stylesheets plus index.css and two emitters, so an injected palette reaches only some of it (T13 unresolved) — `src/components/FilterBar.css:140`
- **record-7** [major] The colour normaliser guards only the library's own glow palette; scheme colours go raw into ctx.fillStyle/strokeStyle where an unparseable value silently keeps the previous fill — `src/components/GraphCanvas.tsx:871`
- **record-8** [major] A persisted graphTheme outside system/light/dark is trusted and throws in GraphView's render, blanking the Graph tab until storage is cleared — `src/components/WorkflowCanvas.tsx:217`
- **record-9** [minor] The custom-property name is derived from the value id with no injectivity or reserved-name check, so a host value can silently overwrite another value's colour or the pane's own tokens — `src/graph/scheme.ts:55`
- **record-10** [minor] Dark rules are keyed on any dark ancestor, so a pane that chose Light inside a dark host still gets the dark rules — `src/components/FilterBar.css:404`
- **record-11** [minor] Record sentences the tree falsifies: D57 enumerates only the 66 fixture rows, spec says spliced edges draw 'the workflow dependency', D57 claims byte-identical injector output and no dependency on mountNodeTypeStyles — `kickoff/DECISIONS.md:1435`

## What did not reproduce

- gates-3 (a Light pane in a dark host keeps the dark rules) — reasoned
  from the built stylesheet, not run; its cluster's other members ran it in
  Chrome and confirmed it; resolved by the token model, and checked in the
  browser at the close: shell dark, pane light in every token.

## Notes from the finders

- model: Detached: the worktree started at 712d1b8, so I ran git checkout --detach f512627. Baseline make check-visualizer at f512627 was green. All sabotage edits were reverted and the tree is clean apart from the node_modules symlink.

Not reproduced (no browser): even with the quotes fixed, the `:is(.vscode-dark, …) .x` descendant rules match through body.vscode-dark. So a pane set to Light inside a dark host still takes the dark overrides, against D57's \"light in a dark one\". Index.css custom properties are not affected.

Not filed:
- hostTheme's closest() includes the pane itself, so the user's explicit choice is read back as the host's. This leaves a stale host for one render after returning to Auto.
- GROUP_PALETTE, '#FFFFFF' icon/ring fills and the blocks.css --block-* palette are different facts, not scheme copies.

Probes are in /private/tmp/claude-501/-Users-jbarzee-go-src-github-com-jmbarzee-temporal-architect--claude-worktrees-elegant-germain-f7e01e/23f13e0e-a0e2-4354-9a83-917eca9b9d67/scratchpad/u6/
- gates: The worktree was detached from 712d1b8 to f512627. Golden claims checked by decoding JSON, and all hold. Tier C's edge-type column is identical on 245 of 245 rows. The 66 graduated rows are all ep-carrying, with 0 on full graphs. byStyleKey is gone. generatedCss loses exactly the 7 typed lines, order kept. The synthetic cases are format-only. Not recorded anywhere: 3 synthetic rows and 115 Tier C rows also change colour. The leak gate measures scheme.ts (2) and useTheme.ts (0); index.css is shipped by lib.ts but unmeasured. scheme.d.ts is emitted but unreachable; exposing it would drag in the private ontology.d.ts, which the gate would catch. edgeStrokeFor's throw is live: under a pair-mode pull axis only it fires, during GraphView render.
- surface: Detached: worktree started at 712d1b8 (main); I ran git checkout --detach f512627 and node_modules is the symlink. Baseline make check-visualizer at f512627 was green (reproduced). All reverts done (git status shows only the untracked node_modules symlink). Chrome experiments used headless system Chrome via CDP against a scratch vite build (outside the repo). Cleared or soft: scheme.ts regexes behave for hex/rgb()/hsl()/names/space-slash forms; MutationObserver cost negligible; edgeStrokes memo is correct (getSimNode stable, visibleEdges keyed on simVersion); NEUTRAL_STROKE unreachable; Tier C edge-type column byte-identical (checked by script). Unverified: VS Code high-contrast-light class (.vscode-high-contrast-light is not in the closest list).
- dist: Detached from 712d1b8 to f512627. All gates reproduced the baseline (tsc, map, surface 90, leak 95, boundary 7, patterns, verify 7/7, build:lib, dts-gate 10 files). No exported type shape changed (VisualizerHost, WorkflowCanvas, protocol, StyleGuide are not in the diff). mountNodeTypeStyles CSS is identical minus the 7 typed lines (golden diff). Nothing in this repo or the dist repo reads .graph-control-typed-* or --color-nexus-*; dist only calls mountNodeTypeStyles(). StyleGuide shows the tree's --block-* palette and follows only the host class. The standalone app mounts styles and sets no theme marker. First-render theme comes from the OS (ref.current is null), seen in the sequence but probably not painted. Browser evidence is headless Chrome on a dist-lib bundle.
- record: headSha is what the worktree started at (712d1b8, main); detached to f512627 per setup. Baseline gates reproduced green. Leak 95 = Unit 7's files 57, residue 6, Unit 6's own files 32. Verified true: 20 screenshots exist (10+10); no spec sentence still says edges inherit source colour; B22/B29/B30 code is gone. CSS and canvas probes used system headless Chrome (OS dark on this machine, which is also how the committed light PNGs went wrong). All sabotage edits reverted; tree clean.
