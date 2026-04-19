# Theme polish — Bug 2, Idea 1, Idea 2

This zip contains all files touched for the accent-theming sprint,
commits `dd41403` through `9af5dff`.

## Commits in this zip

    dd41403   fix: profile accent consistency — swap hardcoded amber
              to accent-with-fallback (Bug 2)

    a583e05   feat: 24-color accent palette — Traveler's satchel,
              Veteran's cache, Legendary regalia (Idea 1)

    9af5dff   feat: mini-card fresh-pulse on new unlocks; remove
              reveal toasts (Idea 2)

## What to expect when testing

### Accent consistency (Bug 2 — `dd41403`)

Open the profile, pick a non-amber accent from the color picker.
The following surfaces should now tint to your pick:

    - Splash title color
    - Level badge + XP bar + XP bar border
    - Pinned achievement badges (border)
    - Avatar preview border + inner text
    - Activity chip hover border
    - Chronicle stat bars
    - Radar chart fills + dots
    - Prompt item focus borders + cadence toggle active state
    - Archive section week keys + counts
    - Backup action button hover
    - Gender square focus ring + dot
    - Event group border + name color
    - Share dialog preview name
    - Mini-card pending pulse (was always amber)
    - Mini-card avatar dot

NOT themed (intentional):

    - Memory tool's locked-bubble gold icons (domain-semantic
      "gold = locked")
    - Memory tool's drop-gap indicator
    - Memory tool's import-warn banner

### 24-color palette (Idea 1 — `a583e05`)

The picker has 24 swatches laid out in 3 rows of 8.

    Row 1   Traveler's satchel
            amber ▪ sage ▪ ash ▪ clay                   (4 free)
            moss ▪ mist ▪ honey ▪ rust                  (bronze-gated)

    Row 2   Veteran's cache
            iron ▪ copper ▪ jade ▪ slate                (silver-gated)
            wine ▪ ocean ▪ plum ▪ silver                (gold-gated)

    Row 3   Legendary regalia
            pink ▪ purple ▪ sky                         (legendary + X)
            gold ▪ ruby ▪ teal                          (2/3/5 legendaries)
            pearl ▪ obsidian                            (endgame)

The six colors you named as hardest (pink, purple, light-blue,
gold, red, teal) all live in row 3. Pink/purple/sky require
1 legendary PLUS a second condition (all 5 prompt categories,
30-day streak, or 5 distinct events respectively). Gold/ruby/
teal need 2/3/5 legendaries. Pearl and obsidian are pure
grind — 10 epics + 15 events for pearl; every endgame condition
met for obsidian.

### Migration — 5 legacy accent IDs will silently fall back to amber

The prior palette had these accents:

    forest, azure, rose, violet, crimson

None of these IDs survive in the new 24-color palette. If you
(or any future user of the fork) had one of these picked as their
accent, `resolveActiveAccent` silently falls back to amber on the
next open — consistent with the pre-existing "picked but no longer
eligible" behavior. Just re-pick from the new picker.

Slate kept the same ID (#7a96a8) but its unlock moved from
"3 bronze" to "5 silver" for its new home in row 2. If you had
slate unlocked at 3 bronzes and don't yet have 5 silvers,
you'll briefly fall back to amber until you earn your way up.

### Aspirational colors

Today only ONE achievement has `tier: 'legendary'` (streak_100day).
That means these accents are currently unreachable:

    gold      — needs 2 legendaries
    ruby      — needs 3
    teal      — needs 5
    obsidian  — needs 5 + three more conditions

They'll show as locked in the picker with their unlock hint. Once
more legendaries are added to the registry in future work, these
become reachable. Intentional — the palette is designed to always
show "what's next" rather than cap at "you've seen everything."

### Mini-card pulse + toast removal (Idea 2 — `9af5dff`)

Before:
    - Pop-up celebration toasts on profile open ("NEW PERSONAL BEST:
      1,200 words")
    - Weekly recap toast ("THIS WEEK: 2.1k words, 3 prompts, 1 event")

After:
    - No toasts on profile open
    - Mini-card pulses brighter + wider when pendingCount just
      increased ("fresh pulse"): wider shadow, subtle scale, 3
      iterations (~9.9s), then settles to the normal ambient pulse
    - Click or Enter/Space on the mini-card cancels the fresh pulse
      immediately ("got your attention, stop waving")
    - All the personal-best + summary content still exists — just
      inside the profile now (the chips in the splash + the activity
      summary section) instead of as pop-ups over your chat

The "friendly neighbor waving you over" behavior: the sidebar
mini-card invites attention, and the reveal happens once you
click in.

Reduced-motion users see the ambient + fresh pulses both killed
but keep the amber dot + border color change, so the state is
still conveyed visually.

## Files in this zip

    build/perchance_2.txt                 rebuilt bundle
    src/profile/flair.js                  ACCENTS rewritten to 24,
                                          +hexToRgb, +resolveAccentVars
    src/profile/full_page.js              toasts removed, side-effect
                                          calls retained; both applyAccent
                                          sites set --pf-accent and
                                          --pf-accent-rgb
    src/profile/index.js                  +detectFreshIncrease export,
                                          lastPendingCountSeen tracked,
                                          isFreshlyIncreased flagged on
                                          view model
    src/render/mini_card.js               closure timer for fresh-pulse,
                                          click/keypress cancels
    src/render/styles.js                  66 amber→accent swaps across
                                          45 profile selectors, new
                                          fresh-pulse keyframe + class,
                                          .pf-accent-row max-width:328px
    test/flair.test.mjs                   updated for new palette + 15
                                          new tests (hexToRgb, resolveAccentVars,
                                          new unlock criteria)
    test/fresh_pulse_detection.test.mjs   NEW — 7 tests covering the
                                          freshly-increased transition rule

## Tests + build

849 tests passing (was 827 before the sprint, +22 net).
Build: 74 modules, ~1.54 MB, parses clean.

## Known residue

Bug 1 (picker hover "first color animates regardless") was likely
a manifestation of Bug 2 — the splash title was hardcoded amber,
so it stayed amber even when you hovered a different swatch. Bug 2's
fix addresses that root cause. Please retest the picker hover
behavior — if something still animates the wrong way, describe
exactly what you see and I'll dig in with targeted follow-ups.
