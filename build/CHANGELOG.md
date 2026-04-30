# Memory Hero — HNE & AI Slideshow Ports + Blue with Gold Trim

> **🛠 Bugfix (latest)** — The slideshow CSS rule `body > *:not(.pf-bgss-container) { position: relative; z-index: 1; }` (added in the AI Slideshow round) was breaking the Profile and Memory & Lore modals. See the **Bugfix history** section at the end of this file for the full root-cause analysis and the corrected layering strategy.

This update lands a substantial enrichment from the HNE and AI Slideshow projects, with the goal of broadening Memory Hero's user-facing capabilities. Concretely:

1. **Selected HNE patterns** ported into Memory Hero — favicon swap, fresh sensory anchors, community packs, slash commands, and the public-plugin export pattern.
2. **AI Slideshow chat background** — chat backdrop as a live AI-generated slideshow. Soft Ken Burns effect (never static between transitions), plus 4 alternate transitions (crossfade, slow zoom, blur fade, parallax pan), 12 style preset chips, and a streaming AI prompt enhancer.
3. **AI character portraits** — one-tap 🖼️ generation of avatar portraits for any character that lacks one, via `textToImagePlugin`. Saves back into the character record.
4. **"Reimagine in character's voice"** — 🎭 button on every chat message that streams a rewrite via `aiTextPlugin` matching the active character's tone, vocabulary, and cadence.
5. **🐞 Bug-report surface** — first-class button that gathers browser/storage info via the already-imported `bug-report-plugin` and copies it to clipboard (with a fallback modal for browsers without `navigator.clipboard`).
6. **"Blue with gold trim" UI palette** — navy primary/secondary defaults, gold/amber accent kept as the trim.

The deliverables in this folder (`memory_hero_1.txt`, `memory_hero_2.txt`) are the **built** files — drop-in replacements for the live Perchance editor.

If you want the changes mirrored back into your `src/` tree (so the next `build/build.mjs` run produces the same output), the section "Source-tree mirror" at the bottom maps every edit to its source location.

---

## What's new in the bundle

### `memory_hero_1.txt` (top DSL)

- **New plugin imports**
  - `faviconPlugin = {import:favicon-plugin}` — used by `chat/character_favicon.js`.
  - `dynamicImport = {import:dynamic-import-plugin}` — used by `chat/community_packs.js`.

- **New `slashCommands` block** under `defaultCommentOptions`:
  ```
  /character    👤 sharing a character: …
  /share        🔗 sharing a thread / chat: …
  /quest        ⚔️ today's quest: …
  /memory       💎 memory tip: …
  /lore         📜 lore tip: …
  /tip          💡 tip: …
  /achievement  🏆 achievement unlocked: …
  ```
  Adapted from HNE's `commentOptions.slashCommands`. Chat-domain commands rather than session-config ones.

- **`freshSeeds(opts) → string[]`** — new public top-level function exposing a curated 50+ phrase sensory anchor corpus tagged across 12 chat-relevant categories (adventure, mystery, romance, conflict, reflection, discovery, atmosphere, character, place, dialogue, sensory, emotional). Adapted from HNE's `freshSeeds` (perchance_1.txt L277–372). Other Perchance generators can import it as `root.memHero.freshSeeds(...)`.

- **`communityPacks` list** — empty scaffold ready for `dynamicImport(...)` registrations. Adapted from HNE's `communityPacks` lane.

- **"IMPORTING MEMORY HERO AS A PERCHANCE PLUGIN"** doc block — full HOW-TO, EXPOSED FUNCTIONS, EMBEDDING, CONTRIBUTING sections, modeled on HNE's same doc block. Lets other Perchance authors discover and call your exports.

### `memory_hero_2.txt` (HTML pane bundle) — seven new modules

All seven are inserted just before `bootstrap.js` and run via a tiny self-bootstrap IIFE. They DON'T require any edit to `start()` in `profile/index.js` — they self-init on `DOMContentLoaded`. (When mirroring to `src/`, you can keep the self-bootstrap or move the init calls into `start()`; both are idempotent.)

#### `chat/character_favicon.js`
- Swaps the browser-tab favicon to the active character's avatar while a thread is open. Reverts on thread close / page navigation.
- Adapted from HNE's session-favicon swap. Robust strategy: polls the rendered chat DOM every 1.5s for the first character avatar img; doesn't reach into upstream's private state.
- Pauses while `document.hidden` (no point updating an icon nobody can see).
- Prefers `root.faviconPlugin.set(url)` when available; falls back to direct `<link rel="icon">.href` mutation.

#### `chat/fresh_anchors.js`
- Exposes `window.__memHero_freshAnchors(profileTags, n)` and `window.__memHero_freshAnchorsFragment(profileTags, n)`.
- Calls `root.freshSeeds(...)` with a session-scoped 8-slot rotation memory (so the same phrase doesn't appear back-to-back).
- **Opt-in by design** — the chat path does NOT auto-inject anchors into AI prompts. The helper is just available; wiring it into your prompt assembly is a separate, deliberate step. Returns `[]` / `""` if `root.freshSeeds` isn't loaded (safe no-op).

#### `chat/community_packs.js`
- Exposes `window.__memHero_loadCommunityPacks()` returning `{characters, lore, prompts, packMeta}`.
- Lazy-fetches all packs registered in `communityPacks` (memory_hero_1.txt) on first call; caches the result; concurrent calls share the same in-flight Promise.
- Tolerates two pack shapes: array-of-JSON-strings and Perchance numeric-keyed object lists. Coerces both into uniform entry objects.
- Surfaces per-pack failures to `console.warn` without killing the others.
- `window.__memHero_invalidateCommunityPacks()` available for manual cache reset.

#### `chat/bg_slideshow.js` (extended in this round)
- Live AI-generated chat background slideshow with a **soft Ken Burns effect**: every image slowly zooms ~6% and pans ~1.5% over its full dwell interval, so they're never static between crossfades.
- Adapted from `perchance.org/ai-slideshow` — same dual-slide crossfade pattern, same strict `{prompt, negative}` plugin contract (extra fields would route through Perchance's DSL evaluator and throw on user input — AI Slideshow's hard-won lesson).
- **Now 5 transitions, not just Ken Burns** — Ken Burns weighted ~60%, plus pure crossfade, slow zoom-in, blur fade, parallax pan. Pre-expanded weighted picker avoids on-the-fly weight math in the hot path. Each variety transition tuned for backdrop use (no flash-to-black, no 100%-translate effects, calm motion).
- **Style preset chips** (NEW) — 12 toggle-able chips across atmosphere (Misty / Twilight / Aurora / Cosmic), nature (Forest / Ocean / Mountains / Meadow), and style (Watercolor / Oil paint / Film / Long exposure). Click to append the style fragment to your prompt; click again to remove. Active chips are amber-tinted and persist across reloads via `state.activeStyleIds`. Adapted (and trimmed) from AI Slideshow's `STYLE_PRESETS`.
- **Prompt enhancer** (NEW) — ✨ short and ✨+ medium buttons stream an aiTextPlugin rewrite into the prompt textarea. Token-based cancellation: clicking the button while running stops the stream and restores the original. Adapted verbatim from AI Slideshow's `runEnhance` (perchance.org/ai-slideshow ~L2693). Falls back gracefully when `aiTextPlugin` isn't loaded.
- **↺ restore-default** button to snap the prompt back to the soft cinematic default in one click.
- **Tuning differences from AI Slideshow** (because this is background, not foreground): zoom 18% → ~6%, pan ~3% → ~1.5%, default opacity 0.35 + navy gradient overlay tint matching `--pf-theme-primary`. Cap of 8 cached images (in-memory only — no IndexedDB persistence; keeps storage budget for chat history).
- Mounts as a `position: fixed` body-level container behind everything (`z-index: 0`). Body's other children get `z-index: 1` from a single CSS rule so app chrome floats above cleanly.
- Storage: `settings.chatBgSlideshow = { enabled, prompt, intervalSec, opacity, activeStyleIds }`. Coexists peacefully with the existing static `settings.chatBackground`.

#### `chat/character_portraits.js` (NEW)
- Adds a **🖼️ button** to the chat header that generates an AI portrait for the *active thread's character* via `textToImagePlugin`.
- Adapted from HNE's "persona portrait grid hydration" pattern. Builds a portrait prompt by combining a neutral framing template (`portrait of <name>, character study, head and shoulders, soft natural lighting, neutral background, painterly`) with the first 280 chars of the character's `roleInstruction` — long behavioural rules trimmed away because they aren't useful for an image model.
- Strict `{prompt, negative}` contract; negative includes `deformed face, distorted anatomy, extra limbs, multiple subjects, frame, border` for cleaner portraits.
- On success, persists the dataUrl back into the character record via `window.db.characters.update(id, { avatarUrl: dataUrl })`. The chat re-renders with the new avatar without a reload.
- Reads the active character via `window.activeThreadId` first, falling back to `.thread.selected[data-thread-id]` DOM scraping. Robust to upstream DOM refactors.
- Visual feedback states: ⏳ generating, ✅ success, ⚠ failure, then reverts after ~1.8s.
- Exposes `window.__memHero_generatePortraitFor(character)` for programmatic use (e.g. a future "hydrate all" batch script).

#### `chat/reimagine.js` (NEW)
- Adds a **🎭 button** to every rendered chat message — clicking rewrites that message in the active character's voice via `aiTextPlugin`, preserving meaning while matching their tone, vocabulary, cadence, and emotional register.
- Adapted from HNE's "✨ Reimagine in your guide's voice" pattern (HNE applies it to custom session blocks; we apply it to chat messages — broadly applicable to roleplay use cases).
- Uses a strict instruction template: "ROLE: Skilled prose stylist. ACTION: Rewrite ... preserving meaning ... matching their tone ... Same approximate length. FORBIDDEN: explanatory preamble, quotes around the result, narration about what you changed."
- **Live persistence** — once rewritten, the new text is written back via `db.messages.update(id, { content })` so it sticks across reloads.
- **MutationObserver-based mounting** — decorates messages as they're rendered. Tries multiple selector flavors (`.message`, `.chat-message`, `[data-message-id]`) so it works against upstream variations.
- Visual feedback states: ⏳ working, ✅ done, ⚠ no character / failure.
- Exposes `window.__memHero_reimagineText(text, character)` for programmatic use.

#### `chat/bug_report.js` (NEW)
- Adds a **🐞 button** to the chat header that copies a bug-report summary to clipboard.
- First-class path: calls `root.bugReport()` (the already-imported `bug-report-plugin`) for browser version, viewport, storage limits, etc.
- Defensive fallback when the plugin isn't available: assembles a minimal report ourselves (User-Agent, language, viewport, pixel ratio, online status, page load time, cookies enabled, Storage Estimate API result), formatted as markdown.
- Clipboard path: `navigator.clipboard.writeText(report)`. Older browsers / `file://` origins / missing API → falls back to a modal with a selectable textarea + "Close" button.
- Surfaces the bugReport plugin that was previously imported but never UI-mounted — closing the loop on Round 2's "What I deliberately didn't port" follow-up note.

### `memory_hero_2.txt` — Blue with gold trim palette

Default theme defaults now ship as navy:

| Channel | Old | New |
|---|---|---|
| `primary` (page base) | `#0d1117` (GitHub dark) | `#0d1b2e` (deep navy) |
| `secondary` (card mid) | `#161b22` (GitHub mid) | `#142847` (warm navy) |
| `secondary-light` (hover/lift) | `#1f2630` | `#1e3a5f` (lighter navy) |
| `accent` (the trim) | `#d8b36a` amber | `#d8b36a` amber — **unchanged** |

Updated in **5 places** so first-paint, post-paint, share-cards, and reset-to-default all match the new look:

- `THEME_DEFAULTS` const (`profile/full_page.js`, ~line 38488 of the bundle)
- `var(--pf-theme-primary, …)` fallbacks — 17 sites in `render/styles.js`
- `var(--pf-theme-secondary, …)` fallbacks — 19 sites in `render/styles.js`
- `var(--pf-theme-secondary-light, …)` fallbacks — 7 sites in `render/styles.js`
- `openShareViewer` rendering fallbacks (`render/share_viewer.js`)
- `COLOR_GRID` `def:` values for the picker reset button (`profile/full_page.js`)
- Settings-store schema doc comments (`profile/settings_store.js`)
- Share-code build fallbacks (`profile/index.js` shareUrl build path)

The accent stays gold/amber — that **is** the gold trim. Users who unlock and pick the literal `gold` accent (`#ffc832`) get the full navy-and-gold royal/heraldic look. Users on the default amber get a navy-and-amber coastal feel. Both work.

---

## Source-tree mirror

If you re-run `build/build.mjs` from `src/` afterwards, mirror these edits back to source so the build keeps producing this output. Approximate paths (your `src/manifest.json` is authoritative):

| Bundle change | Source file |
|---|---|
| New imports + slashCommands + freshSeeds + communityPacks + "IMPORTING…" doc | `perchance_1.txt` (top DSL — not from src/, paste directly) |
| `chat/character_favicon.js` | new `src/chat/character_favicon.js` — register in `src/manifest.json` after `chat/voice.js` |
| `chat/fresh_anchors.js` | new `src/chat/fresh_anchors.js` — register near other chat helpers |
| `chat/community_packs.js` | new `src/chat/community_packs.js` — register before `bootstrap.js` |
| `chat/bg_slideshow.js` (extended) | `src/chat/bg_slideshow.js` — supersedes the previous version. Includes new `TRANSITIONS` catalog, `STYLE_PRESETS`, `ENHANCE_INSTRUCTIONS`, `runEnhance`, chip rendering, and `composedPrompt()` |
| `chat/character_portraits.js` (NEW) | new `src/chat/character_portraits.js` — register near `chat/char_cards.js` (logical grouping) |
| `chat/reimagine.js` (NEW) | new `src/chat/reimagine.js` — register near `chat/message_controls.js` (it adds per-message decoration) |
| `chat/bug_report.js` (NEW) | new `src/chat/bug_report.js` — register near end of chat/* group |
| `chat/_self_bootstrap.js` | optional — keep if you want self-init, or delete and add `try { initCharacterFavicon(); initFreshAnchors(); initCommunityPacks(); initBgSlideshow(); initCharacterPortraits(); initReimagine(); initBugReport(); } catch {}` to `start()` in `src/profile/index.js` |
| `THEME_DEFAULTS` navy values | `src/profile/full_page.js` |
| `COLOR_GRID` `def:` values | `src/profile/full_page.js` |
| `var(--pf-theme-…, fallback)` updates throughout the stylesheet | `src/render/styles.js` |
| `openShareViewer` fallbacks | `src/render/share_viewer.js` |
| Settings-store doc comments | `src/profile/settings_store.js` |
| Share-card build fallbacks | `src/profile/index.js` (or wherever `toShareViewModel` is built) |

---

## What I deliberately didn't port from HNE / AI Slideshow

To keep this update scoped, I left the following patterns out — they're either chat-irrelevant or would be a much larger undertaking:

- **Hypnosis-specific machinery** (susceptibility brief, soundscapes, visualizers, phase-locked entrainment) — domain mismatch.
- **HNE's full `$meta.dynamic` share-link previewer** (preset/program lookups). Memory Hero already has a working `$meta.dynamic` for character share links; extending it to a richer preview map is a follow-up.
- **HNE's PerDB cloud accounts + presence beacon + comments avatar identicons** — these are valuable and architecturally clean, but each is a multi-module project on its own. Worth doing as a dedicated round.
- **AI Slideshow's gallery / favorites / lightbox** — Memory Hero is a chat app; a persistent generated-image gallery is a separate feature surface. The bg_slideshow's in-memory cache is intentionally ephemeral for that reason.
- **AI Slideshow's IndexedDB image cache** — same reason. Chat history is the priority for storage budget; bg images regenerate cheaply.
- **AI Slideshow's PROMPT_IDEAS shuffle / "🎲 random idea" button** — could be a nice future add (~30 lines), but the style-preset chips already cover most of the cold-start "what should I type" anxiety.
- **HNE's adaptive Director / A/B experiments / annual review screen** — chat-relevant adapter would need its own design pass.
- **Batch portrait generation across the whole library** — `chat/character_portraits.js` exposes `window.__memHero_generatePortraitFor` so a future "hydrate all" script is straightforward (~30 lines: iterate `db.characters.toArray()`, skip those with `avatarUrl`, throttle to 1-2 parallel).

---

## Smoke test before deploying

Before pushing live, sanity check these:

1. **First load of a fresh browser** (clear IndexedDB) — page should boot to navy + gold, not the old GitHub-dark + gold.
2. **Open a thread** — favicon in the tab should swap to the character's avatar within ~2s.
3. **Open the color picker** in Profile → reset Primary → reset Secondary — should snap back to navy values, not the old gray ones.
4. **In another generator** — try `myAlias = {import:<your-slug>}` and call `root.myAlias.freshSeeds({n:3})` — should return 3 phrases.
5. **In the comments channel** — type `/character my_link_here` — should post `👤 sharing a character: my_link_here`.
6. **🎬 Slideshow** — click the 🎬 button → toggle "Enable image slideshow" → wait ~10–15s for the first generation. Image should fade in, then drift / zoom over its dwell. Wait for several advances and confirm a mix of transitions (Ken Burns ~60%, others ~40%). Toggle off → slideshow vanishes; toggle on → resumes from cached images instantly.
7. **🎬 Style chips** — click "Forest" + "Watercolor" → click "🗑 Clear (N)" → click "+ Generate" → the new image should reflect those styles (warm forest tones, painterly look). Click the chips again to remove them.
8. **🎬 ✨ Enhance** — type a sparse prompt like `"rainy alley"` → click ✨ → text should stream-rewrite into a richer prompt. Click ✨ again while running to cancel and revert.
9. **🖼️ Portrait** — open a thread for any character without an avatar → click 🖼️ in the chat header → wait ~10–15s → on success, button shows ✅ and the character avatar in upstream's UI updates after the next render.
10. **🎭 Reimagine** — hover any chat message → click the 🎭 button → message text should be replaced by a rewrite in the active character's voice (preserving meaning). Reload the page; the rewritten version should persist.
11. **🐞 Bug report** — click the 🐞 button → button shows 📋 → paste into a text editor → confirm you see User-Agent / viewport / storage info as markdown.
12. **No console errors at boot** — all seven new modules should self-init silently. Modules that depend on plugins (`faviconPlugin`, `textToImagePlugin`, `aiTextPlugin`, `bugReport`) silently fall back / no-op when those plugins haven't loaded yet.

---

## Bugfix history

### 2026-04-29 — Slideshow CSS broke Profile & Memory & Lore modals

**Reported symptoms:**

1. Profile and Memory & Lore popup modules don't expand to fill the screen vertically (cut off / collapsed to content size).
2. Their themed background (Profile color picker primary/secondary) was no longer rendering — slideshow imagery showed through where the modal panel should have been opaque.

**Root cause:**

The AI Slideshow round added this rule to `chat/bg_slideshow.js`'s `injectCSS()`:

```css
body > *:not(.pf-bgss-container) { position: relative; z-index: 1; }
```

It was meant to lift app chrome above an at-`z-index: 0` slideshow. The intent was right; the implementation was a sledgehammer.

**Why it broke things — CSS specificity:**

| Selector | Specificity |
|---|---|
| `body > *:not(.pf-bgss-container)` | 0,1,1 (1 type + 1 class for the negation argument) |
| `.pf-overlay { position: fixed; z-index: 10000; }` (Profile / Memory & Lore root) | 0,1,0 |

The broad rule **outranks** `.pf-overlay`. CSS resolves per-property, so:

- `position: fixed` (modal) → overridden to `position: relative` → modal collapses to its content size; `inset: 0` no longer anchors it to the viewport. **This is the vertical cut-off.**
- `z-index: 10000` (modal) → overridden to `z-index: 1` → modal can no longer escape any ancestor stacking context. **This is why themed bg "leaks" to slideshow** — the modal's solid panel renders at an unintended z-layer where the slideshow shows through.

The original fix-comment even said *"we don't blanket-set position:relative on every element (would break layouts)"* — and then did exactly that. Self-contradictory and the smoking gun.

**Fix applied:**

The slideshow's CSS is now minimal and touches only `html`, `body`, and its own classes:

```css
html { background-color: var(--pf-theme-primary, #0d1b2e); }   /* page bg shown when slideshow is OFF */
body { background-color: transparent !important; }              /* lets slideshow show through when ON */
.pf-bgss-container { position: fixed !important; inset: 0; z-index: -1; ... }
.pf-bgss-slide   { ... }
.pf-bgss-overlay { ... }
```

Key change: **slideshow z-index moved from `0` to `-1`**.

Painting order (CSS spec):
1. Stacking context background/borders
2. **Negative z-index descendants** ← slideshow paints here
3. Non-positioned block descendants
4. Floats
5. Non-positioned inline descendants
6. Positioned z:auto/0 descendants
7. **Positive z-index descendants** ← modals (z:10000) paint here

With slideshow at `-1`, every other element — positioned or not, with any z-index — paints above it without us having to touch their CSS. The Profile and Memory & Lore modals (`position: fixed; inset: 0; z-index: 10000`) work exactly as their original CSS intends.

The `html` background ensures the page still has the navy theme color when the slideshow is OFF (since body is now transparent). When the slideshow is ON, it paints between html bg and body content.

**Files changed:**

- `memory_hero_2.txt` — `chat/bg_slideshow.js` `injectCSS()` rewritten. Old behavior described in a doc comment so the trap doesn't get re-introduced.

**Source-tree mirror:**

- `src/chat/bg_slideshow.js` — replace `injectCSS()` body with the new CSS string.

**Smoke test for the fix:**

1. Reload the page with slideshow OFF — page bg is navy (theme primary).
2. Open Profile (or Memory & Lore) — modal fills the viewport vertically, with the themed (navy + gold trim) panel as background, NOT slideshow imagery.
3. Toggle slideshow ON — slideshow renders behind everything; opening Profile or Memory & Lore still shows the themed panel correctly (slideshow is hidden under the modal).
4. Close modals → slideshow visible again.
5. No regressions to z-index of other UI surfaces (toasts, dropdowns, popovers, tooltips).

### 2026-04-29 — `memory_hero_1.txt` title/description refresh

The `$meta.dynamic` defaults still advertised only the original Memory Hero scope (memory & lore management, achievements, daily quests). Three rounds of feature work later, that copy was significantly out of date — Discord / Slack / iMessage previews and Perchance's own gallery listing weren't reflecting AI image backgrounds, character portraits, the Reimagine button, the public plugin export, slash commands, or the navy palette.

**Changes:**

1. **Refactored** the title/description out of two duplicate inline literals (the `defaults` object and the `?char=assistant` early-return) into named variables `defaultTitle` + `defaultDesc` at the top of `$meta.dynamic`. Both branches now reference the variables — single source of truth, next refresh only needs one edit.
2. **New title** — leads with "AI Character Chat with advanced memory & lore management" and lists the headline new capabilities (AI image backgrounds, AI character portraits, gamified progression). Trust markers (free, no sign-up, unlimited) at the end.
3. **New description** — long-form parallel-structure feature dump matching HNE's convention. Covers all features added across rounds: live AI-generated chat backgrounds + 5 transitions + 12 style chips + prompt enhancer, one-tap character portraits, Reimagine, character-favicon swap, hero profile + 24 unlockable accents, hierarchical 3-tier memory + semantic recall, community packs via `dynamicImport`, public plugin export of `freshSeeds`, slash commands, one-click bug report, blue-with-gold-trim palette, browser-only data.
4. **Inline doc comment** added above the variables explaining where these values surface (link previews, Perchance gallery, search engines) and instructing future updates to edit HERE.

The named-character branch (`urlNamedCharacters[char]`) was NOT touched — its `character.metaTitle` / `character.metaDescription` fallback (with `Chat with the ${name} AI character...`) is correct for shared character links and surfaces the character's own description, which is what someone clicking a share-link wants to see.

**Files changed:** `memory_hero_1.txt` (`$meta.dynamic` block).

**No source-tree mirror needed** — `memory_hero_1.txt` is the top DSL pasted directly into the Perchance editor, not built from `src/`.

**Verification:** Old phrase "Memory Hero - An advanced Memory" → 0 hits; new phrase → 1 hit; `title: defaultTitle` and `description: defaultDesc` → 2 hits each (both branches); `node --check` on the extracted `$meta.dynamic` JS body parses cleanly.

### 2026-04-29 — Social-share preview image

Added an `image` field to `$meta.dynamic`'s default return so Discord, Slack, iMessage, Twitter, and Perchance's own gallery now have a tailored preview card (Open Graph / Twitter card image) instead of falling back to a generic placeholder or showing nothing.

**URL:** `https://user.uploads.dev/file/8008f6b4fd32a8e0908aed527132cb20.jpg`

**Pattern:** Same DRY pattern as `defaultTitle` / `defaultDesc` — extracted to a `defaultImage` variable, referenced in both the `defaults` object AND the `?char=assistant` early-return so the bare URL and the canonical assistant URL both surface the same card. The named-character branch (`?char=ai-adventure`, etc.) intentionally NOT changed — it correctly uses `character.metaImage || character.avatarUrl` so shared character links surface the character's own portrait.

**Verification:** URL count = 1 (single source of truth); `image: defaultImage` appears in 2 branches (`defaults` + assistant); named-character `character.metaImage` fallback intact; `node --check` clean on `$meta.dynamic`.
