# Source

Project source, organized as composable modules. The build concatenates these and appends to the upstream HTML panel.

## Layout

```
profile/          Entry point — button injection, modal wiring
stats/            Data layer — IndexedDB queries, stat computation
achievements/     Game logic — registry, unlock rules, level/XP math
render/           Presentation — DOM construction, styling, PNG export
utils/            Shared helpers — DOM, formatting, escaping
```

See [`../docs/architecture.md`](../docs/architecture.md) for the full subsystem map.

## Conventions

- **No `innerHTML` with user-supplied text.** Always use `textContent` or go through `utils/dom.js` helpers.
- **No external network calls.** No fonts, no analytics, no CDNs. If you need a library, vendor it under `vendor/` with its license.
- **All stat computation is pure.** Given the same IndexedDB snapshot, same input → same output.
- **Achievements are declarative.** Add to `achievements/registry.js`, don't hand-roll unlock logic in rendering code.
- **Namespace all CSS** under a single project prefix (TBD — pick when first CSS lands) to avoid bleeding into upstream styles.
- **Namespace all globals** under a single `window.__` object. Gate behind a debug setting.
- **Never modify upstream DOM destructively.** Add, don't replace.

## Status

Empty. The first real source lands in the next feature commit.
