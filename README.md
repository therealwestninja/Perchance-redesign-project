# Perchance AI Character Chat — Redesign Fork

A feature-rich fork of [Perchance's AI Character Chat](https://perchance.org/ai-character-chat) that adds **35+ chat tools**, a **gamified profile system**, a **memory manager**, and a **design-truth dark-parchment UI** — all running client-side in your browser with zero accounts or servers.

**119 modules · 942 tests · MIT license**

---

## What makes this different

| Vanilla Perchance | This fork |
|---|---|
| Basic chat interface | 30+ tools in a popup grid (anti-repetition, glossary, dice, voice, branching...) |
| No memory management | Full memory manager with drag-and-drop columns, snapshots, lore ordering |
| No profile/identity | Gamified profile: avatar, level, XP, 42 achievements, 24 accent colors |
| No sharing | Shareable profile links with rich card viewer |
| Generic styling | Dark-parchment RPG aesthetic with customizable theme colors |

---

## Chat Tools (30 modules)

Every tool lives behind a single **⚙ Tools** button that opens a popup grid — no UI clutter.

### AI Intelligence
- **Dynamic Glossary** 📖 — keyword-triggered lore injection with recursive scanning (2 levels deep)
- **Auto-Lorebook** 🔮 — AI generates glossary entries from your conversation
- **Auto-Summary** — compresses older messages into a paragraph injected into context
- **Anti-Repetition** 🚫 — word/phrase banlist + auto-detection of repeated phrases
- **User Persona** 👤 — define your character (name + description), injected into every AI prompt
- **Quick Reminder** 📌 — persistent instruction injected before every AI reply
- **Prompt Presets** 📋 — save and load prompt templates

### Writing & Generation
- **Writing Enhancer** ✨ — AI rewrites your message with more detail
- **Impersonation** ✍ — AI writes as your character
- **Narration** 🎬 — generate scene narration
- **Image Generation** 🖼 — in-chat AI image generation
- **Voice I/O** 🎤🔊 — speech-to-text input + text-to-speech output
- **Reasoning Toggle** 🧠💭 — show/hide AI reasoning

### Chat Management
- **Message Controls** — per-message copy, edit, delete, regenerate
- **Conversation Branching** ◀1/3▶ — navigate between regenerated alternatives
- **Chat Search** — search through message history
- **Stop Generating** ⬛ — interrupt AI generation mid-stream
- **Chat Export** ⬇ — download chat as text/JSON
- **Thread Archive** 📥 — archive and restore threads
- **Bulk Threads** ☐ — multi-select thread operations
- **Timestamps** — time stamps on new messages

### Characters & World
- **Character Browser** 👥 — searchable grid of all your characters
- **Character Cards** 🃏 — import/export in SillyTavern-compatible JSON format
- **Document Analysis** 📎 — upload a text file and chat about its contents
- **Dice Roller** 🎲 — /roll XdY+Z command for TTRPG play

### Customization
- **Theme Toggle** ☀🌙 — dark/light mode
- **Custom Backgrounds** 🏞 — per-chat background images
- **Font Settings** Aa — font family + size controls
- **Fullscreen** ⛶ — distraction-free mode
- **Generation Settings** ⚙ — temperature + max tokens overrides
- **Keyboard Shortcuts** ⌨ — configurable hotkeys
- **Code Highlighting** — syntax highlighting in AI responses
- **Token Display** — live token count in the header

---

## Profile System

### Hero Card
Avatar with ornate gold ring · display name · italic title · level chip with XP bar · hexagonal pinned badges · share button

### Gamification
- **91 achievements** across 5 rarity tiers (Common → Legendary)
- **Leveling system** with XP derived from chat activity
- **Archetype classification** based on play style
- **24 accent colors** unlocked through achievements
- **Theme color pickers** — customize background gradient (unlock at 15% and 25% achievements)

### Shareable Profiles
Generate a link that shows your profile card to anyone — level circle, stats, badges, XP bar, all themed to your accent color.

---

## Memory Manager

Three-column drag-and-drop interface for managing AI memory:
- **Active memories** — currently injected into AI context
- **Stored memories** — saved but not active
- **Delete zone** — drag to remove
- **Snapshots** — save and restore memory states
- **Lore ordering** — control injection priority

---

## Design

The UI follows a design-truth document (`docs/design-truth/profile-card-v1.html`):

- **Palette**: ink blacks, vellum text, gold accents, crimson, silver
- **Typography**: Georgia serif headings, monospace data labels, system sans body
- **Elements**: conic-gradient avatar ring, hexagonal badges, 3D gold buttons
- **Customizable**: Primary + Secondary background colors via achievement-gated pickers

---

## Architecture

```
vendor/                    ← Upstream Perchance (untouched)
src/
  chat/        (42 files)  ← Chat tool modules
  render/      (20 files)  ← UI rendering
  profile/     (12 files)  ← Profile logic
  memory/      (10 files)  ← Memory manager
  stats/        (5 files)  ← Chat statistics
  achievements/ (4 files)  ← Achievement system
  events/       (3 files)  ← Event participation
  utils/        (5 files)  ← DOM helpers, formatting
build/
  build.mjs                ← Bundler (single IIFE)
  perchance_2.txt          ← Final output
test/           (51 files) ← 942 tests
docs/
  design-truth/            ← Visual mockups
  architecture.md          ← Technical decisions
```

All modules share a flat IIFE scope. The bundler reads `src/manifest.json` and concatenates into a single `<script>` block appended to the upstream code.

**AI injection**: All context modifications (glossary, summary, persona, anti-repetition, document, gen settings) flow through a single `aiTextPlugin` monkey-patch in `stop_generating.js`.

---

## Installation

1. Fork [Perchance AI Character Chat](https://perchance.org/ai-character-chat)
2. Replace `perchance_2.txt` with `build/perchance_2.txt` from this repo
3. Save and reload

Development:

```bash
git clone https://github.com/therealwestninja/Perchance-redesign-project.git
cd Perchance-redesign-project
npm install
npm test        # 943 tests
npm run build   # → build/perchance_2.txt
```

---

## Credits

- **Upstream**: [Perchance AI Character Chat](https://perchance.org/ai-character-chat)
- **Research**: FurAI, Kustom-GPT, URV-AI (all MIT) — glossary algorithm, feature patterns
- **Inspiration**: SillyTavern WorldInfo, NovelAI lorebooks
- **License**: MIT

## Recent additions (April 2026)

### Daily Quests
A sealed quest card appears each day. Click to reveal — a seal-break animation plays while the AI generates a creative writing quest from a date-seeded theme (30 themes, deterministic hash). Quest results are cached per-day. Complete quests to earn achievements.

### Tool consolidation
The **AI Writer** (✍) merges impersonation, narration, enhancer, and recap into a single mode-picker dropdown. The **Context Editor** (📝) merges glossary, banlist, reminder, and persona into a tabbed modal. The Tools menu organizes everything into labeled categories (AI, Context, World, Chat, Characters, View).

### Share codes (pf3 binary format)
Share codes are now **86% smaller** than the original format. Instead of encoding text, pf3 sends numeric indices into the achievement registry (1 byte per badge), archetype enum, and accent palette. Only the display name is raw text. A 36-char code replaces a 252-char code. All three formats (pf1/pf2/pf3) decode transparently.
