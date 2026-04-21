# Perchance Hero Chat

A feature-rich fork of [Perchance's AI Character Chat](https://perchance.org/ai-character-chat). 
This updated version adds a full suite of roleplay and writing tools, a gamified profile system, a advanced memory and lore manager, and a polished dark-parchment UI — all running client-side in your browser with zero accounts, zero servers, zero cost.

> **118 modules · 940 tests · 91 achievements · MIT license**

Built by [therealwestninja](https://github.com/therealwestninja) · [DeviantArt](https://www.deviantart.com/west-ninja) · [GitHub](https://github.com/therealwestninja/Perchance-redesign-project)

---

## What is this?

Perchance AI Character Chat is a free, browser-based AI roleplay tool. This fork keeps everything that makes it great — free access, no login, runs anywhere — and adds the tools that serious roleplayers and creative writers have been asking for.

Think of it as the difference between Notepad and VS Code. Same file, way more power.

| Vanilla Perchance | This Fork |
|---|---|
| Basic chat | 40+ tools behind a single ⚙ menu |
| No memory management | Drag-and-drop memory columns with snapshots |
| No profile | Gamified profile: levels, XP, 91 achievements |
| No sharing | One-click shareable profile links |
| No writing aids | Glossary, anti-repetition, persona, AI writer |
| Generic look | Dark-parchment RPG aesthetic with 24 accent colors |

---

## Quick Start

### Use it now
1. Fork [AI Character Chat](https://perchance.org/ai-character-chat) on Perchance
2. Replace `perchance_2.txt` with [`build/perchance_2.txt`](build/perchance_2.txt) from this repo
3. Save and reload — all features are active immediately

### Develop locally
```bash
git clone https://github.com/therealwestninja/Perchance-redesign-project.git
cd Perchance-redesign-project
npm install
npm test          # run 940 tests
npm run build     # outputs build/perchance_2.txt
```

---

## Features

### Chat Tools (42 modules)

All tools live behind a single **⚙ Tools** button organized into labeled categories. No clutter.

| Category | Tools |
|---|---|
| **AI** | AI Writer (✍ impersonate, 🎬 narrate, ✨ enhance, 📜 recap) |
| **Context** | Context Editor (📖 glossary, 🚫 banlist, 📌 reminder, 👤 persona), 📊 Context Dashboard |
| **World** | 🎲 Dice Roller, 📎 Document Analysis, 🔮 Auto-Lorebook |
| **Chat** | ⬇ Export, 📥 Archive, 🔖 Bookmarks, Chat Search, ◀1/3▶ Branching |
| **Characters** | 👥 Character Browser, 🃏 SillyTavern Card Import/Export |
| **View** | ☀🌙 Theme, Aa Fonts, ⛶ Fullscreen, 🏞 Backgrounds, 🧠 Reasoning |

Plus: stop generating, token display, timestamps, keyboard shortcuts, code highlighting, voice I/O, image generation, auto-summary, generation settings, bulk thread ops, and per-message controls (copy/edit/delete/regenerate).

> **[Full tool documentation →](docs/TOOLS.md)**

### Profile System

- **Hero Card** — avatar with ornate gold ring, display name, title, level badge, XP bar, pinned badges
- **91 achievements** across 9 categories and 5 rarity tiers (Common → Legendary)
- **Leveling** — XP from chat activity, prompt completions, event participation
- **24 accent colors** — unlockable palette for your profile theme
- **One-click sharing** — click Share, link is copied, paste anywhere
- **Daily Quests** — AI-generated creative writing challenge each day with a sealed-card reveal mechanic

> **[Profile and achievements guide →](docs/PROFILE.md)**

### Memory Manager

Three-column drag-and-drop interface for organizing AI memory and lore. Active memories are injected into the AI's context. Snapshots let you save and restore memory states. Lore ordering controls injection priority.

### AI Context Pipeline

Seven sources are automatically injected into every AI message, all visible in the **Context Dashboard (📊)**:

1. **Glossary** — keyword-triggered lore definitions (recursive 2-level scan)
2. **Summary** — auto-compressed older conversation context
3. **Document** — uploaded text file content
4. **Anti-repetition** — word banlists + auto-detected repeated phrases
5. **Persona** — your character's name and description
6. **Reminder** — persistent instruction before every reply
7. **Gen settings** — temperature and max token overrides

### Design

Dark-parchment RPG aesthetic following a [design-truth document](docs/design-truth/profile-card-v1.html). Ink blacks, vellum text, gold accents, Georgia serif headings, monospace data labels. Background gradient colors are customizable via achievement-gated pickers.

---

## How To

### How do I use the tools?
Click the **⚙ Tools** button near the chat input. Tools are organized into categories (AI, Context, World, Chat, Characters, View). Click any tool to open it.

### How do I set up a glossary?
Open **⚙ Tools → 📝 Context Editor → 📖 Glossary tab**. Add entries as `keyword = definition`, one per line. Keywords are automatically detected in conversation and their definitions are injected into the AI's context.

### How do I share my profile?
Click the **Share** button on your hero card. The link is copied to your clipboard. Paste it anywhere — when someone clicks your link, your profile card opens automatically.

### How do I import SillyTavern characters?
Open **⚙ Tools → 🃏 Character Cards**. Import `.json` character card files or export your characters in the same format.

### How do I roll dice?
Type `/roll 2d6+3` in the chat input. Supports standard `XdY+Z` notation.

### How does the AI Writer work?
Open **⚙ Tools → ✍ AI Writer** and pick a mode: Impersonate (AI writes as you), Narrate (scene description), Enhance (rewrite your draft), or Recap ("Previously on..." summary).

### How do I earn achievements?
Achievements unlock automatically from your activity — writing, completing prompts, using tools, maintaining streaks, participating in events. Check progress in the Achievements section of your profile.

### How do daily quests work?
A sealed quest card appears each day. Click to reveal — the seal breaks while the AI generates a creative writing challenge themed to that day (30 themes cycling deterministically). Complete quests to earn achievements.

---

## Documentation

| Document | Description |
|---|---|
| **[Tools Guide](docs/TOOLS.md)** | Detailed reference for all 42 chat tools |
| **[Profile & Achievements](docs/PROFILE.md)** | Profile system, 91 achievements, sharing, daily quests |
| **[Architecture](docs/ARCHITECTURE.md)** | Modules, bundling, AI injection pipeline, build system |
| **[FAQ](docs/FAQ.md)** | Common questions and troubleshooting |
| **[Roadmap](ROADMAP.md)** | Planned features and current status |
| **[Credits](CREDITS.md)** | Upstream sources, research, and inspiration |

---

## FAQ

**Is this free?**
Yes. Perchance is free, this fork is free, and it always will be. MIT license.

**Do I need an account?**
No. Everything runs in your browser. Your data lives in localStorage and IndexedDB on your machine.

**Will this break my existing setup?**
No. The fork adds to the upstream code without modifying it. Your characters, threads, and settings are preserved.

**How big is the build?**
About 1.86 MB for the full `perchance_2.txt`. This includes all 118 modules, CSS, and the upstream Perchance code.

**Can I contribute?**
Yes. The repo is public under the MIT license. Fork, change, PR.

> **[More FAQ →](docs/FAQ.md)**

---

## Credits

- **Author**: [therealwestninja](https://github.com/therealwestninja) — [DeviantArt](https://www.deviantart.com/west-ninja)
- **Upstream**: [Perchance AI Character Chat](https://perchance.org/ai-character-chat)
- **Research**: FurAI, Kustom-GPT, URV-AI (all MIT)
- **Inspiration**: SillyTavern WorldInfo, NovelAI lorebooks
- **License**: [MIT](LICENSE)

© 2026 therealwestninja
