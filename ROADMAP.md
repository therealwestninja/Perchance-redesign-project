# Roadmap — Perchance AI Character Chat fork

Future improvements that aren't urgent or don't belong in the current
sprint. Ordered by rough priority, not schedule.

---

## Competitive upgrade path (Apr 2026)

Feature gap analysis from reviewing three MIT-licensed Perchance forks
(FurAI, Kustom-GPT, URV-AI). Reusing their code where possible to save
development time. Code first, design/polish last.

### Batch 1 — Chat UX fundamentals ✅ COMPLETE
- [x] Message controls: copy, edit, delete per message (6e8006f)
- [x] Regenerate last AI response (6e8006f)
- [x] Chat search (sidebar thread filter) (324aa89)
- [x] Stop-generating button (c83db99)

Source: FurAI message controls, Kustom-GPT stop-generating.

### Batch 2 — AI intelligence (HIGH impact, medium scope)
- [x] Dynamic glossary / context-aware lore injection (d33e20a)
- [x] Auto-summary compression for older messages
- [x] Token count awareness / display (d33e20a)

Source: FurAI dynamic glossary. FurAI auto-summary. URV-AI summaries
(openSummaryModal, renderSummariesView).

### Batch 3 — Voice + code ✅ COMPLETE
- [x] Voice input (Web Speech API → text) (e6d2d7e)
- [x] Voice output (TTS with rate/pitch controls) (e6d2d7e)
- [x] Code syntax highlighting in AI responses (e6d2d7e)

Source: Kustom-GPT voice I/O. URV-AI code blocks (setupCodeBlockListeners,
hljs theme integration).

### Batch 4 — Image generation + AI tools (3/4) (MEDIUM impact, higher scope)
- [x] Image generation per message (via Perchance text-to-image plugin)
- [x] Writing enhancer (e153a16) / "Magic Wand" (rewrite user text before sending)
- [x] User impersonation (8f88cd2) (AI writes as user — for RP continuity)
- [x] Narration generation (e153a16) (generate scene narration on demand)

Source: FurAI image gen. FurAI enhancer. URV-AI impersonation
(generateUserImpersonation) and narration (generateNarration).

### Batch 5 — Thread + character management (MEDIUM impact, medium scope)
- [x] Thread pinning — ALREADY IN UPSTREAM (isFav + .favStar)
- [x] Thread archiving (f19cd6c) (hide old threads without deleting)
- [x] Bulk thread operations (multi-select + delete/archive)
- [x] Character browser/grid with search
- [x] Chat folders — ALREADY IN UPSTREAM (folderPath + changeFolderPath)
- [x] Chat export (f19cd6c) (import TBD) (full thread data)

Source: URV-AI thread pinning (togglePinThread), archiving
(toggleArchiveThread, openArchiveModal), bulk operations
(toggleBulkSelectMode, updateBulkActionBar). FurAI characters
modal, folder system, import/export.

### Batch 6 — Advanced (LOWER priority, higher scope)
- [x] Conversation branching / tree navigation
- [x] Prompt presets (save/load prompt templates)
- [x] Quick reminder editor (edit reminder message inline)
- [x] Show AI reasoning / thinking toggle
- [ ] Local LLM connection support (Ollama, KoboldCPP, etc.)
- [x] Advanced generation settings (temperature, max tokens)
- [x] Document / file analysis (upload + chat about docs)
- [ ] Web search integration (search web from chat)
- [ ] Vision / image understanding (describe uploaded images)
- [ ] Multiple API providers
- [ ] Visual Novel mode (sprite layer, backgrounds)
- [x] Keyboard shortcuts

Source: URV-AI branching (createNode, handleGraftNode, openTreeMap),
presets (applyPreset), reminder (openReminderModal), reasoning
(toggleReasoning), document mode (toggleDocumentMode), web search
(handleLocalWebSearch), vision (generateVisionResponse), multiple
APIs (generateExternalModelResponse). Kustom-GPT local LLM. FurAI
VN mode.

### Batch 7 — Design polish (LAST)
- [x] Dark/light theme toggle (full reskin)
- [x] Custom backgrounds per chat
- [x] Font customization (family + size)
- [x] Fullscreen mode
- [x] UI animation polish
- [x] Mobile-responsive refinements

Source: all three forks have theme toggles. FurAI backgrounds.
URV-AI font controls (updateAppFontFamily, updateAppFontSize),
fullscreen (toggleAppFullscreen).

---

## ✓ ROADMAP DIRECTIVE — CLEARED (Apr 2026 session)

User said "do all in order, no notes." All listed roadmap items
have been shipped:

  fbb25f3  feat: 8 legendary capstones — make the endgame palette earnable
  62d5f33  feat: targeted persistence for memory reorder
  abeab52  feat: per-thread counter breakdowns
  f07da3e  feat: persist lore order via settings
  d277ea8  feat: settings drawer extension - tunable snapshot cap

Test count grew 855 → 899 across these 5 commits (+44 net).
All tests passing. Build clean.

The "Latent UX bug sweep" item was started but skipped per user
direction. Initial pass found no actionable issues — Bug 1's
`<label>` pattern occurred once and was already fixed; other
selectable-item patterns showed visually distinct active vs hover
states. Can be picked back up if specific reports surface.

Remaining unaddressed items in this file are explicitly
"Remaining candidates" / aspirational, not scheduled work.


---

## Memory reorder: targeted persistence (post-7e) — SHIPPED

**Status: shipped this session as commit `62d5f33`.**

Three-bucket partition in `commitDiff` distinguishes locked /
userMoved / untouched entries. Only userMoved entries get
proportional remap (by FULL-order rank, preserving "where I
dragged it" semantics). Untouched entries keep their on-disk
`(messageId, level, indexInLevel)` tuple — no silent drift.

Provenance source: `bubble_overrides.userMovedCardIds`, populated
by `assignCardToBubble` (cross-bubble drop) and `moveCardBefore`
(within-bubble drag), pruned by `forgetCard`. Cards re-clustered
by k-means alone are NOT in the set.

Lazy message prefetch: only messages currently holding a userMoved
entry's slot OR destined to receive one. For a 1000-message thread
with a single dragged card, prefetch goes from 1000 down to 2.

`stats.preservedMemory` exposed for the future "what we DIDN'T do"
side of the save summary.

4 new tests. Stale-baseline guard fixtures updated to tag
`userMoved: true` so the captured-text path stays exercised.


---

## Commit 4 — drag bubble → new character — SHIPPED

**Status: shipped.**

Implemented as a "Create Character" drop zone stacked above a smaller
Delete zone in the Memory window's right column (per user's spec:
Delete shrunk to 1/3 height, Create Character on top 2/3 with green
accent).

### Flow
- User drags a bubble (via grip OR header) onto the Create Character
  zone → minimal confirmation dialog appears with editable name
  (pre-filled from bubble label) and a preview of the bubble's
  entries as upcoming lore items
- On Create: `db.characters.add` creates the character, then each
  entry is added as a `db.lore` row with `bookId = pf-spawned:<id>`
  and the character's `loreBookUrls` is set to `[<that bookId>]`
- Embeddings preserved in the lore rows so retrieval works
  immediately if the user starts a thread with the character
- Source bubble is unchanged (copy-out, not move-out)

### Upstream integration note
We could not invoke Perchance's `characterDetailsPrompt` directly
since it lives inside the upstream IIFE closure. Shipped our own
minimal dialog that focuses on name + preview; full field editing
happens in the upstream character list after creation. Future
enhancement: if Perchance exposes `characterDetailsPrompt` or we
build a postMessage bridge, we could pipe the full form through
and let users fill avatar/scenario/etc. before the character lands.

### Counter + achievement
- New counter `charactersSpawned` (tracks spin-offs)
- Tiered "Demiurge" achievement (bronze 1, silver 5, gold 20)
- New "Characters spawned" chip in the Activity section

### Files
- `src/memory/spinoff_character.js` — NEW (~175 lines)
- `src/render/memory_panels.js` — `buildCreateCharacterPanel`,
  right-column stack, `label` added to bubble drag payloads
- `src/memory/window_open.js` — `onSpinOffCharacter` handler
- `src/render/styles.js` — stack + create-char + spinoff dialog CSS
- `src/profile/settings_store.js`, `src/stats/counters.js` — new
  counter field
- `src/achievements/registry.js` — Demiurge tiers
- `src/render/activity_body.js` — new chip + total
- `src/manifest.json` — `spinoff_character.js` registered

---

## Lore reorder via invented order field — SHIPPED

**Status: shipped this session as commit `f07da3e`. Originally
rejected; opinion shifted, implementation was redesigned to
sidestep the schema-divergence concern.**

The original objection ("if order doesn't matter for Lore, it
doesn't need sorting") was really about not polluting upstream's
lore schema with a field upstream silently ignores.

The shipped implementation stores the order in OUR settings
(`settings.loreOrderByBookId`) rather than in upstream's lore
table. Upstream stays untouched. If the user uninstalls our tool,
their lore data is bit-identical to what they started with — no
orphan field. Implicitly opt-in: until you reorder a book, no
persisted order exists for it.

New module `src/memory/lore_order.js` with 4 exports:
`loadLoreOrder`, `persistLoreOrder` (empty array deletes the
entry), `sortLoreByPersistedOrder` (in-list first by rank,
not-in-list at end stable), `forgetLoreFromOrder` (called on
lore deletion).

Wired into `loadBaseline` (read-side sort) and `commitDiff`
(post-tx persist + delete-prune). 16 new tests.

---



## Settings modal + rename threshold slider — SHIPPED

**Status: shipped as a settings drawer.**

Implemented as a slide-down drawer (not a modal) triggered by a gear
icon in the Memory window header. Keeps the tool chrome clean when
not in use and extensible for more knobs. Changes persist via
`updateField`, fire settings pub/sub, and trigger a live refresh of
the bubble layout so users see the effect of their changes
immediately without closing the window.

Shipped knob: **rename-survival threshold slider** (0–100%, step 5%,
default 50%). Live-readable from `settings.memory.tool.renameThreshold`.
Passed to `applyOverrides` at both call sites. Tooltip captions adapt
in plain English as the slider moves ("Balanced — renames stick when
membership is largely the same.").

### Extension points

Architected to accept more knobs by adding a row to
`createMemorySettingsDrawer`. Pattern established by the snapshot-
cap extension below: hardcoded constant → live settings read with
bounds + clamping → drawer slider. Each new row is ~30 lines in
`memory_settings_drawer.js` + a default in `settings.memory.tool`
+ a consumer in the relevant module. No plumbing-pass required.

**SHIPPED extensions:**
- **Snapshot ring-buffer size** (commit `d277ea8`): was hardcoded 10
  per thread. Now slider 5..25 step 5, default 10. Stored at
  `settings.memory.tool.maxSnapshots`. Read live, lazy retrim on
  cap-lower. `SNAPSHOT_CAP_BOUNDS` exported as single source of truth.
  6 tests.

- **Usage histogram window** (this batch): was hardcoded `lastN=10`.
  Now slider 5..50 step 5, default 10. Stored at
  `settings.memory.tool.usageWindow`. Drives the "recently used" dot
  indicator on cards — wider window = more memories flagged as
  recently relevant.

- **Lock reconciliation threshold** (this batch): was reusing the
  rename threshold. Decoupled per ROADMAP. Slider 0..1 step 0.05.
  Stored at `settings.memory.tool.lockReconcileThreshold`. Default
  falls through to the rename threshold value, then to library
  default 0.5 — so existing users see no behavior change unless they
  explicitly set this slider.

- **K-cluster preference** (this batch): `recommendK(n)` extended to
  `recommendK(n, prefMultiplier=1)`. Multiplier applied before the
  [3, 15] sanity clamp. Slider 0.5x..2x step 0.25, default 1x.
  Stored at `settings.memory.tool.kPrefMultiplier`. <1x = sparser
  bubbles, >1x = denser. 6 new clustering tests verify multiplier
  behavior + sanity bounds.

(Auto-save was previously listed as a candidate but removed per
user direction. Not pursuing — the Memory tool's save is destructive
enough that the explicit two-step confirm is the right interaction;
auto-save would either need a confirm-before-write flow that defeats
its purpose, or genuinely surprise users mid-edit. No win there.)



---

## Second pass on User Profile — remaining items

**Status: PARTIAL. Core counter infrastructure shipped.**

### Shipped
- `settings.counters` namespace in settings_store
- `src/stats/counters.js` module: `bumpCounter`, `getCounters`, `resetCounters`
- Bubble tool instrumentation: memoryWindowOpens, bubblesLocked,
  bubblesRenamed, bubblesReordered, cardsReorderedInBubble,
  cardsReorderedCrossBubble, snapshotsRestored, memorySaves,
  backupsExported
- Non-bubble-tool instrumentation: backupsImported, promptArchiveOpens,
  focusModeToggles
- Profile "Activity" section displaying chip grid with per-counter
  totals plus first/last activity timestamps
- Round-trip through backup/export/import works for free (counters
  live in settings)
- 10 unit tests for counters module
- **30-day sparklines for counters** (NEW): per-day histogram
  (`settings.countersByDay`) stored alongside lifetime counters.
  `bumpCounter` now writes to today's UTC day-bucket in addition
  to the lifetime total, and prunes entries older than 60 days
  on every write AND read. New `getCounterSeriesByDay(name,
  days)` returns a contiguous array (oldest-first, today at
  index N-1). Each Activity chip now renders a small inline-SVG
  sparkline (80×16 px, area fill + polyline + "you're here" dot
  at today) under its label, tinted with the user's
  `--pf-accent` color. Reusable `src/render/sparkline.js` module
  with extracted pure `computeSparklinePoints` helper for test
  coverage without DOM. Includes graceful no-data flat-line and
  zero-max handling. 19 unit tests covering UTC day-key
  formatting, read/write pruning, bump-writes-to-today, series
  positioning of historical bumps, missing-key returns all zeros,
  reset-clears-histogram, empty/null series safety, y-inversion
  (SVG convention), width-span normalization, and non-numeric
  value coercion.

### Shipped (continued)
- **Per-thread counter breakdowns** (NEW, this session, commit `abeab52`):
  Counters that previously aggregated globally now also tally per-
  thread. New storage at `settings.countersByThread[threadId][counterName]`,
  written by extending `bumpCounter(name, n, threadId?)`. Memory tool's
  9 thread-scoped bumps wire `activeThreadId`; backups stay profile-
  level, not thread-tagged. New readers `getCountersByThread()` and
  `getTopThreadsForCounter(name, limit)`. Activity section gains a
  "By thread" strip below the chip grid showing top 3 threads per
  counter ("Most-saved threads: Davie (12) · Eli (8) · Mira (3)").
  Thread NAMES resolved at openFullPage time via `db.threads.bulkGet`
  with serial-get fallback; deleted threads degrade gracefully to
  "Thread #&lt;id&gt;". `resetCounters` clears per-thread tally too.
  7 new tests.

### Shipped (continued)
- **Weekly prompts completed BY CATEGORY tracking** (NEW):
  Added a `category` field to every prompt in the registry
  (character / dialogue / atmosphere / craft / connection — 5
  buckets distributed across the 40 shipped prompts as 11/9/6/7/7).
  New `PROMPT_CATEGORIES` export.
  `computePromptStats` now returns `promptsByCategory` (per-category
  completion counts) and `promptCategoriesTouched` (count of
  distinct categories with ≥1 completion). Both roll in
  `historicalTotals.byCategory` so counts survive GC — the Clear
  History action preserves per-category totals into the historical
  bucket before dropping old weeks. Two new tiered achievement
  families land in the `prompts` categorization bucket:
  **Well-Rounded / Range / Versatile** (common/rare/epic) — gated
  on 3/4/5 distinct categories touched; and
  **Specialist / Devoted / Virtuoso** (common/rare/epic) — gated
  on 10/30/60 completions in the PEAK category (not total —
  rewards depth on one preferred type rather than even spread).
  `peakCategoryCount(stats)` helper reads across
  `stats.promptsByCategory` and takes the max. 16 new unit tests
  cover registry integrity (every prompt has a valid category),
  per-category stats computation, historical-totals folding,
  unknown-prompt-id safety, peak-vs-sum distinction, malformed-input
  safety, and the GC-preserves-byCategory guarantee.

### Shipped (continued)
- **Holiday event participation states** (NEW): richer engagement
  tracking beyond the existing seenEventIds "saw the badge" signal.
  Three states per event, strictly monotonic: `seen` (user shown
  the announcement), `responded` (user completed at least one of
  the event's prompts), `chronicled` (reserved for future chronicle
  hook; no UI yet). Storage at
  `settings.notifications.eventParticipation[eventId]`. Wired via
  dynamic imports from setCompleted (prompts/completion.js) and
  markEventsSeen (notifications.js) so the events/* modules stay
  outside the main completion/notifications load path. New tiered
  "Celebrant" achievement reads `stats.eventsResponded` — bronze
  at 1 distinct event, silver at 5, gold at 15. Criteria read
  `countEventsResponded()` injected at all unlock-compute sites.
  23 unit tests covering monotonicity, idempotency, findEventForPrompt
  correctness, storage-safety, and the three Celebrant tiers.

These remaining items are all additive and can be tackled
independently. None are blockers for the gamification roadmap
item — the core counter data is there now.


---

## Achievement levels + profile gamification — SHIPPED

**Status: complete. All 8 items from the gamification arc shipped.**

### Shipped
- Tiered counter-backed achievements: bronze/silver/gold for 9
  counter categories (Curator, Namer, Organizer, Shuffler, Sorter,
  Preservationist, Restorer, Archivist, Regular). 27 new
  achievement IDs mapped to bronze=common, silver=rare, gold=epic
  existing tiers. Unlocks track per-counter thresholds.
- `tieredCounter()` helper in `registry.js` for easily adding new
  tiered achievements without repeating the three-row structure.
- `stats.counters` injected by all three unlock call sites
  (full_page initial, full_page refresh, mini-card refresh).
- 12 unit tests for the new achievement behavior.
- Achievement unlock-date tracking (commit 3beeeb0): each unlock
  records first-detected ISO timestamp; achievements grid shows
  relative + absolute date.
- **Streak tracking** (NEW): consecutive-day activity streak with
  current + longest, "active / at-risk / broken" status, streak
  banner in Activity section with adaptive icon/tone, 5 tiered
  streak achievements (3/7/14/30/100 days, common→legendary).
  recordActivityForStreak() called on profile open + memory tool
  open. Idempotent within a UTC day.
- **Profile flair unlocks** (NEW): title picker lets the user
  choose any unlocked achievement's name to wear on their splash,
  with "Auto (rarest unlocked)" as the default. Kept the existing
  free-text override as an escape hatch. Also shipped a 7-color
  accent palette (amber default + slate/forest/azure/rose/violet/
  crimson) unlocked by tier counts: bronze counts unlock neutral
  accents, silver-tier unlocks rose+azure, one gold unlocks violet,
  one legendary unlocks crimson. Accent tints the splash title,
  level badge, pinned badge borders via a --pf-accent CSS var on
  the overlay root. Picker lives in the Details form; changes
  apply live via the existing settings-change subscription.
  19 unit tests covering title/accent resolution and fallback chains.
- **Personal-best notifications** (NEW): high-water-mark tracker
  across 7 metrics (words written, characters created, threads
  started, lore entries, memory saves, bubbles renamed, longest
  streak). On profile open, compares current stats to stored peaks
  and stacks celebratory toasts for each improvement over a prior
  record. First-observation-above-threshold records silently to
  avoid flooding users on first upgrade. Ships a reusable toast
  module (`render/toast.js`) with info/ok/warn/celebrate variants
  and stacking — available for future summary notifications.
  11 unit tests.
- **User archetypes** (NEW): play-style classification across 5
  types — Storyteller, Roleplayer, Daily User, Regular, Casual.
  Each archetype scores in [0, 1] from a WEIGHTED combination of
  signals: Storyteller = long words-per-message + memory saves +
  bubble renames + continuity; Roleplayer = characters + moderate
  wpm + threads + characters-spawned; Daily User = current streak
  + longest streak + tool opens + days active; Regular = bell-
  curve moderate-everything; Casual = negative-fit, high when
  heavy-use signals are LOW. Primary archetype picks the top
  scorer (or "Newcomer" if all below 0.15). Shown as a small
  pill under the splash title, styled in the user's accent color.
  Live-updates on settings change so threshold crossings reflect
  without reopening the profile. 18 unit tests covering each
  archetype's winning profile, edge cases (null/negative/extreme
  inputs), purity, and Newcomer fallback.
- **Shareable profile share codes** (NEW, replaces earlier PNG
  path): compact text string encoding the public-display fields of
  your profile — something you COPY and paste, not something you
  DOWNLOAD. Format `pf1:<base64url-encoded JSON>` with short field
  keys (`n`/`t`/`a`/`l`/`c`/`b`/`x`/`p`) for compactness. No image
  data, no avatar — truly text-only, pastes cleanly into Discord/
  DMs/chat. Benefits over the earlier canvas-PNG flow: no blob
  pipeline, no clipboard-image permission, no metadata surface to
  audit, same paste path works in every text medium. Privacy
  whitelist (same contract as the earlier path) is applied on both
  encode AND decode — hand-crafted codes with oversized or
  extraneous fields are re-trimmed to the schema. VERSION
  TRACKING IS CURRENTLY STUBBED — `decodeShareCode` accepts any
  `pf<digit>:` prefix and any payload `v:` value so the format can
  iterate freely during development. When the schema stabilizes,
  flipping `enforceVersion = true` in decode engages the version
  gating (the code path is already written, just inert). Button
  appears as ▤ on the splash next to the ◉ focus-mode icon. Share
  dialog shows a human-readable preview (name · level · title ·
  archetype · badges), a read-only textarea with select-on-focus,
  Copy + (optional) native Share. Dialog is code-split via dynamic
  import so the share machinery only loads when asked for. 28 unit
  tests covering whitelist (extraneous fields dropped, Newcomer
  archetype filtered, length caps, max-badges cap, accent
  normalization with/without '#', progress clamp, level floor),
  encode (deterministic, no-input tolerance, leakage resistance),
  round-trip (every field, null archetype, unicode names, source
  tag), and decode rejection (non-string, no colon, malformed
  base64, non-JSON, non-pf prefixes) plus two tests documenting
  the dev-stub version-acceptance behavior.
- **Summary notifications** (NEW): weekly "what you did" recap
  toast. On profile open, if a week has passed since the last
  snapshot AND the user has non-zero counter deltas, surfaces a
  single info-colored toast with the top 3 activities, e.g.
  "This week: 5 memory saves, 12 bubble renames, and 2 new
  characters." Pull-based — no background timers; snapshot lives
  in settings and is compared lazily at profile open. Cadence
  protection: snapshot advances on every 7+-day check so a user
  who returns every 10 days doesn't accumulate multi-week deltas.
  Silent on quiet weeks (no deltas) and under-7-days re-opens.
  Opt-out via `settings.summaryNotifications.enabled = false`
  (no UI toggle yet — out of scope for this commit; can be added
  later via the details form). Uses the existing toast module
  (from bfb3a64), visually distinguished from personal-best
  toasts via a blue eyebrow. 18 unit tests covering delta
  computation, top-N picking, sentence composition (1/2/3 items
  with Oxford commas), cadence edge cases, and opt-out.
- **Celebrant tier family** (NEW, from holiday-events work):
  3-tier achievement reading `stats.eventsResponded` (distinct
  events the user has completed at least one prompt for).
  Bronze at 1 event, silver at 5, gold at 15.
- **Categorized achievement browser** (NEW, UX refactor):
  `src/achievements/categories.js` sorts all shipped achievements
  into 8 categories (Writing, Stories, Prompts, Consistency,
  Curation, Preservation, Creation, Events). Grid replaced with
  a horizontal tab strip + pane system. Default Summary tab shows
  overall progress bar, per-category progress bars, and the last
  6 unlocked with dates. Category tabs show that category's
  cards in registry order so tier families read naturally
  (Bronze → Silver → Gold side by side). Panes pre-mount + toggle
  `hidden` for scroll-position preservation. 12 tests verify
  every shipped achievement sorts into a real category (guards
  against registry drift when new achievements are added without
  a matching categories rule). Style aligned with current
  profile look; deeper reskin deferred to the theme-overhaul
  phase.

### Gamification arc: complete
All user-requested gamification items from this arc are shipped:
tiered counter achievements, achievement unlock dates, streak
tracking, profile flair unlocks, personal-best notifications,
user archetype classification, shareable profile codes (text-only,
no image), weekly summary notifications. Plus the Celebrant tier
family (tied to holiday-events participation tracking) and a UX
refactor that categorizes all 67 shipped achievements into a
tabbed browser so the grid stays browsable as new tiers are added.

### Remaining
(none)

### Dependencies cleared
- ~~Second-pass user-stats tracking~~ SHIPPED (commit b101e98 +
  this commit)
- Code-duplication refactor pass — still pending, but no longer a
  strict blocker; the flair + share-card work can land as-is and
  the refactor will touch the rest.



---

## Phase: Audits (deferred — last phase)

Per user direction: audits move to the last phase of work.
Engineering hygiene items grouped here so they don't compete for
priority with feature shipping. Each gets its own commit when its
turn comes.

---

## ✓ AUDITS PHASE — CLOSED

The four Audits-phase sections below (`Light audit`, `Narrow-predicate
audit`, `Code duplication audit`, `Legacy Perchance code audit`) all
completed. See `docs/audit-findings.md` for the indexed record of
every finding by ID (LA-1..5, NP-1..9, CD-1..3 + CD-2a, LP-1..4) with
commit hashes.

Summary: 5 real bugs found and fixed, 1 drift-guard test shipped,
palette consolidation (~150 raw color values) groundwork laid for
the upcoming theme overhaul, fork-architecture discipline preserved
(no vendor files modified). Retained full sections below for the
detailed historical record.

---

## Light audit findings (Apr 18) — needs deeper pass

**Status: notes from a surface-level sweep.** A deeper audit is owed
before the code-duplication refactor pass lands. These are things that
looked suspicious or worth a closer look; most are not bugs, some are.

### Potentially-stale code

- ~~`src/utils/escape.js` exports `escapeHtml` which is referenced from
  zero files in `src/`.~~ **RESOLVED**: deleted. Dead code confirmed
  via full src/ + test/ search; no call sites. Module removed from
  manifest.json. All renderers use `textContent`-based DOM
  construction (via `h()` helper) rather than innerHTML, so there's
  no HTML-escaping need anywhere in the current codebase. If a
  future path ever needs string-level HTML escaping, re-adding a
  small helper is cheap.

- `src/bootstrap.js` correctly has no importers (it's the entry point
  invoked by the manifest). Noted here so it doesn't get accidentally
  flagged as dead later.

### Residual memory/lore duplication after byScope

The byScope dispatch handled the obvious hotspots (onChangeK,
onReorderBubble, etc.) but `src/memory/window_open.js` still has many
direct `memoryOverrides.` and `loreOverrides.` references in:

  - `recomputeBubbles` — direct refs for lockedBubbles
  - `onDeletePanelDrop` — direct deletion of lockedBubbles entries
  - ~~`hasReorderChanged` — only checks `memoryOverrides`; should also
    check loreOverrides for the new Lore reorder-in-session state,
    OR explicitly document that Lore reorder doesn't participate in
    save-dirty tracking~~ **RESOLVED**: already explicitly documented.
    `hasPersistentChanges` (of which `hasReorderChanged` is an alias)
    has a comment block listing exactly what's NOT included and why
    — Lore has no save pathway for reorder, and Lore rename is
    session-UI-only. `hasAnyUnsavedChanges` is the broader predicate
    that includes Lore session state for the Cancel confirmation
    path. Architecture is intentional.
  - `panelsState()` builder — directly references memoryOverrides,
    loreOverrides, memoryBubbles, loreBubbles
  - `onSave` — entirely Memory-specific; fine, but worth a comment

**Similar in `src/render/memory_panels.js`** — scope gates still
exist in 9 places for features like per-card → Lore/→ Memory buttons
and the empty-state text. Most of those are correct (cross-panel
actions are asymmetric by nature) but a pass through them would
confirm each remaining gate is intentional.

**Action:** tackle as part of the code-duplication refactor pass.

### Possibly-hollow listener cleanup

~~`grep addEventListener / removeEventListener` across src/~~
**RESOLVED** (verified by deeper audit):

Audit hypothesis was that listeners on elements replaced by
`replaceContents` are discarded along with the detached DOM nodes.
Hypothesis confirmed:

  - `replaceContents(el, children)` in utils/dom.js calls
    `el.replaceChildren()` (or removeChild loop) — fully detaches
    the old subtree from the DOM.
  - All 26 memory_panels listeners attach to locally-created
    elements (`document.createElement` or `h()`) that are only
    referenced inside the render scope. No module-level map, no
    cache, no external retention path. The single module-level
    `dragPayload` holds DATA (id, scope, entries, label strings) —
    not DOM refs — and is nulled on dragend. Safe.
  - gender_square.js (5), about_section.js (1), memory_window.js
    callback-wrappers — same pattern: local elements only.
  - profile/index.js: document-level `visibilitychange` is
    page-lifetime; `pagehide` listener added in 2af4a1d uses
    `{ once: true }` and auto-removes.
  - bootstrap.js: single `DOMContentLoaded` with `{ once: true }`.

No accumulating-leak patterns found. The `addEventListener`-to-
`removeEventListener` count asymmetry is a consequence of relying
on GC-via-detach rather than explicit pairing — correct for this
codebase's DOM-rebuild render model. No code changes needed.

### Timers

~~`setInterval` in `profile/index.js` refreshes profile card
periodically — never cleared. On profile close, still running.
Probably harmless (refreshes a detached DOM node), but
leak-shaped.~~ **RESOLVED** in 2af4a1d: interval now captures
handle, self-clears when `card.isConnected` is false, and is
cleared on `pagehide` (covers bfcache + mobile background).

`setTimeout`s in details_form, overlay, gender_square for
debounce/focus: one-shot, don't leak. Confirmed by inspection.

### Empty / best-effort error swallows

~~15+ `catch { /* best-effort */ }` blocks across the codebase.~~
**RESOLVED** (28 catches reviewed):

All 28 catches fall into one of three legitimate patterns:

1. **Analytics / counter bumps** (~11 sites). Ex: `bumpCounter`,
   `recordUnlockDates`, `markEventsSeen`. Truly non-critical;
   failure doesn't affect user's primary task.

2. **localStorage writes** (~9 sites). Ex: counters, streaks,
   snapshots, pins, participation. Fail modes are storage quota,
   third-party blocker, private-mode limits — all genuinely
   "should never crash the app for this." User's primary data
   is in IndexedDB, not localStorage.

3. **UI niceties + callback-safety wrappers** (~8 sites). Ex:
   `e.target.select()` in share dialog, user-provided `onChange`
   callbacks wrapped at their call sites. Defensive against
   malformed callbacks or non-text-input elements.

None of the reviewed catches hide real bugs. Pattern is correct.

New utility shipped alongside this audit: `utils/best_effort.js`
provides `bestEffort(fn, tag)` and `bestEffortAsync(fn, tag)`
helpers that swallow-and-log-debug. Incremental adoption —
existing inline catches are fine; new code should prefer the
helper, and touched files can migrate their catches opportunistically.

### What I did NOT find

- No TODO/FIXME/XXX/HACK markers in source code. Clean.
- No unused `import` statements detected by the quick heuristic.
- No obvious infinite-loop or recursion hazards.
- Recent `fix:` commits all look like real customer-facing bugs, not
  firefighting regressions from rushed earlier commits. Good pattern.

---

---

## Narrow-predicate audit — "does this check everything it should?"

**Status: open.** Related to the Apr 18 audit but called out as its
own item because the SHAPE of the bug is so specific it's worth a
dedicated pass.

**The bug pattern:** a predicate was written to answer a question
("does the user have unsaved changes?") at an early point in the
codebase. Features were added that introduced new kinds of user-
initiated changes (reorder overrides in 7e, rename state in the
rename commit, Lore overrides in the parity refactor). The predicate
was NOT updated to include the new sources. Result: the predicate
silently under-reports.

The Apr 18 softlock bug was exactly this:
  setSaveEnabled(stage.hasChanges() || pendingDeletions.size > 0)
returned false when the user had ONLY made reorder/rename changes,
because neither touches `stage` or `pendingDeletions`. Save button
disabled, user softlocked.

**The audit:** grep for every function/predicate that answers a
"does X?" question about user state. For each, inventory every
kind of user state that currently exists, and confirm the predicate
checks all of them.

Candidate predicates to audit:
- `hasPersistentChanges()` / `hasAnyUnsavedChanges()` — just fixed,
  double-check I didn't miss anything
- `stage.hasChanges()` itself — what KINDS of stage mutation does
  it count? Does it count promotes/demotes correctly? Edits of
  re-edited-to-original text?
- `recomputeBubbles`' `resetMemoryK` / `resetLoreK` logic — when
  SHOULD we reset k? Does it fire in all the right cases?
- `diff.totalChanges` computation — same question as above
- `needsRefresh` / `panelsState` dirty-tracking — do they consider
  all new sources of render-affecting state?
- Achievement unlock predicates — when a new stat lands, does each
  achievement check the right combination?
- Profile "has user done X?" predicates — writing streak detection,
  memory-count milestones, etc.
- Lock reconciliation predicates in `reconcileLocks` — does it
  consider all shapes of membership change?

**Approach:** one predicate at a time. For each:
  1. Read the code
  2. List every piece of state that exists right now
  3. Confirm the predicate covers all of them
  4. If not, broaden it or split into two predicates
  5. Write a test that would have caught the gap

**Scope:** ~5–10 predicates worth checking. Each is small (5–30
lines of change); overall commit size depends on how many gaps exist.
Estimate 300–600 lines total across a few commits.

**Why this pattern keeps happening:** when you add a new feature that
introduces new user state, the responsible thing is to grep for
every predicate that might need to know about it and update each.
That's a step that's easy to forget. The defense is periodic audits
of "every predicate, does it cover everything?" Essentially what
this task is.

---

---

## Code duplication audit + refactor pass

**Status: open.**

The codebase has grown organically across many commits. Several places
have near-duplicate logic that should be extracted. Known hotspots:

- `window_open.js`: handler bodies that do scope dispatch. Some have
  been DRY'd via `byScope(scope)` (this commit), but there's still
  ad-hoc duplication in `onSave`, `hasReorderChanged`, and the panels
  state builder.
- `render/`: `renderBubble`, `renderCard`, and various drag/drop wiring
  have small pockets of duplication around event-handler stopPropagation
  and the "find my parent bubble element" pattern.
- Achievement check loops — each achievement predicate does its own
  "walk user stats" work instead of sharing a scanner.
- Profile rendering — multiple spots build a similar stat-chip DOM
  structure with slight variations.
- `styles.js` — CSS for cards/bubbles has copy-paste structure for
  hover/focus/disabled across similar components.

**Approach:** take one pass per area. Don't do "refactor everything at
once" — each area gets its own commit with tests. Targets:
  1. render/memory_panels.js — extract `buildHeader`, `buildBody`, etc.
  2. window_open.js — extract save-pipeline helpers
  3. profile/* — extract `buildStatChip`, `buildAchievementRow`
  4. styles.js — CSS variables for the repeated palette/sizes

**Scope per pass:** ~100–200 lines each. Three to five commits total.

---

---

## Legacy Perchance code audit

**Status: open.**

We've been treating `vendor/perchance-ai-character-chat/perchance_1.txt`
and `perchance_2.txt` as read-only scaffolding — the fork's promise is
"upstream untouched, we only append." That discipline is correct for
maintainability, but it means we've never actually READ much of the
legacy code with an eye toward "is there low-hanging fruit we could
fix?"

**Plan:**
1. Read through the legacy HTML panel and DSL parser — get a mental map
   of what's there
2. Note anything that looks like a bug, a slowdown, a UX wart, or a
   missed-opportunity affordance
3. For each, decide:
   a. Fork-only fix (we patch it in our build pipeline as a post-
      processing step, upstream untouched)
   b. Contribute upstream (if Perchance accepts PRs)
   c. Document and defer

**Candidates worth checking:**
- The `/mem` and `/lore` slash-command handlers — we already know these
  overlap with our tool; see if their UI can be visually deprioritized
  when our tool is installed
- The memory retrieval logic — is it doing embedding similarity per
  user message, per token, or what? Could our bubble-clustering
  inform better retrieval?
- The stage indicator / message UI — anything we could polish?
- The character creation flow — first-run UX for new users
- Performance on long threads — does the upstream code do anything
  silly like re-rendering the whole chat on every message?

**Scope:** investigation first (~1 day of reading), then per-finding
commits. Likely 3–10 separate commits depending on what we find.

**Risk:** we become the maintainers of a diverging fork. Worth weighing
against the fork promise of "upstream untouched." One mitigation:
build-time patches only (don't edit the vendor file, apply textual
patches in `build/build.mjs` instead). That keeps the vendor file
pristine in git but gives us latitude to fix stuff.

---

---

## Shipped (historical)

For context on what's been built. If a roadmap item moves from pending
to shipped, summarize and move it here so the active roadmap stays
lean.

- **Chat-UI entry-point button** (commit `08cac28`): button below the
  profile mini-card opens the Memory window. `src/render/memory_button.js`,
  `src/profile/index.js`.
- **docs/architecture.md — iframe debugging lesson** (commit `f7eccca`):
  "Debugging in the Perchance iframe" section covers context switching,
  what-context-switching-doesn't-fix.
- **Davie-label redundancy fix** (commit `b30b6ab`): global label
  disambiguation. Multiple clusters with same top-noun now get compound
  labels ("Davie — walks", "Davie — cooking"). `bestLabelCandidates` in
  `ner.js` + `deriveLabels` in `bubbles.js`.
- **Session-persistent locks** (commit `97bcf93`): Memory-scope locks persist
  per-thread via `settings_store`. Reconciles persisted stable-ids
  against fresh clustering using Jaccard similarity on open.
  `src/memory/lock_persistence.js`, wired in `window_open.js`.
- **"What was used?" overlay** (commit `d8442bf`): teal dot on cards
  and "used N×" pill on bubbles when the AI has referenced them in
  the last 10 messages. `loadUsageHistogram` in `db.js`, rendered in
  `memory_panels.js`.
- **Snapshot + restore** (this commit): pre-save auto-snapshot + Restore…
  button with dialog. Stores up to 10 recent snapshots per thread in
  `settings_store`. Ring buffer drops oldest on overflow. Restore builds
  a diff against current baseline and applies via `commitDiff`. Also
  captures a "Before restore" snapshot so the restore itself is
  reversible. `src/memory/snapshots.js`, wired in `window_open.js` and
  `memory_window.js`.
