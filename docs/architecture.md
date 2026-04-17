# Architecture

This document describes how the project is organized, how the Perchance generator model constrains the design, and how the build pipeline (once written) will turn modular source into a pasteable Perchance generator.

## Constraints from Perchance

Perchance generators have two zones:

1. **Top generator (DSL)** — plugin imports, list declarations, async functions. Accessed as `root.functionName()` from HTML.
2. **HTML panel** — standard HTML/JS. This is where the chat UI lives.

The full upstream source of both zones is in [`vendor/perchance-ai-character-chat/`](../vendor/perchance-ai-character-chat/):
- `perchance_1.txt` — top DSL (~690 lines)
- `perchance_2.txt` — HTML panel (~13,600 lines)

### What the sandbox allows

- IndexedDB (`chatbot-ui-v1` — stores `characters`, `threads`, `messages`, `misc`, `lore`, etc.)
- `localStorage`, `sessionStorage`
- `crypto.subtle`, `CompressionStream` / `DecompressionStream`
- `FileReader`, `Blob`, data URIs
- DOM APIs, `MutationObserver`
- `postMessage` between host and character custom-code iframes

### What the sandbox restricts

- Direct `fetch()` to external domains is CORS-blocked. Use `root.superFetch()` only when genuinely necessary.
- Custom code runs in sandboxed iframes with a limited `characterPropertiesVisibleToCustomCode` bridge.
- `$meta.dynamic()` cannot reference `root.*` or outer-scope variables — it must be fully self-contained.

### What this project adds

Additive only. We do not remove upstream features. New modules attach to the existing generator at defined extension points (described below).

## Subsystem Map

```
┌─────────────────────────────────────────────────────────────┐
│                   Perchance AI Character Chat               │
│                      (vendored upstream)                    │
├─────────────────────────────────────────────────────────────┤
│  boot │ storage │ UI │ chat │ AI │ summary │ sandbox │ share │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ (read-only data access via Dexie)
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Project additions                         │
├─────────────────────────────────────────────────────────────┤
│  profile/  │  stats/   │  achievements/  │  render/         │
│  ────────     ─────        ────────────     ────────        │
│  entry pt     compute       registry        card DOM        │
│  button       queries       unlocks         PNG export      │
│  modal        aggregation   tiers           theming         │
└─────────────────────────────────────────────────────────────┘
```

Additions live in `src/` and get assembled by the build into blocks appended to the upstream files.

## Source Layout

```
src/
  profile/          Entry point: button injection, modal open/close, top-level wiring
    mount.js          Injects the Profile button into the existing chat UI
    modal.js          Floating-window container for the card
    index.js          Public API — exposed as root.profileCard or similar
  stats/            Pure data-layer: reads from IndexedDB, computes derived stats
    db.js             Dexie/IDB access layer (read-only)
    queries.js        Stat computation functions (words, threads, characters, etc.)
    aggregate.js      Stat bundling — the object passed to render
  achievements/     Achievement logic
    registry.js       Definition of all achievements (id, name, description, criteria fn)
    unlocks.js        Given a stat bundle, compute unlocked achievement IDs
    tiers.js          Level math — given total XP, return level + progress
  render/           Presentation layer — DOM and styling
    card.js           Main card DOM construction
    hero.js           Above-the-fold hero section
    fractions.js      Fraction-stat grid
    stars.js          Star-rating rows
    list.js           Recent-unlocks list
    styles.js         All CSS, injected as a <style> block (scoped to card IDs)
    theme.js          Light/dark/custom theming
    png.js            html2canvas-like export (implemented locally — no external deps)
  utils/            Shared helpers
    dom.js            Safe DOM construction (no innerHTML with user text)
    format.js         Number formatting, date formatting
    escape.js         HTML escaping
```

## Build Model

The build concatenates source files in a deterministic order, wraps them in an IIFE, and appends the result to the end of the upstream `perchance_2.txt`. It does **not** modify upstream source in place — the combined output is written to `build/` as a new file.

```
                    (input)
                       │
   ┌───────────────────┼───────────────────┐
   │                   │                   │
   ▼                   ▼                   ▼
vendor/perchance_1.txt  src/**/*.js   vendor/perchance_2.txt
                       │
                       │ build/build.js
                       ▼
               ┌───────────────┐
               │   assemble    │
               └───────┬───────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
   build/perchance_1.txt   build/perchance_2.txt
   (top DSL, copied as-is  (upstream panel + project
    unless we add list defs) extension appended inside
                             a single namespace IIFE)
```

At release time: copy each `build/perchance_*.txt` into the corresponding Perchance editor zone, save, test, publish.

## Data Access Policy

- The stats layer **only reads** from IndexedDB. It does not write.
- Achievement unlock state **may** be persisted to a new IndexedDB store (`project_profile_state`), kept in a separate store so we never conflict with upstream data.
- Nothing is written to the upstream `characters` / `threads` / `messages` / `lore` / `misc` stores.
- No network calls. No telemetry. No external CDN dependencies (including fonts — see `render/styles.js` for the system-font stack).

## Extension Points

The build attaches to the upstream generator at these points:

1. **End of HTML panel (after upstream `</script>`)** — inject a new `<script>` block containing the bundled project modules, wrapped in an IIFE that populates `window.__perchance_fork__`.
2. **`#leftColumn` — sidebar, before the new-chat-button row** — inject the mini-card as the first child of the left column (line 1749 in vendored source). Sibling to the `#newThreadButton` row, always visible when the sidebar is open.
3. **Stylesheet** — inject a `<style>` block inside the same script bundle (styles scoped to our own class prefix to avoid leaking into upstream).

No upstream function is overridden. No upstream DOM is modified destructively. Everything is additive.

### Selector anchors we depend on

If any of these change upstream, the mount code breaks and needs updating:

- `#leftColumn` — mount container for the mini-card
- `#newThreadButton` — sibling reference; mini-card goes before this button's row
- IndexedDB name `chatbot-ui-v1` and object store names `characters`, `threads`, `messages`, `lore`

A smoke checklist in `docs/smoke-checklist.md` (future) will verify these anchors still exist after each upstream sync.

## Upstream Sync

When upstream `ai-character-chat` ships a new release:

1. Fetch the latest `perchance_1.txt` and `perchance_2.txt` from the Perchance editor
2. Drop them into `vendor/perchance-ai-character-chat/`, commit as "vendor: sync upstream YYYY-MM-DD"
3. Re-run the build. If it breaks, extension points may have moved — fix in `src/profile/mount.js`
4. Smoke-test in Perchance editor with a throwaway character, release

## Testing

Test strategy lands in a later commit alongside the first real code. High-level plan:

- **Unit tests** for pure functions in `stats/`, `achievements/`, `utils/` — run in Node, no browser needed
- **Contract tests** for extension points — verify the assembled output still contains upstream sentinels we depend on
- **Manual smoke checklist** — a `docs/smoke-checklist.md` the user walks through before each Perchance release

No CI is set up yet. That comes when there's code worth testing.
