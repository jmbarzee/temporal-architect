# Doc fragment images

Canonical images referenced by the doc fragments in [`../fragments/`](../fragments/).
They are the single source for every published listing's imagery.

Fragments reference images with **relative** paths (e.g. `![...](images/graph-view-system.png)`).
The distribution repo's `render-docs` step rewrites those to **release-pinned
absolute URLs** at publish time:

```
https://raw.githubusercontent.com/jmbarzee/temporal-architect/v<VERSION>/docs/images/<name>
```

so every registry (npm, PyPI, VS Code Marketplace, …) renders the picture that
matches the published version.

## Needed screenshots

Drop real PNGs here and un-comment the matching `<!-- [SCREENSHOT: …] -->`
placeholder in the fragment. Until then the placeholders keep published pages
from showing broken images.

| File | Shot |
|------|------|
| `graph-view-system.png` | Graph View — full system (namespace→worker→workflow) with dependency edges |
| `tree-view-expanded.png` | Tree View — one workflow expanded with inline call expansion |
