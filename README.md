# Perchance Redesign Project

A fork of [Perchance's AI Character Chat](https://perchance.org/ai-character-chat) with a profile system, achievements, and narrative-focused gamification — built to enrich the chat experience, not to engineer engagement.

> **Status:** Early development. Scaffold only, no features shipped yet.

---

## Goals

- A personal-use fork that adds features the upstream is unlikely to ship
- A **profile card** users can view and screenshot — stats, levels, achievements, visible craft
- **Narrative-focused gamification** — rewards for storytelling work (words written, arcs completed, worlds built), never for time spent or sessions opened
- A lightweight **local community layer** via shareable profile cards, with zero backend
- Stay **upstream-compatible** with the official `ai-character-chat` so bug fixes and improvements can be pulled in over time

## Non-Goals

The following are explicit design boundaries, not "maybe laters":

- **No premium currency**, no time-gated content, no ad-driven retention mechanics
- **No engagement-optimization** metrics. Stats measure user work, not user attendance
- **No behavioral conditioning patterns** — variable-ratio reward loops, streak guilt, loss aversion, or similar dark patterns are not in scope
- **No webcam, microphone, or biometric tracking** of any kind
- **No external network calls** beyond what upstream Perchance already makes. All profile/stats data is local
- **No telemetry** — the project ships no analytics, crash reporting, or usage tracking

## Architecture

This is a fork of the Perchance generator itself (top DSL + HTML panel), not a userscript.

- **`vendor/`** — Untouched upstream source, serves as the diff baseline for future upstream pulls
- **`src/`** — Project source, organized as composable modules that get assembled by the build
- **`build/`** — Generated files ready to paste into Perchance's editor for release
- **`docs/`** — Architecture notes, design-truth mockups, development guides

All state lives in the browser's IndexedDB (`chatbot-ui-v1`, same as upstream) and `localStorage`. Nothing leaves the browser.

See [`docs/architecture.md`](docs/architecture.md) for the full map.

## Development

Local-first. Develop in this repo, test in Perchance only at release time.

```bash
git clone https://github.com/therealwestninja/Perchance-redesign-project
cd Perchance-redesign-project
# build tooling lands in a later commit
```

## Credits

See [`CREDITS.md`](CREDITS.md) for attribution to upstream Perchance and the tools whose ideas inspired this project.

## License

MIT — see [`LICENSE`](LICENSE).
