# Design Truth

These files are **reference mockups**, not source code. They represent the intended visual and interaction design of features at specific points in the project.

When implementing a feature, the corresponding mockup here is the target. When the implementation diverges from the mockup, either:

- the implementation catches up to the mockup (bug fix), or
- the mockup is updated to reflect a deliberate design change (design iteration).

Mockups are versioned — `profile-card-v1.html`, `profile-card-v2.html`, etc. — not overwritten. Keeping old versions around lets us see the design's evolution and reason about why decisions changed.

## Current Mockups

### `profile-card-v1.html`

Profile card — above-the-fold hero (avatar, name, level, badges, featured achievement) and scrollable detail (fraction-style stats grid, star ratings, recent unlocks, footer).

Uses Google Fonts via CDN for display purposes only. **The real implementation must use a system-font stack** (no external calls per project principles — see [`../architecture.md`](../architecture.md)).

Open in a browser to view. Data is fake; layout is the point.

## Open Design Questions

These are unresolved at the time of this commit and should be answered before implementing:

1. **Profile button location** — top toolbar, hamburger menu, or floating FAB?
2. **Star ratings in v0.1** — include with computed signals, or defer to v0.2?
3. **PNG export scope** — hero-only, full card, or offer both as separate buttons?
