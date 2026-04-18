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

## Chat-UI entry-point button

Currently `window.__perchance_fork__.openMemory()` has to be called from
the DevTools console in the iframe context. No in-UI button exists.

**What's needed:** A small button or link in Perchance's chat UI (maybe
next to the chat input, or in the profile overlay we ship) that calls
`openMemory()` directly. No keyboard shortcut unless the user specifies
one — hotkey collision risk inside the iframe is high.

**Scope:** ~40 lines. 1 commit.

---

## Hide upstream `/mem` and `/lore` commands

Upstream ships `/mem` and `/lore` slash-commands in the chat input that
open its own (simpler) memory editors. With our tool available, those
commands are confusing. Hide them via CSS injection — their DOM lives
under a predictable selector we can match.

**Scope:** ~10 lines of CSS. 1 commit.

---

## docs/architecture.md — document the iframe debugging lesson

During 7b's development we burned multiple debugging rounds because the
Perchance output iframe is on a cross-origin subdomain. `window.__perchance_fork__`
is only accessible from within the iframe's JS context — not from the
parent page's console. DevTools' "context dropdown" (top-left of Console
panel) needs to be switched to `outputIframeEl` before any of our fork's
debugging surface is available.

Journal this in docs/architecture.md so future contributors (or future
Claude sessions) don't re-learn it the hard way.

---

## Davie-label redundancy fix

When multiple bubbles share the same most-frequent proper noun, the
labeler emits the same label for all of them ("Davie", "Davie", "Davie").
Fix: diversify via second-most-frequent term per cluster.
- Bubble with "Davie + walks": label "Davie — walks"
- Bubble with "Davie + bath": label "Davie — bath"

Already discussed during 7b development, not yet acted on.

**Scope:** ~30 lines in `ner.js` / `bubbles.js` + a few tests. 1 commit.

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
