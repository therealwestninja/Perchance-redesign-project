# Build Output

This directory holds both the **build script** and the **assembled Perchance generator files** it produces.

## Running the build

From the project root:

```bash
npm run build
```

This reads:

- `vendor/perchance-ai-character-chat/perchance_1.txt` — top DSL
- `vendor/perchance-ai-character-chat/perchance_2.txt` — HTML panel
- `src/manifest.json` — ordered list of project modules to bundle
- `src/**/*.js` — the actual project source

…and writes:

- `build/perchance_1.txt` — top DSL (currently vendored verbatim)
- `build/perchance_2.txt` — HTML panel + appended project bundle

No external dependencies. Node 20+ stdlib only. Total build time: milliseconds.

## Check mode

```bash
npm run build:check
```

Exits non-zero if the build would change any output file. Use this in CI or pre-commit hooks to enforce that committed build output matches source.

## Releasing to Perchance

1. `npm run build`
2. Verify the outputs look sane (`git diff build/`)
3. Open your Perchance generator's editor
4. Copy `build/perchance_1.txt` → paste into the top zone
5. Copy `build/perchance_2.txt` → paste into the HTML panel
6. Save. Smoke-test with a throwaway character.

## Commit policy

**Build output is committed.** The files in this directory are generated, but they're also the release artifact — having them in git history lets you see exactly what shipped to Perchance on any given date, and lets anyone clone the repo and deploy without running the build themselves.

If you want to regenerate from source: `npm run build` overwrites these files in place.

## Do not edit `perchance_1.txt` or `perchance_2.txt` by hand

They'll be overwritten on the next build. Edit source in [`../src/`](../src/) or the vendored baseline in [`../vendor/`](../vendor/) instead.
