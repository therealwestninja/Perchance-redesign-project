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

## Commit 3 — merge/split/rename bubble gestures

User can:
- Drag bubble A onto bubble B → merge into one bubble
- Context menu on bubble → "Split this bubble at card N"
- Double-click bubble label → edit label inline

Deferred during 7d planning. Complex but self-contained.

**Scope:** ~250 lines + tests. 2-3 commits.

---

## Commit 4 — drag bubble → new character

Drag a Memory bubble outside the Memory panel → create a new character
in the profile system populated with that bubble's entries. Would let
users spin off ancillary characters from a main thread.

Requires coordination with the profile system we built earlier.

**Scope:** unclear, high. ~500+ lines.

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

## Stale-baseline save bug (known issue)

**Status: KNOWN, test skipped, fix pending.**

`test/memory_db.test.mjs` has a `test.skip(...)` reproducer named
"commitDiff reorder: external edit is overwritten by stale baseline."
It documents this scenario:

1. User opens our Memory window. Baseline snapshotted (text = "X").
2. User edits the same memory externally via Perchance's `/mem` or
   brain-icon (text now = "Y").
3. User saves from our tool with reorder active (7e proportional remap).
4. Our save writes the stale baseline text "X" back to Dexie,
   silently overwriting "Y".

**Severity:** data loss, but low likelihood — requires user to actively
have both our tool AND Perchance's native mem editor open simultaneously.

**Fix sketch:** in `db.js` `commitDiff`'s reorder block, re-read the
CURRENT `memoriesEndingHere` for each affected message inside the
transaction (before writing) and merge:
  - Our baseline-tracked entries overwritten with our current text
  - Entries present in the current DB but NOT in our baseline
    preserved (they're external additions since we opened)
  - Entries in our baseline but missing from current DB treated as
    external deletions (don't re-add)

Alternatively: compute a hash of `memoriesEndingHere` at baseline time,
compare before write. Abort save with "thread was modified externally,
reload?" prompt if different. Simpler but more intrusive.

**Scope:** ~30 lines in `commitDiff` + unskip the existing test.

---

## Save stats / summary UI

After a successful save, the window closes silently. The commitDiff
return value includes stats (`stats.addedMemory`, `stats.reorderedMemory`,
etc.) but they're discarded. Could show a small toast or modal:
"Saved: 3 memories edited, 2 promoted to lore, 15 reordered."

Especially valuable for 7e's reorder-on-save — user wants to know
their reorder actually hit disk, not just "the window closed."

**Scope:** ~60 lines + UI.

---

## Settings modal + rename threshold slider

**Status: follow-up to rename-bug-fix commit.**

The rename bug fix uses a hardcoded Jaccard threshold of 0.5 (same as
lock reconciliation) to decide when a rename survives a membership
change. Users may want to tune this.

Plan: add a `⚙` gear icon to the Memory window header. Click opens a
modal with tool settings. First entry: rename-survival threshold slider
(range 0–1, step 0.05, default 0.5). Persist to
`settings.memory.tool.renameThreshold` via `settings_store`. Pass
threshold through to `applyOverrides` in `window_open.js`.

Extensible for future tunable knobs: snapshot ring-buffer size
(currently 10), usage histogram window (currently 10 messages), lock
reconciliation threshold (currently 0.5), etc.

**Scope:** ~200 lines + modal + settings plumbing + tests.

---

## "Confirm all destructive batch actions" option

During 7b.3 design, the full-guard option was "confirm delete AND
promote AND demote when any of those are done on a locked bubble."
User chose the middle option (just delete + promote + demote confirm
as currently shipped). The full-guard variant could become a user
preference toggle in settings.

**Scope:** ~20 lines + settings wiring.

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

## Second pass on User Profile — track usage of new features

**Status: open.**

Since the profile shipped, we've added many features whose usage is not
tracked in user stats:
- Bubble tool opens (count, per-thread, per-day)
- Memory bubbles locked / unlocked
- Bubbles renamed
- Cards reordered (intra-bubble, cross-bubble)
- Snapshots used (`Restore` button clicks)
- Export backups created
- Prompt archive views
- Focus mode toggles
- Weekly prompts attempted / completed by category
- Holiday event participations

**Plan:**
1. Extend `user_stats.js` schema with new counters + histograms
2. Instrument call sites (usually a one-line `stats.bump('bubbleToolOpens')`)
3. Surface new stats in profile page — at least a small "tool usage"
   section with a mix of lifetime numbers and 30-day sparklines
4. Migration path for existing users (missing counters default to 0)

**Scope:** ~250 lines across user_stats, profile renderer, instrumentation
points. + tests for counter logic.

---

## Achievement levels + profile gamification

**Status: open.** User note: "I know this is a lot to ask, but I feel
it's important for the overall longevity for Perchance, is having
returning users."

Build on the second profile pass. Achievements currently are flat
badges. Upgrade to tiered/categorized achievements with unlocks:

**Tiered achievements:** Each achievement has difficulty levels:
  - Casual user (once a week, lightweight goals)
  - Twice-weekly user (steady cadence)
  - Daily user (intense engagement)
  - RP user (roleplay-heavy — measured by session length, character
    creation, prompt variety in char-driven threads)
  - Storyteller (long-form writing — measured by char count per thread,
    multi-session continuity, snapshot restoration pattern)

Each tier unlocks as stats cross thresholds. Category-based so users
who use the tool differently still have progression.

**Profile flair unlocks:**
  - Titles (e.g., "Storyteller — Tier 3")
  - Avatar border variants
  - Accent color unlocks
  - Custom background patterns for profile page
  - Badges pinned to mini-card next to chats

**Other gamification:**
  - Streak indicators (N-day usage streaks, N-week streaks)
  - "You beat your personal best" notifications (words per session,
    memory curation counts)
  - Milestone unlocks (100th memory, 50th bubble rename, etc.)
  - Shareable profile cards (opt-in; generates an image or link the
    user can post externally — "look at my writing stats")
  - Weekly/monthly summary emails/notifications (opt-in) — reminder
    to come back

**Rationale:** Perchance needs returning users. Gamification of
existing stats is a low-hanging lever because the stats are already
being tracked. Flair unlocks give users cosmetic reward for
engagement without any pay-to-win dynamics.

**Scope:** Large. Break into:
  1. Tiered schema + threshold table (~150 lines)
  2. Unlock system + flair storage (~200 lines)
  3. Profile flair picker UI (~150 lines)
  4. Share card generator (~200 lines)
  5. Streak tracking (~100 lines)
  6. Summary notifications (~150 lines)
Total ~950 lines across 4–6 commits.

Should only be tackled AFTER:
  - Second-pass user-stats tracking (depends on richer stats being
    available to gamify)
  - Code-duplication refactor pass (don't build on duplicated code)

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
