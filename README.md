# Perchance Redesign Project

A fork of [Perchance's AI Character Chat](https://perchance.org/ai-character-chat)
that adds a personal profile system — mini-card in the sidebar, full-screen
profile page, stats derived from your chat history, achievements, and
gamification that rewards writing work rather than time spent.

Built for personal use, shared in case anyone else finds it useful.

## What's shipped

- **Sidebar mini-card** — always-visible identity strip with avatar,
  display name, level, and XP bar. Clicks through to the full page.
- **Full-screen profile page** — shareable splash (avatar, name, title,
  XP, pinned badges), About bio, Details form (display name, username,
  title, avatar upload, age range, 2D gender picker, free-text),
  Chronicle stat grid, and Achievements grid.
- **Per-section collapse + blur toggles**, persisted to localStorage —
  Details is blurred by default for screenshot safety.
- **Live auto-refresh** — avatar and title changes reflect instantly
  in the splash and mini-card, no reload needed.
- **Achievements** — 15 starter achievements across five rarity tiers,
  computed live from your chat stats. Zero persistent unlock table,
  so nothing can drift out of sync with your data.

## Design principles

These are non-negotiable:

- **No premium currency**, no time-gated content, no ad-driven retention.
- **No engagement-optimization metrics.** Stats measure your work, not your attendance.
- **No behavioral conditioning patterns** — variable-ratio rewards, streak
  guilt, loss aversion, artificial scarcity, and similar dark patterns
  are explicitly excluded.
- **No webcam, microphone, or biometric tracking** of any kind.
- **No external network calls** beyond what upstream Perchance already
  makes. All profile data stays in your browser.
- **No telemetry.** The project ships no analytics, crash reporting, or
  usage tracking.

## Architecture

This is a fork of the Perchance generator itself (top DSL + HTML panel),
not a userscript. Our code is appended to the bundled upstream and runs
in the same sandbox.

- `vendor/` — Untouched upstream source. Diff baseline for future pulls.
- `src/` — Our ES modules, assembled by the build into a single IIFE.
- `build/` — `perchance_1.txt` + `perchance_2.txt` ready to paste into
  the Perchance editor.
- `test/` — `node:test` specs that run the source modules directly.
- `docs/` — Architecture notes and design references.
- `.github/workflows/` — CI: tests + build check on every push/PR.

All state lives in the browser's IndexedDB (shared with upstream) and
`localStorage` (namespaced `pf:*`).

See [`docs/architecture.md`](docs/architecture.md) for the full map,
including the script-tag timing trap and other lessons learned.

## Development

No `npm install` required — build tooling uses Node stdlib only.
You do need Node 20+ for `node:test`.

```bash
git clone https://github.com/therealwestninja/Perchance-redesign-project
cd Perchance-redesign-project
npm test              # run test suite (86+ tests)
npm run build         # build build/perchance_*.txt
npm run build:check   # verify build is up-to-date (used in CI)
```

To release: copy `build/perchance_1.txt` into the Perchance editor's top
zone, `build/perchance_2.txt` into the HTML panel, save, test, publish.

## Credits

See [`CREDITS.md`](CREDITS.md) for attribution to upstream Perchance and
the tools whose patterns inspired this project.

## License

MIT — see [`LICENSE`](LICENSE).
