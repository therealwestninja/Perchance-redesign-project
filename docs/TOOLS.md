# Chat Tools Reference

All tools are accessed via the **⚙ Tools** button near the chat input. They're organized into six categories.

---

## AI Tools

### AI Writer ✍
A combined tool with four modes, accessed via a dropdown menu.

**Impersonate** — The AI writes your next message in your character's established voice. The generated text is placed in your input field for review before sending.

**Narrate** 🎬 — Generates a third-person scene narration describing the current atmosphere, body language, and environment. Inserted as a system message in the chat.

**Enhance** ✨ — Rewrites whatever you've typed in the input field with more vivid detail and stronger word choice. Type your draft first, then click Enhance.

**Recap** 📜 — Generates a "Previously on..." narrative summary of the conversation so far. Useful for catching up on long threads.

### Auto-Summary
Runs automatically. As conversations grow longer, older messages are compressed into a summary paragraph that's injected into the AI's context window. This helps the AI maintain coherence across long threads without losing early context.

### Image Generation 🖼
Generates AI images inline in the chat using Perchance's text-to-image plugin.

### Reasoning Toggle 🧠
Shows or hides the AI's chain-of-thought reasoning in responses. Toggle between showing the full reasoning or just the final output.

---

## Context Tools

### Context Editor 📝
A tabbed modal combining four context management tools.

**Glossary tab** 📖 — Add keyword-definition pairs, one per line in `keyword = definition` format. When a keyword appears in conversation, its definition is automatically injected into the AI's context. Supports aliases (`dragon, wyrm = a fire-breathing reptile`) and recursive scanning (2 levels deep — glossary entries can reference other glossary entries).

**Banlist tab** 🚫 — Add words or phrases the AI should avoid, one per line. These are injected as "never use these words" instructions. Also auto-detects repeated phrases in the AI's recent output.

**Reminder tab** 📌 — A persistent instruction injected before every AI reply. Use it to reinforce character behavior, set response length, or maintain a specific tone. Per-thread — each conversation can have its own reminder.

**Persona tab** 👤 — Define your character's name and description. This information is sent with every message so the AI knows who it's talking to.

### Context Dashboard 📊
A live readout showing what's currently being injected into the AI's context: glossary entries, summary, document, anti-repetition rules, persona, reminder, and generation settings. Shows active/inactive status for each source.

### Auto-Lorebook 🔮
One-click AI generation of glossary entries. Analyzes your conversation and automatically creates keyword-definition pairs for characters, locations, and concepts that have appeared.

---

## World Tools

### Dice Roller 🎲
Type `/roll XdY+Z` in the chat input to roll dice. Supports standard TTRPG notation: `/roll 2d6+3`, `/roll 1d20`, `/roll 4d6`. Results appear as system messages.

### Document Analysis 📎
Upload a text file and its contents become part of the AI's context. Ask questions about the document, have the AI summarize it, or use it as reference material for your roleplay.

### Prompt Presets 📋
Save and load prompt templates. Useful for frequently-used starting scenarios or system instructions.

---

## Chat Tools

### Chat Export ⬇
Download the current conversation as a text or JSON file.

### Thread Archive 📥
Archive threads to declutter your sidebar without deleting them. Archived threads can be restored at any time.

### Bookmarks 🔖
Star important messages. Bookmarked messages get a gold accent border and can be quickly scrolled to.

### Chat Search
Search through message history in the current thread.

### Conversation Branching ◀1/3▶
When you regenerate an AI response, all alternatives are kept. Navigate between them with arrow buttons. Each branch preserves its full conversation history.

### Bulk Thread Operations ☐
Multi-select threads for batch archive, delete, or export operations.

### Stop Generating ⬛
Interrupt AI generation mid-stream. The partial response is kept.

### Message Controls
Hover over any message to see action buttons: copy, edit, delete, regenerate.

### Timestamps
Shows the time (HH:MM) on each message.

---

## Character Tools

### Character Browser 👥
A searchable grid view of all your characters. Filter by name to find characters quickly across large collections.

### Character Cards 🃏
Import and export characters in SillyTavern-compatible JSON format. Useful for sharing characters between platforms or backing up individual characters.

---

## View Tools

### Theme Toggle ☀🌙
Switch between dark and light mode.

### Custom Backgrounds 🏞
Set a background image for your chat. Per-thread — each conversation can have its own background.

### Font Settings Aa
Change the font family and size for the chat interface.

### Fullscreen ⛶
Toggle distraction-free fullscreen mode.

### Generation Settings ⚙
Override the AI's temperature (creativity) and max tokens (response length) per session.

### Token Display
Shows a live token count in the chat header so you can see how much context is being used.

### Code Highlighting
Syntax highlighting for code blocks in AI responses.

### Keyboard Shortcuts ⌨
Configurable keyboard shortcuts for common actions.

### Voice I/O 🎤🔊
Speech-to-text input (dictate messages) and text-to-speech output (hear AI responses read aloud).
