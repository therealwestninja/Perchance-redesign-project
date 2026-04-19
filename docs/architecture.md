# Architecture

How the project is organized, how it hooks into upstream Perchance, and
**why** — especially the decisions that look odd out of context.

## What this project is

A fork of Perchance's [ai-character-chat](https://perchance.org/ai-character-chat)
generator that adds a personal profile system: mini-card in the sidebar,
full-screen profile page with bio / details / stats / achievements, all
backed by read-only access to the user's existing chat data.

Additive only — no upstream functionality is removed or destructively
modified.

## Constraints from Perchance

Perchance generators have two zones:

1. **Top generator (DSL)** — plugin imports, list declarations, async functions. Accessed as `root.functionName()` from HTML.
2. **HTML panel** — standard HTML/JS. This is where the chat UI lives.

Upstream source is vendored at [`vendor/perchance-ai-character-chat/`](../vendor/perchance-ai-character-chat/):
- `perchance_1.txt` — top DSL (~690 lines)
- `perchance_2.txt` — HTML panel (~13,600 lines)

### The Perchance subdomain model

Perchance isolates each generator on its own randomly-assigned subdomain,
e.g. `b95e4473dace29730b4433ad33b4c64c.perchance.org/<name>`. The user-facing
editor at `perchance.org/<name>` runs the generator inside a nested
sandboxed `<iframe>` pointing at that subdomain.

What this means for storage:

- **IndexedDB is isolated per generator.** Our fork's subdomain has its
  own `chatbot-ui-v1` database, separate from the official ai-character-chat.
- A user with chat history on the official version has an **empty** DB on
  ours until they start using it.
- First time someone loads our fork, upstream's Dexie creates the DB fresh
  at v90. No migration, no export dialog.
- If we ever want to transfer data between the official version and ours,
  it has to go through the export/import flow.

### What the sandbox allows

- IndexedDB (`chatbot-ui-v1` — stores `characters`, `threads`, `messages`, `misc`, `lore`, and more)
- `localStorage`, `sessionStorage`
- `crypto.subtle`, `CompressionStream` / `DecompressionStream`
- `FileReader`, `Blob`, data URIs
- DOM APIs, `MutationObserver`
- `postMessage` between host and character custom-code iframes

### What the sandbox restricts

- Direct `fetch()` to external domains is CORS-blocked. (Our code does none.)
- Custom code runs in sandboxed iframes with a limited bridge.
- `$meta.dynamic()` can't reference `root.*` or outer-scope variables.

## Source layout

```
src/
  bootstrap.js        Last in bundle; waits for DOM + upstream, calls start()
  manifest.json       Module order for the bundler
  utils/              Pure helpers
    escape.js           HTML escaping
    dom.js              Safe DOM construction
    format.js           Number/date formatting
  stats/              IDB reads + pure stat math
    db.js               Reads via window.db (Dexie) — never opens IDB itself
    queries.js          Pure: stat bundle → derived metrics
  achievements/       Progress logic
    tiers.js            XP/level math
    registry.js         Achievement definitions + criteria functions
    unlocks.js          Given stats, compute unlocked IDs
  render/             UI components
    styles.js           All CSS, injected as <style> block
    overlay.js          Full-screen modal chrome
    section.js          Collapsible/blurrable section wrapper
    splash.js           Above-the-fold hero (the shareable part)
    about_section.js    Freeform bio textarea
    details_form.js     Username, age range, 2D gender picker
    gender_square.js    Draggable 2D picker with touch + keyboard support
    chronicle_grid.js   Fraction-style stat cards
    achievements_grid.js  Tier-colored grid
    mini_card.js        Sidebar mini-card
  profile/            Top-level wiring
    settings_store.js   localStorage schema + migration
    styles_install.js   Inject styles.js output
    mount.js            Watch for #leftColumn and inject mini-card
    full_page.js        Assemble and show the hero overlay on click
    index.js            Orchestrator: start() + refresh loop

vendor/               Baseline upstream Perchance source (untouched)
build/                Output: perchance_1.txt + perchance_2.txt with bundle appended
build/build.mjs       Node stdlib only, no deps
test/                 node:test specs (ESM)
docs/                 This doc
.github/workflows/    CI: npm test + npm run build:check
```

## The build

`build/build.mjs` concatenates files listed in `src/manifest.json` in order,
strips the ESM `import` and `export` keywords, wraps the result in a
single IIFE, and appends that IIFE in a `<script>` tag at the end of
`vendor/perchance_2.txt`.

Everything ends up in **one IIFE scope**. Consequences:

- Every file's top-level `const FOO = ...` lives in one shared scope.
  **Symbol names must be globally unique across all modules.** Duplicate
  `const TIER_ICON` in two files is a silent test-time pass / runtime
  parse-fail. (We hit this once; fix is to export from the primary module
  and import in the other.)
- Functions are hoisted, so call order doesn't matter. Top-level `const`
  initialization order follows manifest order.
- The stripper uses regex — keep `import` / `export` to simple named forms.
  Exotic syntax (`import * as`, `export { x as y }`) may slip through.

Tests load source modules directly as ESM via `node:test`, bypassing the
bundler. This keeps tests fast, but means **bundle-level issues**
(duplicate identifiers, ordering) **aren't caught by tests** — they're
caught by the build's `--check` flag plus a `new Function(bundle)` parse-check.

## Runtime: the script-tag timing trap

**The most important thing to understand in this codebase.**

Perchance's upstream `perchance_2.txt` contains:

```html
<script type="module">   <!-- line ~1994, ~11,600 lines -->
  ... main application logic, top-level await ...
</script>
<script>... 15-line wrap script ...</script>
```

When the bundler appends our `<script>`, browser execution order is:

1. Parser encounters `<script type="module">`. Module scripts are **deferred** — queued, not run yet.
2. Parser continues to the wrap script — inline, runs immediately.
3. Parser reaches **our** appended `<script>` — inline, runs immediately, blocks parsing.
4. Parser finishes the document.
5. Deferred module scripts execute in document order.
6. `DOMContentLoaded` fires.

**Our code runs at step 3, BEFORE upstream's main logic at step 5.**

This bit us hard once. An early version opened its own IndexedDB connection
in step 3. Since Perchance's `window.db` (Dexie) wasn't initialized yet,
our `indexedDB.open('chatbot-ui-v1')` created a fresh empty v1 database on
the fork's subdomain. Then upstream's Dexie ran in step 5, opened what it
thought was an existing v1 user database, tried to upgrade it to v90, and
crashed with `storeNames parameter was empty` trying to migrate an empty DB.

**The rule:**

> Never open IndexedDB directly from our code. Always go through
> `window.db` (Dexie), and wait for it to be ready first.

`src/stats/db.js` reads only via `window.db.<table>.toArray()`.
`src/bootstrap.js` polls for `window.db.characters.toArray` to exist before
calling `start()`.

## Runtime: how our code hooks in

```
User loads the Perchance fork
  ↓
HTML parser runs script tags (see timing section above)
  ↓
Our bundle's IIFE runs — defines all functions/consts, then bootstrap() polls
  ↓
bootstrap polls for (readyState !== 'loading') AND (window.db.characters ready)
  ↓
start() runs, logs '[pf] profile fork active' once
  ↓
mountMiniCard waits for #leftColumn, injects mini-card
  ↓
refresh() reads stats via window.db, updates card view
  ↓
setInterval(30s) + visibilitychange listener keep it fresh
  ↓
User clicks mini-card → openFullPage() builds and shows the hero overlay
```

`window.__perchance_fork__` is the IIFE's namespace object — exposes
`{ __meta: { modules, builtAt } }` for debugging. Everything else is
internal to the IIFE.

### Extension points — selectors we depend on

If upstream changes these, the mount code breaks:

- `#leftColumn` — container for the mini-card
- `#newThreadButton` — sibling reference (mini-card goes before this)
- IndexedDB name `chatbot-ui-v1` and tables `characters`, `threads`, `messages`, `lore`, `misc`

Mount is **additive** — no upstream function is overridden, no upstream DOM
destructively modified.

## Settings storage

Browser `localStorage`, single key `pf:settings`. Shape:

```js
{
  profile: {
    displayName, avatarUrl, titleOverride, bio, username,
    ageRange, genderPos: { x01, y01 }, genderCustom,
  },
  display: {
    sections: {
      about: { collapsed, blurred },
      details: { collapsed, blurred },   // blurred: true by default (privacy)
      chronicle: { collapsed, blurred },
      achievements: { collapsed, blurred },
    }
  }
}
```

`loadSettings()` deep-merges stored data onto current defaults — new
fields added in future versions get defaults without wiping user data.
Also migrates the old `pf:profile` key on first read if present.

## Data access policy

- The stats layer **only reads** from IndexedDB.
- No writes to upstream stores (`characters` / `threads` / `messages` / `lore` / `misc`).
- Achievement unlock state is **computed live** from stats on every render —
  no persistent unlock table, so nothing can drift out of sync.
- No network calls. No telemetry. No external CDN dependencies (including
  fonts — see `render/styles.js` for the system-font stack).
- User settings stay in `localStorage`, scoped to the user's browser on
  our subdomain.

## Design rules to keep

1. **No network calls.** Profile data is local. No analytics, telemetry, remote fonts, or CDN images.
2. **No behavioral conditioning.** No time-gates, streaks-as-punishment, loss aversion, or premium currency. Achievements reward *work*, not *time-on-site*.
3. **No external dependencies beyond what Perchance ships.** Build is Node stdlib only. Runtime piggybacks on Dexie (already loaded by upstream). Tests use `node:test`. No `npm install` needed to contribute.
4. **Upstream-compatible.** We don't edit `vendor/`; we only append to the bundled copy in `build/`. Pulling fresh upstream is a drop-in replace.
5. **Fail safe, not loud.** Any IDB/storage failure returns empty values and logs at most one warning. The mini-card always renders *something*.

## Upstream sync workflow

When upstream `ai-character-chat` ships a new release:

1. Fetch the latest `perchance_1.txt` and `perchance_2.txt` from the Perchance editor
2. Drop into `vendor/perchance-ai-character-chat/`, commit as `vendor: sync upstream YYYY-MM-DD`
3. Re-run `npm run build`. If mount selectors changed, fix `src/profile/mount.js`
4. Verify the extension points listed above still resolve
5. Smoke-test in Perchance editor with a throwaway character
6. Publish

## Testing

- **Unit tests** for pure functions in `stats/`, `achievements/`, `utils/`, `profile/settings_store.js` — fast, Node, no DOM
- **Integration-ish tests** for `stats/db.js` — mock `window.db` with fake Dexie tables, verify read fan-out and fault isolation
- **Build self-check** (`npm run build:check`) — verifies source→bundle is deterministic and the bundle parses as valid JS
- **CI** (`.github/workflows/ci.yml`) — runs both on every push + PR, Node 20+

What we **don't** have:

- Browser-level integration tests (would need jsdom or Playwright)
- Testing of the DOM render modules (`render/*` above mini-card)
- Screenshot/visual regression

These would catch more, but they'd pull in real dependencies and fight with
the "no npm install needed" goal. For now we rely on bundle parse-check +
manual smoke in the Perchance editor before each push.

## Debugging in the Perchance iframe

Our bundle runs inside the **`outputIframeEl` iframe**, not the top-level
Perchance editor page. The iframe is on a cross-origin subdomain (see
"The Perchance subdomain model" above), which means:

**`window.__perchance_fork__` is only accessible from inside the iframe's
JS context.** Typing it into the top-level page's DevTools console
returns `undefined`, because CORS prevents the parent page from
reaching into the iframe's `window`.

### How to switch DevTools into the iframe context

Chrome/Edge:
1. Open DevTools (F12)
2. Click the **context dropdown** at the top-left of the Console panel
   (it defaults to `top`)
3. Select the entry that matches the generator subdomain — looks like
   `b95e4473dace29730b4433ad33b4c64c.perchance.org` or similar
4. Now `window.__perchance_fork__` resolves

Firefox:
1. Open DevTools
2. Click the **iframe picker** icon in the toolbar (two-squares icon,
   sometimes labeled "cd [iframe]")
3. Pick the generator subdomain frame

Safari:
1. Develop menu → frame selector → pick the subdomain frame

### What you can do once you're in the right context

```javascript
window.__perchance_fork__
// → { __meta: {modules: N}, openMemory: ƒ, ... }

window.__perchance_fork__.openMemory()
// Opens the Memory/Lore window

document.querySelectorAll('.pf-mem-bubble').length
// Count rendered bubbles

window.memoryOverrides
// NOT exposed. Override state is module-local. To inspect, add
// a temporary debug exposure in window_open.js and rebuild.
```

### How this wasted days of development

During commits 7a and 7b this exact issue caused multiple debugging
rounds. Claude would tell a user "run this diagnostic in the console,"
the user would report it returned `undefined`, and Claude would
conclude the bundle wasn't loading. The actual problem was that the
user was running commands in the WRONG context.

**Lesson for future sessions:** if a user reports `window.__perchance_fork__`
is undefined, first question is always "is your DevTools context set
to the iframe?" — not "is the bundle loading?"

### What context switching does NOT fix

- **Inspecting iframe DOM from the parent page's Elements panel.**
  Clicking on our bundle's DOM in the parent's Elements tab works
  (you can see `<div class="pf-mem-panels">` etc.), but selecting it
  DOESN'T switch the Console context. Use the console dropdown.

- **Running `$0` against iframe elements from parent context.**
  `$0` refers to the last Elements-tab selection but stays in the
  current Console context. If you clicked something inside the iframe
  but your context is `top`, `$0` will resolve in `top` — and probably
  fail or return wrong results.

- **Persisted breakpoints survive across iframe reloads.** But the
  context selector resets to `top` when you refresh. After a reload,
  re-select the subdomain frame before expecting the bundle's
  symbols to be available.

## Common mistakes to avoid

- **Don't debug from the wrong DevTools context.** Our bundle lives inside the `outputIframeEl` iframe, which is on a cross-origin subdomain. `window.__perchance_fork__` is `undefined` in the top-level page. See the "Debugging in the Perchance iframe" section above for the fix.
- **Don't open `indexedDB` directly.** Always use `window.db.<table>.toArray()`. If you must open raw IDB for something Dexie doesn't expose, do it only AFTER confirming `window.db` is ready.
- **Don't rely on module order for `const` initialization.** Keep top-level symbol names globally unique across all modules.
- **Don't assume `DOMContentLoaded` = upstream ready.** Upstream's main script is deferred and may run before OR after DOMContentLoaded depending on browser. Wait on `window.db` instead.
- **Don't write to `localStorage` from top-level module code.** Storage APIs can throw (disabled, quota, private mode). Use `settings_store.js` — it swallows errors.
- **Don't introduce external npm dependencies.** Adds install burden, upstream-sync complexity, CDN risk.
