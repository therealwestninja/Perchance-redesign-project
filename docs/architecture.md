# Architecture

Technical overview of how the fork is structured, built, and runs.

---

## Project Structure

```
vendor/                       ← Upstream Perchance code (untouched)
src/
  manifest.json               ← Module load order
  chat/          (42 files)   ← Chat tool modules
  render/        (19 files)   ← UI rendering (sections, overlays, splash, styles)
  profile/       (12 files)   ← Profile logic (settings, sharing, archetypes, flair)
  memory/        (10 files)   ← Memory manager (columns, panels, window)
  achievements/   (4 files)   ← Achievement registry, categories, grid, engine
  stats/          (5 files)   ← Chat statistics and counters
  events/         (3 files)   ← Calendar events and participation
  prompts/        (6 files)   ← Weekly prompts, daily quests, scheduling
  utils/          (5 files)   ← DOM helpers, formatting, validation
build/
  build.mjs                   ← Bundler script
  perchance_2.txt             ← Final output (1.86 MB)
test/            (51 files)   ← 940 tests (Node test runner)
docs/                         ← Documentation
```

---

## Build System

The bundler (`build/build.mjs`) does three things:

1. Reads `src/manifest.json` for the module list and order
2. For each module, strips `import` and `export` statements (since everything runs in a shared scope)
3. Wraps all modules in a single IIFE and appends it as a `<script>` block to the upstream `perchance_2.txt`

The output looks like:
```
[upstream perchance_2.txt content]
<script>
(function (NS) {
  // ... all 118 modules concatenated ...
})(window.__perchance_fork__ || (window.__perchance_fork__ = {}));
</script>
```

**Why a single IIFE?** Perchance doesn't support ES modules or bundler output formats. Everything must be a single inline `<script>`. The IIFE provides a private scope while `NS` (the namespace object) allows modules to share state cleanly.

**Module order matters.** The manifest controls concatenation order. Dependencies must appear before dependents. For example, `utils/dom.js` must come before any module that calls `h()`.

---

## Module Patterns

### Chat tool modules (`src/chat/`)
Each tool follows a consistent pattern:

```javascript
// 1. Export an init function (creates UI, wires events)
export function initMyTool() {
  if (initMyTool._done) return;  // idempotent guard
  initMyTool._done = true;
  // ... create DOM elements, attach listeners ...
}

// 2. Optionally export a build*Block() function for AI injection
export function buildMyToolBlock() {
  // Returns a string to append to the AI's system message,
  // or empty string if inactive.
}
```

Init functions are called from `src/profile/index.js` in the `start()` function, wrapped in `try/catch` for fault isolation.

### Shared scope
Since the bundler strips imports/exports and concatenates, all functions exist in a shared flat scope. A function exported in `glossary.js` can be called directly by name in `stop_generating.js` without any import.

---

## AI Context Injection

The core integration point is the monkey-patch in `src/chat/stop_generating.js`. It wraps `window.root.aiTextPlugin` (the upstream AI generation function) to intercept calls and inject context from multiple sources.

### Injection pipeline

```
User sends message
       ↓
patchedAiTextPlugin() called
       ↓
Loop over injectionSources:
  1. buildGlossaryBlock()       → keyword-matched lore
  2. buildSummaryBlock()        → compressed conversation history
  3. buildDocumentBlock()       → uploaded file content
  4. buildAntiRepetitionBlock() → word banlists
  5. buildPersonaBlock()        → user character info
  6. buildReminderBlock()       → persistent instruction
       ↓
Apply generation overrides:
  - temperature
  - maxTokensPerMessage
       ↓
original.apply(this, args)    → upstream AI call proceeds
       ↓
Show/hide stop button
```

Each `build*Block()` function returns a string or empty string. Non-empty strings are appended to the `systemMessage` (or `instruction`) field of the API call arguments. The original arguments object is cloned on first mutation to avoid side effects.

### Adding a new injection source
1. Create a `buildXBlock()` function in your module
2. Add it to the `injectionSources` array in `stop_generating.js`
3. Optionally add it to the Context Dashboard display in `context_dashboard.js`

---

## Profile Data

### Storage
All profile data lives in localStorage under the key `pf:settings`. The `settings_store.js` module provides `loadSettings()` and `saveSettings()` with try/catch wrapping for quota safety.

### Stats computation
Stats are computed fresh on every profile open by combining:
- **IDB queries** (`stats/queries.js`) — thread count, message count, character count, lore count, days active
- **Counter data** (`stats/counters.js`) — per-action bump counters (e.g., `glossaryEdits: 5`, `diceRolls: 42`)
- **Prompt stats** — completion history from `prompts/completion.js`

### Achievement evaluation
The achievement engine runs `criteria(stats)` for every achievement definition against the computed stats. Criteria are pure functions: `(s) => s.wordsWritten >= 10000`. Unlocked IDs are stored in settings and compared against the registry on each profile open.

---

## Share Code Format (pf3)

Binary-packed profile data encoded as base64url. Everything except the display name is a numeric index into an existing registry.

```
Byte 0:     version (3)
Byte 1:     level (0-255)
Byte 2:     archetype index (0-5, 255=none)
Byte 3:     accent index (0-23, 255=custom RGB follows)
[3 bytes]:  raw RGB if accent=255
Byte 4:     progress (0-100)
Bytes 5-6:  xpIntoLevel (uint16 big-endian)
Bytes 7-8:  xpForNextLevel (uint16 big-endian)
Byte 9:     title achievement index (255=custom text follows)
Byte 10:    badge count (0-5)
Bytes 11+:  badge achievement indices (1 byte each)
Then:       display name (length-prefixed UTF-8)
Then:       custom title (if title index=255, length-prefixed UTF-8)
```

Result: ~36 characters for a typical profile. Embedded in the URL as `?h=pf3:<base64url>`.

The canonical share URL is always `https://perchance.org/<slug>?h=<code>` — the builder strips Perchance's hashed subdomains and internal query parameters.

---

## Testing

Tests use Node's built-in test runner (`node:test`). Run with `npm test`.

Test files live in `test/` and import directly from `src/` using ES module imports. Since the bundler strips imports for the production build, tests are the only place where module boundaries are enforced.

Key test areas:
- **Achievement criteria** — verifies every achievement unlocks at the correct stat threshold
- **Category sorting** — ensures every achievement maps to a real category
- **Share code round-trip** — encode → decode preserves all fields
- **Glossary matching** — keyword detection, alias resolution, recursive scanning
- **Dice parsing** — XdY+Z notation edge cases
- **Stats computation** — counter bumping, streak calculation
