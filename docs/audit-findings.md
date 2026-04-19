# Audit Findings Journal

Running record of what the Audits-phase sweeps have turned up. Each
finding has a **status**, a **fix** (if taken), and a **commit** (or
"WIP"). Closed findings stay here as a paper trail — don't delete.

Goal: every future "wait, did we check X?" question answers itself
in one grep of this file.

---

## Index

- [Light audit — Apr 18 sweep (CLOSED)](#light-audit)
- [Narrow-predicate audit (IN PROGRESS)](#narrow-predicate-audit)
- [Code duplication audit (OPEN)](#code-duplication-audit)
- [Legacy Perchance code audit (OPEN)](#legacy-perchance-audit)

---

<a id="light-audit"></a>
## Light audit — Apr 18 sweep

**Status:** CLOSED. All 5 concrete findings resolved.

### LA-1 · `escapeHtml` dead code
- **Status:** RESOLVED — `2af4a1d`
- **Finding:** `src/utils/escape.js` exported `escapeHtml` with zero
  callers across `src/` and `test/`.
- **Decision:** delete. Codebase uses `h()` helper with `textContent`
  text nodes, which escape at the DOM layer. No string-level escape
  needed anywhere.
- **Commit:** `2af4a1d` — file deleted, manifest updated.

### LA-2 · `setInterval` leak in `profile/index.js`
- **Status:** RESOLVED — `2af4a1d`
- **Finding:** Mini-card's 30s refresh interval was unreferenced —
  if the card were ever detached, `refresh()` would keep firing
  against a ghost node. Not a user-visible leak (card lives for the
  page), but leak-shaped defensively.
- **Fix:** capture interval handle, self-clear on `!card.isConnected`,
  also clear on `pagehide` with `{ once: true }` (covers bfcache +
  mobile background).
- **Commit:** `2af4a1d`.

### LA-3 · `hasReorderChanged` / Lore-overrides gap
- **Status:** RESOLVED (no code change needed)
- **Finding:** Audit suggested `hasReorderChanged` might be missing
  Lore-override checks.
- **Investigation:** `hasPersistentChanges` (of which
  `hasReorderChanged` is an alias) already explicitly documents the
  asymmetry — Lore has no save pathway for reorder, and Lore rename
  is session-UI-only. `hasAnyUnsavedChanges` is the broader
  predicate catching Lore session state for the Cancel confirmation
  prompt.
- **Decision:** architecture is intentional and documented. Closed.

### LA-4 · Listener cleanup across render/
- **Status:** RESOLVED (no code change needed) — `0bbd320`
- **Finding:** 38 `addEventListener` calls, 0 `removeEventListener`.
- **Investigation:** exhaustively traced all 38 call sites.
  - `memory_panels.js` (26): all attach to locally-created elements;
    the module-level `dragPayload` holds DATA, not DOM refs.
  - `gender_square.js` (5): local `field` element per render.
  - `about_section.js` (1): local `ta` per render.
  - `utils/dom.js` (3): comment + `h()`/`hSVG()` internal mechanism.
  - `profile/index.js` (2): document `visibilitychange` (page
    lifetime) + `pagehide` with `{ once: true }`.
  - `bootstrap.js` (1): `DOMContentLoaded` with `{ once: true }`.
  - `replaceContents()` calls `replaceChildren()` → full detach, GC
    handles cleanup because no external retention.
- **Decision:** pattern is safe for the DOM-rebuild render model.
  The add/remove asymmetry is a CONSEQUENCE of the render model, not
  a bug.
- **Commit:** `0bbd320` — findings documented in ROADMAP; no code
  changes.

### LA-5 · Empty-catch audit
- **Status:** RESOLVED (no code change required) — `0bbd320`
- **Finding:** 28 `catch { /* non-fatal */ }` or `catch { /* best-
  effort */ }` blocks across `src/`. Concern: might hide real bugs.
- **Investigation:** all 28 classified:
  - ~11 analytics/counter bumps — truly non-critical.
  - ~9 localStorage writes — fails on quota/blocker; user's primary
    data is in IDB regardless.
  - ~8 UI niceties + callback-safety wrappers — defensive.
- **Decision:** pattern is correct. Shipped new utility
  `utils/best_effort.js` (`bestEffort(fn, tag)` +
  `bestEffortAsync`) with debug-level logging for future adoption.
  Existing inline catches can migrate opportunistically.
- **Commit:** `0bbd320`.

### What LA did NOT find (still valid)
- No TODO/FIXME/XXX/HACK markers in `src/`.
- No unused `import` statements detected.
- No infinite-loop / recursion hazards.
- Recent `fix:` commits all look like real customer bugs, not
  rushed-earlier-commit regressions.

---

<a id="narrow-predicate-audit"></a>
## Narrow-predicate audit

**Status:** CLOSED. 9 predicates reviewed; 1 real gap fixed; drift
guard test shipped to prevent recurrence.

**Shape of bug being hunted:** a predicate answers "does X?" about
user state, but a later feature added a new source of that state and
the predicate was never updated. Silent under-reporting → softlocks,
missed unlocks, stale refreshes. (The Apr 18 save-button softlock
was exactly this.)

### NP-1 · `hasPersistentChanges()` / `hasAnyUnsavedChanges()`
- **Status:** ✅ Clean (verified).
- **Scope:** both predicates in `src/memory/window_open.js`.
- **Every user-state source that exists:**
  1. `stage.hasChanges()` — staged memory/lore text edits.
  2. `pendingDeletions.size` — queued deletes.
  3. `memoryOverrides.{bubbleOrder, bubbleCardOrder, cardToBubbleId}` — Memory reorder state (3 collections).
  4. `memoryOverrides.bubbleLabelsByStableId` — Memory rename.
  5. `memoryOverrides.lockedBubbles` — Memory locks.
  6. `loreOverrides.*` — same 5 collections for Lore.
- **Coverage:**
  - `hasPersistentChanges`: includes 1, 2, Memory-side of 3.
    Excludes Memory locks (persisted immediately via
    `lock_persistence.js`), Memory rename (session UI only), ALL
    Lore overrides (no Lore save pathway).
  - `hasAnyUnsavedChanges`: `hasPersistentChanges()` PLUS Memory rename,
    Lore rename, Lore reorder (3). Excludes Memory locks (persisted),
    Lore locks (reset by design — session aid only).
- **All exclusions are documented in-line.**

### NP-2 · `stage.hasChanges()` / `computeDiff().totalChanges`
- **Status:** ✅ Clean (verified).
- **Scope:** `src/memory/stage.js`.
- **Checked behaviors:**
  - Round-trip edits (A→B→A): `textChanged` is false, `scopeChanged`
    is false — correctly NOT counted.
  - Promote/demote: scope-changed subset of edited; not double-
    counted in totalChanges sum.
  - Reorder detection: survivor-rank-only (doesn't false-fire when
    an item shifts purely because other items were deleted).
  - `totalChanges = added + deleted + edited + netReordered`. Edit
    + reorder on same item counts as edited (netReordered excludes
    already-edited keys).

### NP-3 · `buildRestoreDiff` (snapshots.js)
- **Status:** ✅ Intentional by design.
- **Finding:** `edited: []` and `reordered: []` always empty;
  `totalChanges = added + deleted` only. Initially flagged as a
  possible gap.
- **Resolution:** design comment explicitly says "always empty under
  this strategy." Snapshot-diff keys on `(scope, text)` so edits
  surface as `delete+add` (correctly counted). Reorders don't appear
  because snapshot persists items, not bubble-override state (locks
  and reorders are in a different layer). Intentional.

### NP-4 · `resetMemoryK` / `resetLoreK` parameters
- **Status:** RESOLVED — `beb136c`.
- **Finding:** `recomputeBubbles({ resetMemoryK, resetLoreK })` and
  `refresh({ resetMemoryK, resetLoreK })` had the parameters
  defined but no call site ever passed `true`. The reset-k
  branches (`if (resetMemoryK) memoryK = recommendK(memFreeCount);`)
  were dead code.
- **Fix:** parameters deleted. k-initialization at open time
  (lines 111-112 via `let memoryK = recommendK(initialMemoryEntries.length)`)
  and the user's ± slider remain the only k mutation paths.
  `recommendK` import retained for the init-time call.
- **Future note:** if product work later wants "auto-reset k
  when entry count drops significantly after a batch op", that's
  a new design with an explicit trigger heuristic, not a matter
  of re-enabling dead parameters.

### NP-5 · `panelsState()` builder
- **Status:** ✅ Clean (verified).
- **Finding:** `panelsState()` is a builder, not a predicate. Feeds
  `overlay.updatePanels()` (rerender) + `setSaveEnabled(
  hasPersistentChanges())`. Secondary concern: it passes
  `memoryOverrides.lockedBubbles` (a `Set`) by reference; a downstream
  mutator would pollute the authoritative copy.
- **Check:** greped every reader in `src/render/`. All reads
  non-mutating. Safe.

### NP-6 · `computeUnlockedIds` stats-bundle refreshes
- **Status:** 🚨 **REAL GAP — RESOLVED** — `2fbed2a`
- **Finding:** Four `computeUnlockedIds` / `getPrimaryArchetype`
  refresh call sites in `profile/full_page.js` all had the same
  pattern: spread init-time `stats` + re-read fresh `counters` and
  `streaks`, but NEVER re-read `eventsResponded`. A user who
  responded to a new event mid-overlay-session would see stale
  Celebrant unlock state on splash refresh / share card /
  archetype redraw.
- **Fields audited:** criteria across `src/achievements/registry.js`
  read 11 stat sources:
  `characterCount`, `counters` (tiered family gate),
  `daysActive`, `eventsResponded`, `longestThread`, `loreCount`,
  `promptCategoriesTouched`, `promptsByCategory`,
  `promptsCompletedTotal`, `promptsWeeksActive`, `streaks`,
  `userMessageCount`, `wordsWritten`.
- **Bug risk the pattern creates:** future stat additions would
  need to be added to 4 call sites or criteria silently read stale
  values. Same narrow-predicate shape as the Apr 18 softlock.
- **Fix:** extracted `buildFreshStats()` (async — includes
  `eventsResponded`) and `buildFreshStatsSync()` (for high-frequency
  sync paths like accent repaint). All 4 call sites migrated to
  route through these helpers. Future stat additions are now a
  one-file change.
- **Drift guard:** `test/stats_bundle_drift_guard.test.mjs` parses
  the registry for every `s.<field>` reference and asserts each is
  in a KNOWN_SOURCES whitelist. Also asserts both helper variants
  exist and assign the mutable sources. Verified it fires on
  injected fake field.

### NP-7 · Profile "has user done X?" predicates
- **Status:** ✅ Clean (verified).
- **Scope:** `checkAndUpdateBests` (personal_bests.js),
  `checkSummary` (summary_notifications.js),
  `hasNewWeekPending` / `hasNewDayPending` (prompts/completion.js).
- **Findings:**
  - Personal bests: 7 metrics, `read(s)` fn per metric. All fields
    populated by computeStats + stats.counters + stats.streaks.
    Called at 1 site with full stats bundle. Clean.
  - Summary notifications: 10-key SUMMARY_METRICS list opt-in by
    design; 3 counters intentionally excluded
    (`focusModeToggles`, `backupsImported`, `shareCardOpens`).
    Takes a counters object directly, not a broader stats bundle.
    Add-a-metric path well documented.
  - Week/day-pending predicates: simple `lastSeenWeek !==
    currentWeekKey` diffs. No state-source gaps possible.

### NP-8 · `reconcileLocks` predicates
- **Status:** ✅ Clean (verified).
- **Scope:** `src/memory/lock_persistence.js`.
- **Membership-change shapes covered:**
  - Identical membership → jaccard = 1.0 → match.
  - Small drift → 0.5 ≤ jaccard < 1.0 → match.
  - Large drift → jaccard < 0.5 → orphan.
  - Empty persisted set → special-cased to orphan (line 157).
  - Empty fresh bubble → jaccard = 0 → no match (fresh.ids.size
    zero case handled).
  - Both empty → `jaccard()` returns 1 defensively, edge case
    covered.
  - Two persisted locks matching the same fresh bubble → larger-
    persisted-first ordering + `claimed` Set prevent double-assign.
  - Best-match tie-break → strict `>` comparison (first wins).

### NP-9 · `computePendingAchievements` / `markAchievementsSeen`
- **Status:** ✅ Clean (verified).
- **Scope:** `src/profile/notifications.js`.
- **Finding:** simple set diff `unlockedIds \ seen`. Defensive
  input validation (`typeof === 'string'`, Array.isArray). No
  narrow-predicate gap possible — the predicate is a literal set
  difference.

---

<a id="code-duplication-audit"></a>
## Code duplication audit

**Status:** CLOSED. Three duplication passes shipped (CD-1, CD-2,
CD-3) plus one latent bug surfaced during CD-2 and fixed (CD-2a).

### Remaining hotspots (open — low priority)
- `window_open.js` `onSave`: ~15 lines of structurally-similar
  "build headline / build snapshot label" branching. Marginal
  extraction win, deferred.
- Achievement predicates: each walks stats independently. Not
  really duplication — each criterion reads specific fields.
  The drift-guard test from NP-6 covers the risk that matters.
- `styles.js` CSS: hover/focus/disabled state blocks repeat
  across sibling components. Deferred to the theme-overhaul
  sprint — coupling style-cleanup to the visual redesign is
  more efficient than two passes.

### CD-1 · Drop-target wiring in render/memory_panels.js
- **Status:** RESOLVED — `c64a531`.

### CD-2 · Batch bubble ops in memory/window_open.js
- **Status:** RESOLVED — `19bb440`.
- **Finding:** Three batch-bubble handlers (`onBubblePromote`,
  `onBubbleDemote`, `onBubbleDelete`) shared the same recipe:
    1. `confirmIfLocked(scope, bubbleId, msg)` — bail if declined.
    2. If bubbleId: remove from the appropriate override
       `lockedBubbles` Set(s) + (sometimes) call
       `forgetPersistedLockForBubble`.
    3. For each entry: apply the per-entry stage operation and
       forget the card from the appropriate override(s).
    4. `refresh()`.
  Each handler had these steps inline with minor per-handler
  variations in which overrides to clean.
- **Fix:** extracted `batchBubbleOp({ scope, bubbleId, entries,
  confirmMessage, unlockOverrides, forgetPersistedLock, perEntry,
  forgetCardsFromOverrides })`. Call sites declare their scope-
  specific cleanup via parameters; the helper handles the shape.
- **Important:** the extraction is MECHANICAL, not semantic —
  each call site replicates the EXACT same overrides-cleaned +
  forgetPersistedLock set as the pre-refactor code. A naïve
  "always clean both + always forget persisted" normalization
  would have surfaced the CD-2a latent bug below.
- **Size delta:** 1177 → 1228 lines (+51 net). Not a size win,
  but future batch ops are a config-object away instead of a
  copy-paste.

### CD-2a · Latent: bubble-id collision across scopes
- **Status:** RESOLVED — `5b779a7`.

### CD-3 · Palette duplication in render/styles.js
- **Status:** RESOLVED — `efd25d2`.
- **Finding:** `styles.js` had ~150 raw hex + rgba occurrences of
  the same small palette. `#d8b36a` (amber accent) alone appeared
  44 times, with another ~55 uses as `rgba(216, 179, 106, <alpha>)`
  across 14 distinct alpha values. Other repeated values:
  `#4a90e2` (blue, 12×), `#d87a7a` (red, 7×), `#6ab87c` (green,
  5×), `#b9894a` (amber-deep, 4×), `#1e1e1e` (dark bg, 4×),
  `rgba(0,0,0,0.18)` (7×), `rgba(0,0,0,0.25)` (8×).
- **Fix:** added a `:root` block at the top of the CSS template
  with tokens: `--pf-palette-amber`, `--pf-palette-amber-rgb`
  (comma-separated RGB for `rgba(var(...), alpha)` form),
  `--pf-palette-amber-deep`, `--pf-palette-blue`,
  `--pf-palette-red`, `--pf-palette-red-rgb`, `--pf-palette-green`,
  `--pf-bg-dark`, `--pf-overlay-dark-18`, `--pf-overlay-dark-25`.
  Mass-rewrote the occurrences via Python script (fixed alphas
  first, then regex-matched the tail).
- **Scope choice — `:root` not `.pf-overlay`:** several components
  (mini-card, splash, toasts) render outside the overlay's DOM
  subtree. Scoping palette to `.pf-overlay` would have broken the
  existing `var(--pf-palette-blue)` fallback in
  `.pf-mini-card:focus-visible`. `:root` avoids that.
- **Documentation:** comment in the `:root` block names the rule
  — "Do NOT introduce new raw hex/rgba values elsewhere. Add them
  here first, then reference the var from the rule site."
- **Size delta:** +~3.3 KB in the built bundle. Each palette ref
  is ~15 chars longer than the raw hex, but the single-source-of-
  truth is worth far more than the bytes at theme-reskin time.
- **Tail:** 5 remaining `rgba(216, 122, 122, <alpha>)` variants
  and 2 `rgba(0,0,0,0.15)` uses not consolidated — low frequency,
  deferred. Any new rule must either use an existing token or
  add one.
- **Finding:** Memory bubbles and Lore bubbles both use the
  `bubble:N` id pattern (see `src/memory/bubbles.js:125`). They
  are computed independently, so Memory `bubble:0` and Lore
  `bubble:0` can coexist as distinct entities.
  The `stableIdByCurrentBubble` map in `window_open.js` is not
  scope-namespaced — it keys on the bubble id string alone.
  Currently only Memory populates this map (Memory locks persist,
  Lore locks don't). `onBubbleDelete` previously called
  `forgetPersistedLockForBubble(bubbleId)` regardless of scope.
  If the user had Memory `bubble:0` locked and deleted Lore
  `bubble:0`, the Memory persisted lock got forgotten.
- **Fix:** thread the originating scope through the delete path.
  The drag payload already carries `scope` — previously dropped
  on the floor when invoking the handler. Now:
  - `onBubbleDelete(bubbleId, entries, sourceScope)` — 3rd arg.
  - Drop-target and button call sites both forward the scope
    from their context (drag payload scope, or button's
    containing panel scope).
  - `batchBubbleOp` only runs `forgetPersistedLockForBubble` when
    the effective scope is `'memory'`.
  - Fallback to `locatedBubbleScope(bubbleId)` if the caller
    omits sourceScope, preserving back-compat for any hypothetical
    existing caller.
- **Finding:** Four drop targets (`buildColumn` cross-panel,
  `buildDeletePanel`, `buildCreateCharacterPanel`, `createDropGap`)
  all implemented the same 3-listener pattern inline:
  dragover (accept-check + preventDefault + add active class),
  dragleave (remove class with relatedTarget guard),
  drop (preventDefault + remove class + clear payload + handler).
  Differences were only the accept predicate + onDrop body +
  minor variants (active class, stopPropagation for nested gaps,
  relatedTarget-dragleave on/off for small gap elements).
- **Fix:** extracted `wireDropTarget(el, { accepts, onDrop,
  activeClass, stopPropagation, useRelatedTargetDragLeave })`
  helper at top of memory_panels.js. All 4 call sites migrated.
  Each site now declares its acceptance rule and drop behavior
  in-line without ceremony; a bug fix to drop mechanics (e.g.
  cursor sticking on the hover class, relatedTarget quirks on a
  specific browser) now lands in one place.
- **Size delta:** 1106 → 1052 lines (−54 net; helper is ~55
  lines, inline code deleted totals ~110 lines).
- **Tests: 832 passing, 0 regression.**

---

<a id="legacy-perchance-audit"></a>
## Legacy Perchance code audit

**Status:** CLOSED. Read-only investigation of `vendor/perchance-
ai-character-chat/perchance_1.txt` (690 lines) and `perchance_2.txt`
(13,619 lines). **No code changes recommended.** Upstream is well-
designed for its use case; our fork's value is additive, not
corrective. The "vendor-untouched" invariant stays the right call.

Observations recorded below for completeness.

### LP-1 · `/mem` handler — duplicate-text trailing-space hack
- **Status:** CLOSED (observation, no action).
- **Finding:** `perchance_2.txt:10033-10036` and `10107-10108` use
  an acknowledged hack: when two memories have the same text, the
  handler appends trailing spaces to distinguish them for the
  Map-keyed-by-text lookup. Upstream's own comment calls it "bit
  hacky, but [...] we are using spaces to distinguish between
  different memories with the same text."
- **Why it's OK:** works for its purpose. The drawback is that
  saved memory text silently accumulates trailing whitespace,
  observable if the user inspects db records.
- **Our fork's position:** the Memory/Lore bubble tool never
  touches the /mem handler. Our tool uses synthetic IDs (not
  text-keyed Maps) so we sidestep this entirely. Noting as a
  reason our architecture is fundamentally more robust, not as
  something to fix upstream.

### LP-2 · Memory retrieval — hardcoded top-20 slice
- **Status:** CLOSED (observation, no action).
- **Finding:** `perchance_2.txt:7703`:
  `let memoryBatches = relevantMemories.slice(0, 20).sort(...)`
  Top-20 slice is NOT a token-budget limit — upstream comment
  explicitly notes:
  `"not to stay under token limit (we drop them later if there
    are too many), but because we extend batches based on
    adjacent memories that occur in memoryBatches, and that can
    result in a looonng loop if we include every memory as a
    batch."`
- **Retrieval scoring:** sentence-embedding dot-product, first
  search query weighted 3x (later queries assumed to be "grasping
  at straws"), score = similarity − 0.5 (subtracting the rough
  average random-embedding distance), then threshold filter.
- **Could bubble clustering improve this?** In principle, yes:
  instead of top-20 linear ranking over all memories, retrieve
  by bubble → then expand within-bubble. But wiring that into
  the vendor's pipeline requires touching
  `injectHierarchicalSummariesAndComputeNext...` in perchance_1
  and the retrieval block in perchance_2, which means breaking
  the vendor-untouched invariant. Not worth the cost for what
  would be a quality-of-retrieval improvement, not a
  correctness fix.

### LP-3 · `renderMessageFeed` — SHA-256 per-message gate
- **Status:** CLOSED (observation, no action).
- **Finding:** `perchance_2.txt:4050-4060` iterates the current
  message feed, hashes each message object with `sha256Text(
  JSON.stringify(messageObj))`, compares against the DOM
  element's stored hash, and early-breaks at the first mismatch.
- **Perf characteristic:** O(N) hashes per full render; ~1ms
  each, so a 500-message thread's cold render pays ~500ms JUST
  for the hash check. However, normal re-renders (user sends a
  message, AI replies) early-break after 1 iteration — the
  amortized cost is constant. This is an
  optimize-the-common-case design, and the common case is very
  frequent.
- **Worst case triggers:** editing an old message (all subsequent
  hashes mismatch, so the full O(N) loop runs). Still acceptable
  because editing old messages is rare and the UI is already
  in a "heavy operation" state.
- **Not a bug.** Deliberate engineering trade. Leaving it.

### LP-4 · Default character JSON blobs in perchance_2
- **Status:** CLOSED (observation, no action).
- **Finding:** `perchance_2.txt:4503, 4516, 4717, 4719, ...`
  contain URL-encoded full-character JSON blobs for the preset
  characters (Unknown/character-creator, AI Artist, Fire Alarm
  Bot, Strict Game Master, etc.). Each is several kilobytes of
  inline URL-encoded text.
- **Why not a problem:** these are seed content, not runtime
  logic. They're fetched/decoded once when the user clicks the
  preset, then normal character-lifecycle takes over. Ugly but
  benign.
- **Not our problem to fix.** Relocating them to external JSON
  files would be an upstream quality-of-code improvement, not
  ours to make.

### Scope check — things the audit looked for but didn't find
- **No TODO/FIXME/XXX/HACK grep hits in vendor files** beyond the
  self-aware "bit hacky" comment in LP-1.
- **No obvious dead code** in the parts read (plugin imports,
  top-level helpers, slash-command dispatch, render pipeline,
  retrieval logic).
- **No misuse of async/await** that would produce obvious
  race conditions.
- **No unguarded `await fetch(...)`** (cross-cutting vendor
  pattern is `try/catch` + `AbortSignal.timeout`).

### Why this section wrapped up so quickly
The ROADMAP allowed for up to 10 per-finding commits, but it also
noted: *"we become the maintainers of a diverging fork. Worth
weighing against the fork promise."* Every candidate finding
examined was either (a) intentional design, (b) an architectural
choice we're bypassing anyway via our Memory tool, or (c) an
upstream-quality-of-code concern that doesn't affect us. The
right call is to document the investigation and move on, not to
patch upstream via build-time rewrites. If a specific vendor
behavior becomes a blocker for our work later, we'll re-open
this section targeted at that specific issue.

---

## Audits phase — overall summary

| Section | Status | Commits |
|---|---|---|
| Light audit (Apr 18) | CLOSED | `2af4a1d`, `0bbd320` |
| Narrow-predicate audit | CLOSED | `2fbed2a` (plus drift guard test) |
| Code duplication audit | CLOSED (3 passes) | `c64a531`, `19bb440`, `5b779a7`, `efd25d2` |
| Legacy Perchance audit | CLOSED (observation-only) | (this commit) |

**The Audits phase is complete.** 21 individual findings tracked
(LA-1..5, NP-1..9, CD-1..3, CD-2a, LP-1..4), 5 real bugs found
and fixed, 2 drift-guard / safety mechanisms shipped, palette
consolidation laid groundwork for the upcoming theme overhaul.

Next ROADMAP section is the theme overhaul itself. Audit
findings journal remains live: if a future audit surfaces new
items, they get appended here with their own section/IDs.
