# Roadmap — Perchance AI Character Chat fork

Future improvements that aren't urgent or don't belong in the current
sprint. Ordered by rough priority, not schedule.


---

## Memory reorder: targeted persistence (post-7e)

**What 7e shipped (baseline):** Proportional message-id remapping. On save,
the final rendered order of unlocked-bubble memories is projected across
the thread's messages — each memory in rendered position `i` out of `N` lands
in the message at position `floor(i * M / N)` where `M` is message count.
Memories in locked bubbles are untouched (see the `locked-stays-put` carve-out
in `commitDiff`). This is the same approach upstream uses in its own `/mem`
editor, so behavior is consistent for users who know both tools.

**Limitation:** If the user edits a single text string but doesn't reorder
anything, they still avoid the remap (7e skips remap when the order hasn't
changed). But if they reorder even one card, EVERY unlocked memory's
message-assignment is rewritten. For users who reorder surgically — move
one card, leave everything else alone — this is overkill.

**Targeted persistence (future work):**

Only rewrite message-assignments for memories the user actually moved.
Distinguish:
- Card was reordered WITHIN its bubble: message-assignment unchanged
  (bubble boundaries don't correspond to message boundaries)
- Card was moved CROSS-BUBBLE: message-assignment should reflect the
  user's new desired position
- Card was locked at open time and stayed locked: untouched (same as 7e)
- Card was never touched: untouched

**Implementation sketch:**
- bubble_overrides.js already tracks `cardToBubbleId` assignments.
  Each entry in that map represents an explicit user relocation.
- Extend `bubbleCardOrder` with a provenance flag: "was this order
  entry authored by the user or reconstructed from clustering?"
- On save, only rewrite message-assignment for (a) cards with an
  entry in `cardToBubbleId`, and (b) cards in bubbles whose
  `bubbleCardOrder` is user-authored.
- For everyone else, preserve `(messageId, level, indexInLevel)`.

**Risk notes:** The "user-authored bubbleCardOrder" distinction needs
to NOT set the flag during `moveCardBefore` calls made during the
cross-bubble-drop sequence (where we're synthesizing the order from the
current state, not the user directly typing "position this here").
Some cross-bubble drops DO warrant marking as user-authored (user is
literally dropping this card at this position in the target). Some don't.
This distinction needs careful design.

**Scope estimate:** ~300 lines + new provenance tracking + tests.
2-3 commits.


---

## Hide upstream `/mem` and `/lore` commands

Upstream ships `/mem` and `/lore` slash-commands in the chat input that
open its own (simpler) memory editors. With our tool available, those
commands are confusing. The original plan was to hide them via CSS
injection.

**Blocked on investigation:** We don't currently know where these
commands appear in Perchance's DOM. Possibilities:
- Menu items in a slash-command popup (typing "/" in chat shows a
  menu) — CSS-hideable via predictable selectors
- Buttons in a toolbar — CSS-hideable
- Pure text commands interpreted by an input handler — CSS can't
  help; would need to intercept the input
- Some mix of the above

Before we can implement, we need to:
1. Open Perchance's chat input, type `/` and see what menu (if any)
   appears. Find the upstream memory/lore items' DOM.
2. Decide on intervention strategy based on what we find:
   - Menu items → CSS `display: none` on matching selectors
   - Input interception → monkey-patch the command dispatcher upstream
     uses (riskier; upstream updates may break our patch)
   - Both → hide the UI and either swallow or rewrite text commands

**Possible deeper improvements once we're in:**
- Instead of hiding, INTERCEPT — show our Memory window when user
  types `/mem` in chat, so the tool works regardless of how they
  invoke it
- If the upstream commands take arguments (e.g., `/mem add Some text`),
  preserve or translate those arguments into our stage.add flow
- Give the user a settings toggle: "Hide upstream's memory commands"
  defaulting to on, so a user who wants both tools can flip it back

**Scope after investigation:** 10-100 lines depending on what we find.


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

## Lore reorder via invented order field

**Status:** Rejected during 7-series planning ("If order doesn't matter
for Lore, then it doesn't need to be sorted"). Keeping on the roadmap
in case the opinion shifts once other features land.

Upstream's lore schema has no order column. Adding one means our fork
diverges: our writes include an `order` field that upstream silently
ignores. Our reads would honor it. This creates a "lore order" that
only exists inside our tool — fine for cosmetic sorting, weird for
anything else.

**Scope:** ~80 lines in db.js (migration + read/write honoring order)
+ UI wiring to enable Lore grips (currently hardcoded off).

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
`createMemorySettingsDrawer`. Candidates from the original roadmap:

- Snapshot ring-buffer size (currently hardcoded 10)
- Usage histogram window (currently hardcoded last-10 messages)
- Lock reconciliation threshold (currently uses renameThreshold —
  could decouple if users ever ask)
- K-cluster recommendation tuning
- Auto-save behavior (currently off by default)

Each new row is ~30 lines in `memory_settings_drawer.js` + a default
in `settings.memory.tool` + a consumer in the relevant module. No
plumbing-pass required.



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

### Still open
- **30-day sparklines for counters.** Counters are lifetime totals
  today; a sparkline showing the last 30 days would feel more
  dynamic and give users a "I used this a lot this week" signal.
  Would require adding a daily-bucket histogram alongside lifetime
  counters (`countersByDay: { '2026-04-18': { memorySaves: 3 } }`).
  Plus UI to render it. ~150 lines.
- **Weekly prompts completed BY CATEGORY tracking.** Currently we
  track completedByWeek as a flat list. A category breakdown
  (writing prompt vs roleplay prompt vs worldbuilding, etc.) would
  let us surface "your preferred prompt type" and tier achievements
  on variety. ~100 lines.
- **Holiday event participations.** We track seenEventIds but not
  any engagement signal beyond viewing. Could add "acknowledged",
  "responded", "added to chronicle" states. ~80 lines.
- **Per-thread counter breakdowns.** Today counters are global;
  breaking them down per-thread could surface "your Davie thread
  has the most memory edits" kind of insights. ~200 lines.

These remaining items are all additive and can be tackled
independently. None are blockers for the gamification roadmap
item — the core counter data is there now.


---

## Achievement levels + profile gamification

**Status: PARTIAL. Tiered counter-backed achievements shipped.**

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

### Remaining
- **User archetypes** — the "Casual / Twice-weekly / Daily / RP /
  Storyteller" classification that the user asked for. Unlike
  tiered counter achievements (which reward doing a lot of ONE
  thing), archetypes reward patterns across MANY signals:
  - Casual: profile opened ~weekly, small counter totals
  - Twice-weekly: steadier cadence, moderate counters
  - Daily: high cadence, high counters
  - RP: character creation, long threads, in-character writing
    style indicators
  - Storyteller: long-form writing, multi-session continuity,
    snapshot restoration pattern, rename activity
  Each archetype = achievement that unlocks when a WEIGHTED
  combination of signals crosses a threshold. ~200 lines.
- **Profile flair unlocks** — titles, avatar borders, accent colors
  pinned to achievements/archetypes. Requires flair-storage field
  in settings, flair-picker UI in profile, rendering in splash +
  mini-card. ~200 lines.
- **Personal-best notifications** — "beat your personal best in
  words this session" toast. Needs per-session snapshot of relevant
  stats at session start, comparison at end. ~80 lines.
- **Shareable profile cards** — opt-in canvas-rendered image or
  share-link with user's stats. Opens share sheet / copy-to-
  clipboard. Privacy-sensitive; must exclude any identifying
  details by default. ~200 lines.
- **Summary notifications** — opt-in weekly/monthly summary toast
  or mini-card pulse ("this week: 3 memory saves, 12 bubble
  renames"). Needs a scheduler + a summary composer. ~150 lines.

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

## Light audit findings (Apr 18) — needs deeper pass

**Status: notes from a surface-level sweep.** A deeper audit is owed
before the code-duplication refactor pass lands. These are things that
looked suspicious or worth a closer look; most are not bugs, some are.

### Potentially-stale code

- `src/utils/escape.js` exports `escapeHtml` which is referenced from
  zero files in `src/`. Either it's dead code (delete) or it was
  meant to be used in places that now do direct `textContent`
  assignment (keep, find the right callers, or explicitly document as
  "kept for future HTML-building paths"). **Action:** decide in the
  refactor pass.

- `src/bootstrap.js` correctly has no importers (it's the entry point
  invoked by the manifest). Noted here so it doesn't get accidentally
  flagged as dead later.

### Residual memory/lore duplication after byScope

The byScope dispatch handled the obvious hotspots (onChangeK,
onReorderBubble, etc.) but `src/memory/window_open.js` still has many
direct `memoryOverrides.` and `loreOverrides.` references in:

  - `recomputeBubbles` — direct refs for lockedBubbles
  - `onDeletePanelDrop` — direct deletion of lockedBubbles entries
  - `hasReorderChanged` — only checks `memoryOverrides`; should also
    check loreOverrides for the new Lore reorder-in-session state,
    OR explicitly document that Lore reorder doesn't participate in
    save-dirty tracking
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

`grep addEventListener / removeEventListener` across src/:

  - memory_panels.js: 23 adds, 0 removes
  - gender_square.js: 5 adds, 0 removes
  - dom.js: 3 adds, 0 removes
  - about_section.js: 1 add, 0 removes
  - profile/index.js: 1 add, 0 removes
  - bootstrap.js: 1 add, 0 removes

For the panels / gender_square / form inputs, the listeners live on
elements that get replaced wholesale by `replaceContents` on every
render — so the DOM nodes disappear and their listeners go with them
(no leak, since we don't retain references elsewhere). That's
probably fine but WORTH VERIFYING in the deeper audit. If any
element persists across renders and gets listeners re-added, we have
an accumulating leak.

The profile and bootstrap additions are one-shot on mount; those are fine.

**Action:** deeper audit to verify DOM-replacement path really does
discard old listeners, and instrument in dev-mode if uncertain.

### Timers

  - `setInterval` in `profile/index.js` refreshes profile card
    periodically — never cleared. On profile close, still running.
    Probably harmless (refreshes a detached DOM node), but
    leak-shaped.
  - Several `setTimeout`s across details_form, overlay,
    gender_square for debounce/focus — these are one-shot and
    don't leak.

**Action:** add clearInterval on profile close.

### Sparse test coverage on render/ modules

None of the `src/render/*.js` files have unit tests. Rendering is
historically harder to unit-test — we've leaned on the real
Perchance integration for confidence. Reasonable for now, but means
a regression in render code only surfaces when user hits Save or
similar. Worth a conversation about whether we want a jsdom-based
test harness for panels/overlay.

**Action:** design decision for future. Not blocking.

### Empty / best-effort error swallows

15+ `catch { /* best-effort */ }` blocks across the codebase. Most
wrap a localStorage.setItem or an analytics-like call that genuinely
should be non-fatal. A deeper audit should:

  - Confirm each is genuinely "should never crash the app"
  - Verify that swallowed errors aren't hiding a real bug by logging
    them (even at debug level) in a dev build

**Action:** per-catch review in the refactor pass.

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
