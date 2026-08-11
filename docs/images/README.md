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
