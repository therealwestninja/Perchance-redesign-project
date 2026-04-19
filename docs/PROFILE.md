# Profile & Achievements Guide

The profile system adds a gamified identity layer on top of the chat. Your profile tracks your activity, rewards milestones, and gives you a shareable card to show off.

---

## Hero Card

Your hero card appears at the top of the Settings overlay. It shows your avatar (with an ornate conic-gradient ring), display name, earned title, level badge with XP progress bar, and up to 6 pinned achievement badges.

Click the **Share** button to copy your profile link to the clipboard. Paste it anywhere — anyone who clicks the link sees your profile card automatically.

---

## Leveling

Your level is derived from total XP earned through activity:

- **Chat messages** — XP for words written
- **Prompt completions** — weekly and event prompts
- **Tool usage** — using the various chat tools
- **Streaks** — consecutive days active

The XP thresholds increase with each level. Your level and XP bar appear on your hero card.

---

## Achievements

There are **91 achievements** across **9 categories** and **5 rarity tiers**.

### Tiers
| Tier | Count |
|---|---|
| Common | 26 |
| Uncommon | 15 |
| Rare | 24 |
| Epic | 17 |
| Legendary | 9 |

### Categories

**Writing** ✎ — Word counts and prose volume. From "First Word" (1 message) to "Novelist" (100,000 words).

**Stories** ❧ — Characters, threads, and worldbuilding. Cast size, thread depth, lore entries. Includes "Epic Arc" (500-message thread) and "Cosmologist" (200 lore entries).

**Prompts** ❝ — Prompt completions and exploration. Weekly prompt engagement, category breadth, specialist depth.

**Consistency** 🔥 — Active periods and streaks. From "Three-Day Groove" (3-day streak) to "Centurion" (100-day streak).

**Curation** ⚙ — Memory tool use: organizing, renaming, reordering bubbles and cards.

**Preservation** 💾 — Snapshots, backups, and restoration.

**Creation** ✨ — Characters spawned from memory.

**Events** 🎉 — Holiday and event participation. Responding to themed prompts during calendar events.

**Tools** 🔧 — Chat tool usage. Earned by using the glossary, dice roller, voice input, bookmarks, AI writer, document upload, and more. Includes "Tool Explorer" (use 5 different tools) and "Tool Master" (use 8).

### Quest Achievements
| Achievement | Tier | How to earn |
|---|---|---|
| Quest Seeker | Common | Reveal your first daily quest |
| Quest Completer | Uncommon | Complete 5 daily quests |
| Quest Devotee | Rare | Complete 30 daily quests |
| Quest Legend | Epic | Complete 100 daily quests |

---

## Accent Colors

24 accent colors are available to theme your profile: amber (default), sage, ash, clay, moss, mist, honey, rust, iron, copper, jade, slate, wine, ocean, plum, silver, pink, purple, sky, gold, ruby, teal, pearl, obsidian.

Colors are selected in the Details section of your profile settings.

### Theme Color Pickers

At 15% achievement completion, you unlock the **Secondary** background color picker. At 25%, you unlock the **Primary** background color picker. These control the background gradient of the Settings overlay.

---

## Sharing

Profile sharing is a one-click flow:

1. Click **Share** on your hero card
2. A link is copied to your clipboard (toast confirmation: "Copied to clipboard!")
3. Paste the link on Discord, Twitter, Reddit, wherever
4. Anyone who clicks your link sees your profile card automatically

### How it works (technical)

Your profile data is encoded as a **pf3 binary share code** — a compact binary format where badges are achievement indices (1 byte each), archetype is an enum index, accent is a palette index, and only the display name is raw text. The resulting code is about 36 characters long and is embedded in the URL as a `?h=` parameter.

When someone visits the URL, the boot code reads the `?h=` parameter, decodes the binary data, reconstructs the full profile card from local registries, and displays it in a viewer overlay.

---

## Daily Quests

A sealed quest card appears each day in the Prompts section. The mechanic works like a prize reveal:

1. A sealed card shows a "?" icon with the day's theme keyword
2. Click to reveal — a seal-break animation plays
3. While the animation runs, the AI generates a creative writing quest
4. The quest text appears with a fade-in animation
5. Click "Mark as complete" when you've done it

### Themes

30 quest themes cycle deterministically by date, so everyone gets the same theme on the same day: stranger, secret, storm, memory, rival, silence, gift, crossroads, wound, festival, midnight, letter, threshold, mask, bargain, echo, compass, forge, trespass, debt, mirror, hunger, bridge, omen, trade, sanctuary, shadow, lantern, oath, tide.

Quest results are cached in localStorage, so reopening the card shows the same quest. A new day brings a fresh sealed card.

---

## Events Calendar

The prompts system includes a calendar of themed events throughout the year. During an event's window, its themed prompts appear as a banner-marked group above the regular weekly prompts. Participating in events earns the Celebrant achievement chain.

Events include New Year's, Valentine's Day, Pi Day, World Poetry Day, Earth Day, and many more — 56 events total covering the full calendar year.

---

## Archetypes

Your play style is classified into an archetype based on your activity patterns:

| Archetype | Description |
|---|---|
| Newcomer | Just getting started |
| Storyteller | Writes long, narrative messages |
| Roleplayer | Focuses on character interaction |
| Daily User | Active every day |
| Regular | Consistent, steady engagement |
| Casual | Drops in occasionally |

Your archetype appears on your hero card and in shared profile links.
