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

## Save stats / summary UI

After a successful save, the window closes silently. The commitDiff
return value includes stats (`stats.addedMemory`, `stats.reorderedMemory`,
etc.) but they're discarded. Could show a small toast or modal:
"Saved: 3 memories edited, 2 promoted to lore, 15 reordered."

Especially valuable for 7e's reorder-on-save — user wants to know
their reorder actually hit disk, not just "the window closed."

**Scope:** ~60 lines + UI.

---

## "Confirm all destructive batch actions" option

During 7b.3 design, the full-guard option was "confirm delete AND
promote AND demote when any of those are done on a locked bubble."
User chose the middle option (just delete + promote + demote confirm
as currently shipped). The full-guard variant could become a user
preference toggle in settings.

**Scope:** ~20 lines + settings wiring.

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
- **Session-persistent locks** (this commit): Memory-scope locks persist
  per-thread via `settings_store`. Reconciles persisted stable-ids
  against fresh clustering using Jaccard similarity on open.
  `src/memory/lock_persistence.js`, wired in `window_open.js`.
