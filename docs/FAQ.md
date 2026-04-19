# Frequently Asked Questions

## General

### Is this free?
Yes. Perchance is free, this fork is free, and it will stay free. The project is MIT licensed.

### Do I need an account?
No. Everything runs in your browser. Your data (characters, threads, settings, achievements) lives in your browser's localStorage and IndexedDB. Nothing is sent to any server.

### Does this work on mobile?
Yes. The UI is responsive and all tools work on mobile browsers. The Tools menu is touch-friendly.

### What browsers are supported?
Any modern browser with ES2020 support: Chrome, Firefox, Safari, Edge. The fork uses standard Web APIs (localStorage, IndexedDB, MutationObserver, Clipboard API).

---

## Installation

### How do I install this?
1. Go to [Perchance AI Character Chat](https://perchance.org/ai-character-chat) and fork it
2. In your fork's editor, replace the contents of `perchance_2.txt` with the file from `build/perchance_2.txt` in this repository
3. Save and reload your fork

### Will this break my existing characters and threads?
No. The fork adds code on top of the upstream Perchance code. Your existing characters, threads, memories, and settings are untouched. The profile system uses its own separate storage key (`pf:settings`).

### How do I update to a newer version?
Download the latest `build/perchance_2.txt` from the repository and replace the file in your Perchance fork again. Your settings and achievements carry over — they're stored in your browser, not in the code.

### Can I go back to vanilla Perchance?
Yes. Just revert `perchance_2.txt` to the original upstream version. Your characters and threads will still be there. Profile data (achievements, settings) will remain in localStorage but won't be visible without the fork code.

---

## Tools

### Where are the tools?
Click the **⚙ Tools** button near the chat input area. All tools are organized into labeled categories.

### I can't find a specific tool
Tools are grouped by category: AI, Context, World, Chat, Characters, View. If you're looking for the glossary, it's under Context. If you're looking for dice, it's under World. Check the [Tools Guide](TOOLS.md) for the full list.

### The AI isn't using my glossary entries
Make sure your glossary entries follow the `keyword = definition` format. The glossary only injects definitions when a keyword appears in the recent conversation. Check the **Context Dashboard (📊)** to verify the glossary is active and see what's being injected.

### My anti-repetition banlist isn't working
The banlist is per-thread. Make sure you've saved it for the current thread. Check the Context Dashboard to verify it's active.

### How do I use voice input?
Your browser must support the Web Speech API (Chrome and Edge have the best support). Click the 🎤 microphone button to start dictating. Click again to stop.

---

## Profile

### How do I see my profile?
Click the mini-card that appears near the top of the chat sidebar, or look for the profile section in the overlay.

### How do I change my display name?
Open your profile Settings overlay and go to the Details section. Your display name, avatar URL, and other profile fields are editable there.

### I'm not earning XP / achievements aren't unlocking
XP and achievements are computed from your activity stats. Make sure you're actively chatting, completing prompts, and using tools. Some achievements require specific actions (like "Voice Actor" requires using voice input at least once). Check the Achievements section in your profile to see what's available and what the criteria are.

### How do I change my accent color?
Open the Details section in your profile. The accent color picker shows all 24 available colors.

### How do I unlock theme color pickers?
The Secondary background picker unlocks at 15% achievement completion. The Primary background picker unlocks at 25%. Keep earning achievements to unlock them.

---

## Sharing

### How do I share my profile?
Click the **Share** button on your hero card. Your profile link is copied to the clipboard instantly. Paste it wherever you want.

### What information is in the shared link?
Only public display fields: your display name, earned title, level, archetype, accent color, and pinned badges. No personal details, no bio, no avatar image, no raw stats.

### Someone shared a link with me but it doesn't work
The link must point to a Perchance fork that has this mod installed. The link format is `https://perchance.org/<fork-name>?h=pf3:...`. If the fork doesn't have the mod, the `?h=` parameter is ignored and you'll just see the regular chat.

---

## Data & Privacy

### Where is my data stored?
All data is stored locally in your browser using localStorage (settings, profile, counters) and IndexedDB (memories, characters via upstream Perchance). Nothing is sent to any server.

### How do I back up my data?
Open your profile Settings → Backup section. Click Export to download a JSON file with all your profile data, settings, achievements, and counters. To restore, use Import in the same section.

### How do I reset everything?
Clear your browser's localStorage and IndexedDB for the Perchance domain. This removes all fork data. Your upstream Perchance data (characters, threads) is stored separately in IndexedDB and may also be cleared.

---

## Development

### How do I build from source?
```bash
git clone https://github.com/therealwestninja/Perchance-redesign-project.git
cd Perchance-redesign-project
npm install
npm test          # 940 tests
npm run build     # outputs build/perchance_2.txt
```

### How does the build system work?
The bundler (`build/build.mjs`) reads `src/manifest.json`, strips `import`/`export` statements from each module, and concatenates them into a single IIFE (Immediately Invoked Function Expression) wrapped in a `<script>` tag. This is appended to the upstream `perchance_2.txt`. All modules share a flat scope inside the IIFE.

### How do I add a new module?
1. Create your `.js` file in the appropriate `src/` subdirectory
2. Add it to `src/manifest.json` (order matters — dependencies must come first)
3. If it has an `initXxx()` function, call it from `src/profile/index.js`
4. Run `npm run build` to verify it bundles correctly

### Can I contribute?
Yes. The repository is public under the MIT license. Fork it, make your changes, and submit a pull request.
