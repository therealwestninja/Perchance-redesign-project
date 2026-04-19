// render/styles.js
//
// All CSS for the project as a single template string. Injected as a
// <style> block on mount. Class names are prefixed with `pf-` (perchance-fork)
// to avoid collisions with upstream.
//
// Color / radius / border values use upstream's CSS variables
// (var(--box-color), var(--border-color), etc.) so the mini-card adapts
// automatically to whatever theme the user has configured in Perchance.

export const CSS = `
/* ============================================================
   Perchance Redesign Project — mini-card + (future) modal styles
   ============================================================ */

/*
 * Palette tokens. Global :root scope so every component — mini-card
 * (outside overlay), splash, toasts, overlay content — resolves the
 * same values. A theme overhaul only needs to touch this block.
 *
 * The *-rgb variants expose R, G, B as comma-separated numbers
 * so rgba() can consume them: rgba(var(--pf-palette-amber-rgb), 0.5).
 * Pair the *-rgb tokens with the hex tokens to support both usage
 * patterns.
 *
 * Do NOT introduce new raw hex/rgba values elsewhere in this
 * stylesheet. Add them here first, then reference the var from
 * the rule site.
 */
:root {
  --pf-palette-amber:       #d8b36a;
  --pf-palette-amber-rgb:   216, 179, 106;
  --pf-palette-amber-deep:  #b9894a;   /* gradient partner for amber */

  --pf-palette-blue:        #4a90e2;
  --pf-palette-red:         #d87a7a;
  --pf-palette-red-rgb:     216, 122, 122;
  --pf-palette-green:       #6ab87c;

  --pf-bg-dark:             #1e1e1e;

  /* Commonly-used neutral overlays */
  --pf-overlay-dark-18:     rgba(0, 0, 0, 0.18);
  --pf-overlay-dark-25:     rgba(0, 0, 0, 0.25);
}

.pf-mini-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 0.5rem;
  background:
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.2);
  border-radius: 10px;
  color: #e8dcc4;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  font-family: inherit;
  box-shadow: 0 4px 12px -4px rgba(0,0,0,0.5);
}
.pf-mini-card:hover {
  border-color: rgba(212,168,85,0.4);
  background: linear-gradient(180deg, #1a2028 0%, #10151c 100%);
}
.pf-mini-card:active {
  transform: translateY(1px);
}
.pf-mini-card:focus-visible {
  outline: 2px solid var(--pf-accent, #d4a855);
  outline-offset: 1px;
}

.pf-memory-button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 0.5rem;
  background: linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 10px;
  color: #e8dcc4;
  cursor: pointer;
  user-select: none;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  box-shadow: 0 2px 8px -2px rgba(0,0,0,0.4);
}
.pf-memory-button:hover {
  border-color: rgba(212,168,85,0.35);
}
.pf-memory-button:active {
  transform: translateY(1px);
}
.pf-memory-button:focus-visible {
  outline: 2px solid var(--pf-accent, #d4a855);
  outline-offset: 1px;
}
.pf-memory-button-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.pf-memory-button-label {
  flex: 1;
  font-weight: 500;
}

.pf-mini-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #2d3a4d 0%, #0e1420 85%);
  border: 2px solid var(--pf-theme-primary, #0d1117);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 18px;
  line-height: 1;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  position: relative;
}
/* Small ornate ring on mini avatar */
.pf-mini-avatar::before {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: conic-gradient(from 140deg,
    var(--pf-accent, #d4a855) 0deg,
    #e8c97a 90deg,
    var(--pf-accent, #d4a855) 180deg,
    #8a6a2c 260deg,
    var(--pf-accent, #d4a855) 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  z-index: -1;
}
.pf-mini-avatar-text {
  color: var(--pf-accent-hi, #e8c97a);
  text-shadow: 0 1px 4px rgba(212,168,85,0.3);
  font-family: Georgia, 'Times New Roman', serif;
}

.pf-mini-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pf-mini-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.pf-mini-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  font-family: Georgia, 'Times New Roman', serif;
  color: #e8dcc4;
}

.pf-mini-level {
  flex-shrink: 0;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.pf-mini-meta {
  font-size: 10px;
  color: #8b95a3;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.pf-mini-bar {
  height: 3px;
  background: rgba(212,168,85,0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.pf-mini-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pf-accent, #d4a855) 0%, #e8c97a 100%);
  box-shadow: 0 0 4px rgba(212,168,85,0.4);
  border-radius: 2px;
  transition: width 0.35s ease;
}

.pf-mini-chevron {
  flex-shrink: 0;
  opacity: 0.35;
  font-size: 12px;
  margin-left: 2px;
  transition: opacity 0.15s, transform 0.15s;
}
.pf-mini-card:hover .pf-mini-chevron {
  opacity: 0.75;
  transform: translateX(1px);
}

/* ============================================================
   Mini-card pending indicator — the "friendly wave"
   - Gentle breathing glow while there's anything unseen
   - Small gold dot in the avatar corner as a permanent marker
     (survives prefers-reduced-motion, colorblind-friendly)
   - Cleared when the full profile is opened (mark-seen)
   ============================================================ */

@keyframes pf-mini-pending-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0); }
  50%      { box-shadow: 0 0 10px 1px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.28); }
}

@keyframes pf-mini-pending-dot-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.95; }
  50%      { transform: scale(1.18); opacity: 0.70; }
}

/* "Friendly neighbor waving you over" pulse — fires when pendingCount
   just increased (a newly-unlocked achievement, completed event, or
   fresh prompt week landed). Wider reach + stronger peak than the
   ambient pending pulse, but FINITE: three iterations (~9.9s) then
   settle to the ambient pulse. Animation uses both transform AND the
   wider shadow so it reads even in a reduced-color-contrast theme. */
@keyframes pf-mini-pending-fresh-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 18px 4px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.48);
    transform: scale(1.015);
  }
}

.pf-mini-card-pending {
  animation: pf-mini-pending-pulse 3.5s ease-in-out infinite;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.35);
}
.pf-mini-card-pending:hover {
  /* On hover, settle the glow — we've got their attention, stop waving */
  animation: none;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-mini-card-fresh {
  /* Stack the fresh pulse ON TOP of the ambient pending pulse by using
     a composite animation list. Both animations target box-shadow +
     transform — browsers interpolate the stronger one's contribution
     first, then fall back to the ambient after the fresh iterations
     exhaust. Three iterations × 3.3s = 9.9s attention-grab, then the
     JS-side timer strips this class and we're back to ambient pulse. */
  animation:
    pf-mini-pending-fresh-pulse 3.3s ease-in-out 3,
    pf-mini-pending-pulse       3.5s ease-in-out infinite;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-mini-card-fresh:hover {
  /* Same "got your attention, stop waving" behavior as the ambient
     pending pulse — kill the animation when the user's clearly engaged. */
  animation: none;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.65);
}

.pf-mini-avatar-has-dot {
  position: relative;
}
.pf-mini-avatar-has-dot::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--pf-accent, var(--pf-palette-amber));
  border: 2px solid var(--box-color, var(--background));
  box-shadow: 0 0 4px 1px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.5);
  animation: pf-mini-pending-dot-pulse 2.2s ease-in-out infinite;
  pointer-events: none;
}

/* Respect users who've asked for reduced motion — kill the animations
   but keep the dot + border so the state is still conveyed visually. */
@media (prefers-reduced-motion: reduce) {
  .pf-mini-card-pending          { animation: none; }
  .pf-mini-card-fresh            { animation: none; }
  .pf-mini-avatar-has-dot::after { animation: none; }
}

/* ============================================================
   Full-screen profile overlay
   ============================================================ */

.pf-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(5, 8, 12, 0.85);
  background-image: radial-gradient(ellipse at top, rgba(26,20,16,0.5) 0%, transparent 55%);
  color: #e8dcc4;
  -webkit-backdrop-filter: blur(4px);
          backdrop-filter: blur(4px);
}
.pf-overlay[hidden] { display: none; }

.pf-overlay-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 16px 80px;
}

.pf-overlay-content {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-family: inherit;
}

.pf-overlay-close {
  position: fixed;
  top: 12px;
  right: max(12px, calc(50% - 400px - 44px));
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(212,168,85,0.2);
  background: linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  color: #e8dcc4;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}
.pf-overlay-close:hover { background: var(--box-color-hover, var(--box-color)); }
.pf-overlay-close:focus-visible {
  outline: 2px solid var(--link-color, var(--pf-palette-blue));
  outline-offset: 2px;
}

/* ============================================================
   Splash — the above-the-fold breadwinner
   ============================================================ */

.pf-splash {
  position: relative;
  background:
    linear-gradient(180deg, rgba(232,220,196,0.02) 0%, transparent 20%),
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.25);
  border-radius: 14px;
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  box-shadow:
    0 24px 50px -20px rgba(0,0,0,0.8),
    0 0 0 1px rgba(232,220,196,0.03) inset,
    0 1px 0 rgba(232,220,196,0.05) inset;
}
/* subtle radial glow at top */
.pf-splash::after {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0; height: 120px;
  background: radial-gradient(ellipse at 50% 0%, rgba(212,168,85,0.10) 0%, transparent 60%);
  pointer-events: none;
}

.pf-splash-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

/* Avatar with ornate conic-gradient ring (from design-truth) */
.pf-splash-avatar {
  flex-shrink: 0;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #2d3a4d 0%, #0e1420 85%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  position: relative;
  z-index: 1;
  border: 2px solid var(--pf-theme-primary, #0d1117);
  box-shadow: 0 0 0 3px transparent;
}
/* Ornate ring — conic gradient around the avatar */
.pf-splash-avatar::before {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  background: conic-gradient(from 140deg,
    var(--pf-accent, #d4a855) 0deg,
    var(--pf-accent-hi, #e8c97a) 90deg,
    var(--pf-accent, #d4a855) 180deg,
    #8a6a2c 260deg,
    var(--pf-accent, #d4a855) 360deg);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
  z-index: -1;
}
.pf-splash-avatar-text {
  font-size: 38px;
  font-weight: 600;
  line-height: 1;
  color: var(--pf-accent-hi, #e8c97a);
  text-shadow: 0 2px 8px rgba(212,168,85,0.4);
  font-family: Georgia, 'Times New Roman', serif;
}

.pf-splash-ident {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}
.pf-splash-name {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.1;
  margin: 0 0 4px;
  color: #e8dcc4;
  letter-spacing: 0.02em;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-splash-title {
  font-style: italic;
  font-size: 15px;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
}

.pf-splash-archetype {
  margin-top: 6px;
  min-height: 0;
}
.pf-splash-archetype-tag {
  display: inline-block;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 3px;
  background: transparent;
  color: var(--pf-accent, #d4a855);
  border: 1px solid rgba(212,168,85,0.35);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

.pf-splash-levelrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.pf-splash-level {
  flex-shrink: 0;
  padding: 4px 10px;
  background: linear-gradient(180deg, #2a1f0e 0%, #1a1508 100%);
  border: 1px solid rgba(212,168,85,0.55);
  border-radius: 999px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pf-accent-hi, #e8c97a);
}
.pf-splash-level-word { opacity: 0.7; }
.pf-splash-level strong { color: #e8dcc4; font-weight: 500; }

.pf-splash-xpbar {
  flex: 1;
  height: 6px;
  background: rgba(212,168,85,0.1);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(212,168,85,0.15);
}
.pf-splash-xpbar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pf-accent, #d4a855) 0%, var(--pf-accent-hi, #e8c97a) 100%);
  box-shadow: 0 0 8px rgba(212,168,85,0.5);
  transition: width 0.4s ease;
}
.pf-splash-xp-label {
  flex-shrink: 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  color: #8b95a3;
  letter-spacing: 0.02em;
}

/* Hexagonal badge shapes (from design-truth mockup) */
.pf-splash-badges {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  position: relative;
  z-index: 1;
}
.pf-splash-badge {
  flex: 0 0 auto;
  width: 38px;
  height: 42px;
  background: linear-gradient(180deg, #2a1f0e 0%, #0f0a04 100%);
  border: 1px solid rgba(212,168,85,0.55);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--pf-accent-hi, #e8c97a);
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  transition: transform 0.2s;
}
.pf-splash-badge:hover { transform: translateY(-2px); }
.pf-splash-badge-locked {
  opacity: 0.25;
  color: #8b95a3;
  background: transparent;
  border-color: rgba(139,149,163,0.3);
}

/* Share button — top-right corner */
.pf-splash-share {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(212,168,85,0.25);
  color: #e8dcc4;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.15s, border-color 0.15s, transform 0.15s;
  z-index: 2;
}
.pf-splash-share:hover {
  opacity: 1;
  border-color: rgba(212,168,85,0.55);
  transform: scale(1.05);
}
.pf-splash-share:focus-visible {
  outline: 2px solid rgba(212,168,85,0.55);
  outline-offset: 1px;
  opacity: 1;
}
.pf-splash-card-btn {
  right: auto;
  left: auto;
  transform: translateX(0);
  position: absolute;
  top: 10px;
  right: 50px;
  font-size: 16px;
}
.pf-splash-card-btn:hover {
  transform: scale(1.05);
}

/* ============================================================
   Overlay focus mode — "view for screenshot"
   - Hides everything except the splash
   - Centers splash vertically + horizontally
   - Clean backdrop so the screenshot has no chrome
   ============================================================ */
.pf-overlay-focus-hint {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--text-color);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s ease;
  z-index: 10002;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.pf-overlay-focused .pf-overlay-focus-hint {
  opacity: 0.7;
}
.pf-overlay-focused .pf-overlay-focus-hint-fading {
  opacity: 0;
}

.pf-overlay-focused {
  background: rgba(0, 0, 0, 0.92);
}

/* Hide everything in the content column except the splash and the
   focus-extras (the radar card) when focused */
.pf-overlay-focused .pf-overlay-content > :not(.pf-splash):not(.pf-focus-extras) {
  display: none;
}

/* Center vertically in the viewport when focused; stack splash and
   extras with breathing room between */
.pf-overlay-focused .pf-overlay-scroll {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;            /* fall back to scroll on short viewports */
  padding: 40px 16px;
}
.pf-overlay-focused .pf-overlay-content {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Splash and focus-extras both get the "card" treatment in focus mode —
   soft shadow ring, a little extra padding, so they read as a unified
   two-card share artifact in a screenshot. */
.pf-overlay-focused .pf-splash,
.pf-overlay-focused .pf-focus-extras {
  box-shadow:
    0 0 0 1px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.15),
    0 20px 60px -10px rgba(0, 0, 0, 0.65),
    0 4px 20px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.08);
}
.pf-overlay-focused .pf-splash {
  padding: 36px 32px 28px;
}

/* Focus extras — hidden by default, card-styled in focus mode */
.pf-focus-extras {
  display: none;
}
.pf-overlay-focused .pf-focus-extras {
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--box-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 18px 20px 16px;
}
/* The radar inside focus-extras: slightly smaller than the in-profile
   version so the two cards share the same width comfortably */
.pf-overlay-focused .pf-focus-extras .pf-radar-svg {
  max-width: 380px;
}

/* Corner stat chips for the share card (Focus mode only).
   Two rows, one above radar and one below. justify-content space-between
   anchors the chips to left/right corners visually. */
.pf-share-chips-row {
  display: none; /* hidden in normal profile; only shown in focus mode */
}
.pf-overlay-focused .pf-share-chips-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.pf-share-chip {
  flex: 0 1 auto;
  min-width: 0;
  padding: 8px 14px 9px;
  border-radius: var(--border-radius);
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border-color);
}
.pf-share-chip-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 2px;
}
.pf-share-chip-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pf-share-chip-icon {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
}
.pf-share-chip-value-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Tier-colored icons for the rarest-unlock chip */
.pf-share-chip-icon-common    { color: #9aa0a6; }
.pf-share-chip-icon-uncommon  { color: #6aa66a; }
.pf-share-chip-icon-rare      { color: #6aa0d8; }
.pf-share-chip-icon-epic      { color: #b67ad8; }
.pf-share-chip-icon-legendary { color: var(--pf-palette-amber); }

/* Activity sparkline — last 12 weeks of completions, Focus mode only */
.pf-sparkline {
  display: none; /* hidden in normal profile; only shown in focus mode */
  width: 100%;
  padding: 4px 0 0;
}
.pf-overlay-focused .pf-sparkline {
  display: block;
}
.pf-sparkline-svg {
  width: 100%;
  height: auto;
  display: block;
}
.pf-sparkline-track {
  fill: rgba(255, 255, 255, 0.04);
}
.pf-sparkline-bar {
  fill: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-sparkline-bar-current {
  fill: var(--pf-accent, var(--pf-palette-amber));
}
.pf-sparkline-label {
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  fill: var(--text-color);
  opacity: 0.55;
}
.pf-sparkline-label-right {
  fill: var(--pf-accent, var(--pf-palette-amber));
  opacity: 1;
}

/* Hide the close × and the share button in focus mode — keep it clean
   for the screenshot. Exit is via tap or Esc, hinted at bottom. */
.pf-overlay-focused .pf-overlay-close,
.pf-overlay-focused .pf-splash-share {
  display: none;
}

/* ============================================================
   Section — collapsible + blurrable wrapper used below the fold
   ============================================================ */

.pf-section {
  background:
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 10px;
  padding: 20px 22px;
  box-shadow: 0 4px 12px -4px rgba(0,0,0,0.4);
}

.pf-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(212,168,85,0.1);
  padding-bottom: 10px;
}
.pf-section-title {
  flex: 1;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
}

.pf-section-ctrls {
  display: flex;
  gap: 4px;
}
.pf-section-ctrl {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid rgba(212,168,85,0.2);
  border-radius: 6px;
  color: #e8dcc4;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  font-family: inherit;
}
.pf-section-ctrl:hover { opacity: 1; background: rgba(212,168,85,0.08); }
.pf-section-ctrl:focus-visible {
  outline: 2px solid var(--pf-accent, #d4a855);
  outline-offset: 1px;
}
.pf-section-eye[aria-pressed="true"] {
  opacity: 1;
  background: rgba(212,168,85,0.12);
  border-color: rgba(212,168,85,0.45);
}

.pf-section-body-wrap {
  position: relative;
}
.pf-section-body {
  transition: filter 0.2s, opacity 0.2s;
}
.pf-section-cover {
  display: none;
  position: absolute;
  inset: 0;
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px dashed var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
}
.pf-section-cover:focus-visible {
  outline: 2px solid var(--link-color, var(--pf-palette-blue));
}

.pf-section-blurred .pf-section-body {
  filter: blur(8px);
  pointer-events: none;
  user-select: none;
}
.pf-section-blurred .pf-section-cover {
  display: flex;
}

.pf-section-collapsed .pf-section-body-wrap {
  display: none;
}
.pf-section-collapsed { padding-bottom: 10px; }

/* ============================================================
   About section
   ============================================================ */
.pf-about { display: flex; flex-direction: column; gap: 6px; }
.pf-about-textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px 12px;
  background: var(--textarea-bg, var(--background));
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}
.pf-about-textarea:focus {
  outline: none;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-about-counter {
  align-self: flex-end;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  opacity: 0.5;
}

/* ============================================================
   Details form
   ============================================================ */
.pf-details { display: flex; flex-direction: column; gap: 14px; }

.pf-field-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 12px;
  align-items: start;
}
@media (max-width: 480px) {
  .pf-field-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
.pf-field-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8b95a3;
  padding-top: 10px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-field-input {
  width: 100%;
  padding: 8px 10px;
  background: rgba(232,220,196,0.03);
  color: #e8dcc4;
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
}
.pf-field-input:focus {
  outline: none;
  border-color: rgba(212,168,85,0.55);
  background: rgba(232,220,196,0.05);
}
.pf-field-stack { display: flex; flex-direction: column; gap: 10px; }

.pf-details-note {
  margin: 4px 0 0;
  font-size: 11px;
  opacity: 0.55;
  font-style: italic;
}

/* ============================================================
   Avatar upload control
   ============================================================ */
.pf-avatar-control {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 10px 14px;
  align-items: center;
}
.pf-avatar-preview {
  grid-column: 1;
  grid-row: 1 / 3;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--button-bg);
  border: 2px solid var(--pf-accent, var(--pf-palette-amber));
  box-shadow: 0 0 0 1px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.pf-avatar-preview-text {
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
  color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-avatar-buttons {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.pf-avatar-btn {
  padding: 6px 12px;
  background: var(--button-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, opacity 0.15s;
}
.pf-avatar-btn:hover {
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-avatar-btn:focus-visible {
  outline: 2px solid rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
  outline-offset: 1px;
}
.pf-avatar-btn-secondary {
  opacity: 0.75;
}
.pf-avatar-btn-disabled,
.pf-avatar-btn[disabled] {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}
.pf-avatar-status {
  grid-column: 2;
  grid-row: 2;
  font-size: 11px;
  min-height: 14px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
  opacity: 0.7;
}
.pf-avatar-status-error {
  color: #d8796a;
  opacity: 1;
}
.pf-avatar-status-info {
  color: var(--pf-accent, var(--pf-palette-amber));
  opacity: 1;
}

/* ============================================================
   Gender square — 2D picker
   ============================================================ */

.pf-gs {
  display: flex;
  justify-content: flex-start;
}
.pf-gs-labels {
  position: relative;
  width: 220px;
  max-width: 100%;
  aspect-ratio: 1;
  padding: 22px 0; /* room for labels above/below */
}
.pf-gs-field {
  position: relative;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(180deg, rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.06) 0%, rgba(0, 0, 0, 0.1) 100%),
    var(--textarea-bg, var(--background));
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: crosshair;
  touch-action: none;
  /* subtle crosshair grid */
  background-image:
    linear-gradient(var(--border-color), var(--border-color)),
    linear-gradient(var(--border-color), var(--border-color));
  background-size: 1px 100%, 100% 1px;
  background-position: 50% 0, 0 50%;
  background-repeat: no-repeat;
}
.pf-gs-field:focus {
  outline: 2px solid rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
  outline-offset: 2px;
}

.pf-gs-dot {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--pf-accent, var(--pf-palette-amber));
  border: 2px solid var(--box-color);
  box-shadow: 0 0 0 1px rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
  transition: transform 0.05s;
}

.pf-gs-label {
  position: absolute;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.65;
  white-space: nowrap;
}
.pf-gs-label-tl { top: 4px;    left: 0;     }
.pf-gs-label-tr { top: 4px;    right: 0;    }
.pf-gs-label-bl { bottom: 4px; left: 0;     }
.pf-gs-label-br { bottom: 4px; right: 0;    }

/* ============================================================
   Prompts section — this week's writing ideas
   ============================================================ */
.pf-prompts { display: flex; flex-direction: column; gap: 14px; }

/* Header row: intro text on the left, cadence toggle on the right */
.pf-prompts-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

/* Cadence toggle — segmented-control style pill */
.pf-cadence-toggle {
  display: inline-flex;
  flex-shrink: 0;
  background: var(--pf-overlay-dark-25);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 2px;
}
.pf-cadence-btn {
  padding: 4px 12px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: transparent;
  color: var(--text-color);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  opacity: 0.55;
  transition: background 0.15s, opacity 0.15s, color 0.15s;
}
.pf-cadence-btn:hover {
  opacity: 0.9;
}
.pf-cadence-btn-active {
  background: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.18);
  color: var(--pf-accent, var(--pf-palette-amber));
  opacity: 1;
}

/* Event groups (active holidays/observances) appear above regular prompts.
   Each event gets a subtle gold-tinted banner to distinguish it from the
   weekly rotation. */
.pf-event-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pf-event-group {
  background: linear-gradient(180deg, rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.07) 0%, rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.03) 100%);
  border: 1px solid rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.30);
  border-radius: var(--border-radius);
  padding: 12px 14px;
}
.pf-event-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}
.pf-event-icon {
  flex-shrink: 0;
  font-size: 24px;
  line-height: 1;
  margin-top: 1px;
}
.pf-event-titlebar {
  flex: 1;
  min-width: 0;
}
.pf-event-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pf-accent, var(--pf-palette-amber));
  margin-bottom: 2px;
}
.pf-event-tagline {
  font-size: 12px;
  font-style: italic;
  opacity: 0.75;
  line-height: 1.4;
}
.pf-event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pf-prompts-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color);
  opacity: 0.85;
}
.pf-prompts-intro-soft {
  display: inline;
  opacity: 0.55;
  font-size: 11px;
}

.pf-prompts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pf-prompt-item {
  background: rgba(127, 127, 127, 0.04);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  transition: background 0.15s, opacity 0.2s;
}
.pf-prompt-item:hover {
  background: rgba(185, 137, 74, 0.06);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.25);
}
.pf-prompt-item-done {
  opacity: 0.55;
}

.pf-prompt-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.pf-prompt-checkbox {
  flex-shrink: 0;
  margin-top: 2px;
  width: 16px;
  height: 16px;
  accent-color: var(--pf-accent, var(--pf-palette-amber));
  cursor: pointer;
}

.pf-prompt-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-color);
}
.pf-prompt-item-done .pf-prompt-text {
  text-decoration: line-through;
  text-decoration-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.5);
  text-decoration-thickness: 1px;
}

/* ============================================================
   Chronicle stat grid
   ============================================================ */
.pf-chron-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.pf-chron-card {
  padding: 10px 12px;
  background: rgba(127, 127, 127, 0.04);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pf-chron-label {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.65;
}
.pf-chron-value {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 18px;
  color: var(--text-color);
}
.pf-chron-num { font-weight: 600; }
.pf-chron-denom { opacity: 0.55; font-size: 14px; }
.pf-chron-value-maxed .pf-chron-denom { color: var(--pf-palette-amber); opacity: 1; }
.pf-chron-bar {
  height: 3px;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 2px;
  overflow: hidden;
}
.pf-chron-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--pf-palette-amber-deep) 0%, var(--pf-accent, var(--pf-palette-amber)) 100%);
  border-radius: 2px;
  transition: width 0.4s;
}

/* ============================================================
   Writing Style radar (SVG pentagon)
   ============================================================ */
.pf-radar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0 4px;
}
.pf-radar-svg {
  width: 100%;
  max-width: 460px;
  height: auto;
  overflow: visible; /* labels can reach outside the viewBox */
}

/* Concentric guide rings — subtle, so the data polygon reads cleanly */
.pf-radar-ring {
  stroke: var(--border-color);
  stroke-width: 1;
  fill: none;
  opacity: 0.4;
}
/* Axis lines from center outward */
.pf-radar-axis-line {
  stroke: var(--border-color);
  stroke-width: 1;
  opacity: 0.35;
}

/* The filled data polygon — warm gold, low alpha so grid shows through */
.pf-radar-value-fill {
  fill: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.22);
  stroke: var(--pf-accent, var(--pf-palette-amber));
  stroke-width: 1.5;
  stroke-linejoin: round;
}
/* Vertex dots where the user's values land */
.pf-radar-value-dot {
  fill: var(--pf-accent, var(--pf-palette-amber));
  stroke: var(--box-color);
  stroke-width: 1.5;
}

/* Axis labels */
.pf-radar-label {
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  fill: var(--text-color);
  opacity: 0.7;
}

/* Raw values readout below the chart */
.pf-radar-readout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 6px 14px;
  width: 100%;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
}
.pf-radar-readout-item {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
  border-bottom: 1px solid var(--border-color);
}
.pf-radar-readout-label {
  opacity: 0.55;
  letter-spacing: 0.05em;
}
.pf-radar-readout-value {
  color: var(--pf-accent, var(--pf-palette-amber));
  font-weight: 600;
}

/* ============================================================
   Prompt Archive — read-only view of past weeks
   ============================================================ */
.pf-archive {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pf-archive-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color);
  opacity: 0.9;
}
.pf-archive-intro-soft {
  opacity: 0.7;
}
.pf-archive-empty {
  margin: 0;
  padding: 14px;
  text-align: center;
  font-size: 13px;
  font-style: italic;
  opacity: 0.7;
  background: rgba(0, 0, 0, 0.2);
  border: 1px dashed var(--border-color);
  border-radius: var(--border-radius);
}
.pf-archive-empty-soft {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.75;
}
.pf-archive-week {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  background: var(--pf-overlay-dark-18);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}
.pf-archive-week-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}
.pf-archive-week-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}
.pf-archive-week-key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--pf-accent, var(--pf-palette-amber));
  font-weight: 600;
}
.pf-archive-week-range {
  font-size: 12px;
  opacity: 0.7;
}
.pf-archive-week-count {
  font-size: 11px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  color: var(--pf-accent, var(--pf-palette-amber));
  flex-shrink: 0;
}
.pf-archive-week-count-none {
  color: var(--text-color);
  opacity: 0.4;
}
.pf-archive-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pf-archive-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 4px;
  font-size: 13px;
  line-height: 1.4;
}
.pf-archive-check {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  opacity: 0.4;
}
.pf-archive-item-done .pf-archive-check {
  color: var(--pf-accent, var(--pf-palette-amber));
  opacity: 1;
  font-weight: 600;
}
.pf-archive-text {
  flex: 1;
}
.pf-archive-item-done .pf-archive-text {
  opacity: 0.75;
}

/* Event subgroup within a week */
.pf-archive-event-group {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-color);
}
.pf-archive-event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--pf-accent, var(--pf-palette-amber));
  opacity: 0.85;
}
.pf-archive-event-icon {
  font-size: 14px;
}

.pf-archive-load-more {
  align-self: center;
  padding: 8px 18px;
  margin-top: 4px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.pf-archive-load-more:hover {
  background: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.08);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.45);
}
.pf-archive-end {
  align-self: center;
  margin: 4px 0 0;
  font-size: 11px;
  font-style: italic;
  opacity: 0.5;
}

/* ============================================================
   Backup section — export/import of profile settings as JSON
   ============================================================ */
.pf-backup {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pf-backup-intro {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color);
}
.pf-backup-intro-soft {
  opacity: 0.7;
}
.pf-backup-buttonrow {
  display: flex;
  gap: 10px;
}
.pf-backup-btn {
  flex: 1;
  padding: 10px 16px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.pf-backup-btn:hover {
  background: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.08);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.45);
}
.pf-backup-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding: 14px;
  background: var(--pf-overlay-dark-25);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}
.pf-backup-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.75;
}
.pf-backup-textarea {
  width: 100%;
  min-height: 140px;
  padding: 10px 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  background: var(--box-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  resize: vertical;
  box-sizing: border-box;
}
.pf-backup-textarea:focus {
  outline: none;
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.55);
}
.pf-backup-actionbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pf-backup-action {
  padding: 7px 14px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  background: transparent;
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
}
.pf-backup-action:hover {
  background: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.1);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.45);
}
.pf-backup-action-danger {
  border-color: rgba(220, 80, 80, 0.45);
  color: rgba(230, 160, 160, 0.95);
}
.pf-backup-action-danger:hover {
  background: rgba(220, 80, 80, 0.12);
}
.pf-backup-status {
  font-size: 12px;
  font-style: italic;
  opacity: 0.85;
}
.pf-backup-status-ok   { color: rgba(150, 210, 150, 0.95); }
.pf-backup-status-warn { color: rgba(230, 200, 120, 0.95); }
.pf-backup-status-err  { color: rgba(230, 140, 140, 0.95); }
.pf-backup-confirm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: rgba(220, 80, 80, 0.06);
  border: 1px solid rgba(220, 80, 80, 0.30);
  border-radius: var(--border-radius);
}
.pf-backup-confirm-text {
  flex: 1 1 auto;
  font-size: 12px;
}

/* ============================================================
   Achievements grid
   ============================================================ */
.pf-ach-summary {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 10px;
  letter-spacing: 0.05em;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-ach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}
.pf-ach-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: rgba(232,220,196,0.02);
  border: 1px solid rgba(212,168,85,0.12);
  border-radius: 8px;
  text-align: center;
  cursor: default;
  transition: border-color 0.15s, background 0.15s;
}
.pf-ach-card:hover {
  border-color: rgba(212,168,85,0.3);
  background: rgba(232,220,196,0.04);
}
.pf-ach-card:focus-visible {
  outline: 2px solid var(--pf-accent, #d4a855);
  outline-offset: 1px;
}
.pf-ach-icon { font-size: 22px; line-height: 1; }
.pf-ach-name { font-size: 11px; font-weight: 600; font-family: Georgia, 'Times New Roman', serif; color: #e8dcc4; }
.pf-ach-tier {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid rgba(212,168,85,0.25);
  color: var(--pf-accent, #d4a855);
}
/* Unlock-date line — small, low-emphasis timestamp showing when
   the achievement was first earned. Only rendered on unlocked cards
   that have a recorded date (pre-unlock-tracking legacy unlocks
   won't have one). */
.pf-ach-unlock-date {
  font-size: 9px;
  letter-spacing: 0.04em;
  opacity: 0.45;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin-top: 2px;
}
.pf-ach-locked {
  opacity: 0.35;
}
.pf-ach-locked .pf-ach-icon { filter: grayscale(1); }

.pf-ach-tier-common    .pf-ach-icon { color: #8b95a3; }
.pf-ach-tier-common    .pf-ach-tier { color: #8b95a3; border-color: rgba(139,149,163,0.3); }
.pf-ach-tier-uncommon  .pf-ach-icon { color: #6aa36a; }
.pf-ach-tier-uncommon  .pf-ach-tier { color: #6aa36a; border-color: rgba(106,163,106,0.3); }
.pf-ach-tier-rare      .pf-ach-icon { color: #6a9ad8; }
.pf-ach-tier-rare      .pf-ach-tier { color: #c94545; border-color: rgba(201,69,69,0.4); }
.pf-ach-tier-epic      .pf-ach-icon { color: #b47ad8; }
.pf-ach-tier-epic      .pf-ach-tier { color: #b47ad8; border-color: rgba(180,122,216,0.3); }
.pf-ach-tier-legendary .pf-ach-icon { color: #e8c97a; text-shadow: 0 0 8px rgba(212,168,85,0.4); }
.pf-ach-tier-legendary .pf-ach-tier { color: #e8c97a; border-color: rgba(212,168,85,0.5); }

.pf-ach-unlocked {
  background: rgba(212,168,85,0.04);
  border-color: rgba(212,168,85,0.2);
}

/* ---- Description line on cards (new in categorized view) ---- */
.pf-ach-desc {
  font-size: 10px;
  opacity: 0.55;
  line-height: 1.3;
  padding: 0 4px;
}
.pf-ach-locked .pf-ach-desc {
  opacity: 0.4;
}

/* ---- Tabbed browser ---- */
.pf-ach-browser {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pf-ach-tabs {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}
.pf-ach-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-family: inherit;
  font-size: 12px;
  background: transparent;
  color: var(--text-color);
  border: 1px solid transparent;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.12s, background 0.12s, border-color 0.12s;
}
.pf-ach-tab:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.04);
}
.pf-ach-tab-active {
  opacity: 1;
  background: rgba(var(--pf-palette-amber-rgb), 0.08);
  border-color: var(--pf-accent, rgba(var(--pf-palette-amber-rgb), 0.45));
  border-bottom-color: transparent;
  color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-ach-tab-icon {
  font-size: 13px;
  line-height: 1;
}
.pf-ach-tab-label {
  font-weight: 500;
}
.pf-ach-tab-badge {
  font-size: 10px;
  opacity: 0.65;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
  padding-left: 2px;
}
.pf-ach-tab-active .pf-ach-tab-badge {
  opacity: 0.85;
}

/* ---- Panes ---- */
.pf-ach-panes {
  min-height: 200px;
}
.pf-ach-pane[hidden] { display: none; }
.pf-ach-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pf-ach-pane-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}
.pf-ach-pane-head-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.pf-ach-pane-icon {
  font-size: 18px;
}
.pf-ach-pane-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-ach-pane-count {
  font-size: 12px;
  opacity: 0.65;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  margin-left: auto;
}
.pf-ach-pane-desc {
  font-size: 12px;
  opacity: 0.65;
  margin: 0;
  line-height: 1.4;
}
.pf-ach-pane-empty {
  font-size: 12px;
  opacity: 0.5;
  padding: 18px;
  text-align: center;
  font-style: italic;
}

/* ---- Summary pane ---- */
.pf-ach-summary-overall {
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}
.pf-ach-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.pf-ach-summary-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.65;
  font-weight: 600;
}
.pf-ach-summary-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-ach-prog-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pf-ach-prog-row {
  display: grid;
  grid-template-columns: 20px 1fr 2fr auto;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.pf-ach-prog-icon {
  font-size: 13px;
  opacity: 0.75;
}
.pf-ach-prog-label {
  opacity: 0.8;
}
.pf-ach-prog-pct {
  font-size: 11px;
  opacity: 0.6;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  text-align: right;
  min-width: 44px;
}

/* ---- Progress bars (reused for summary overall + per-category + pane head) ---- */
.pf-ach-prog-bar {
  height: 6px;
  background: var(--pf-overlay-dark-25);
  border-radius: 3px;
  overflow: hidden;
}
.pf-ach-prog-bar-lg {
  height: 10px;
  border-radius: 5px;
}
.pf-ach-prog-bar-fill {
  height: 100%;
  background: var(--pf-accent, var(--pf-palette-amber));
  transition: width 0.25s;
  border-radius: inherit;
  min-width: 0;
}

/* ---- Section title for subgroups inside a pane (e.g., "Recent unlocks") ---- */
.pf-ach-sec-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin: 4px 0 2px;
  opacity: 0.85;
}

/* Recent-unlocks row in Summary reuses .pf-ach-grid for the row shape */
.pf-ach-recent {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

/* ============================================================
   MEMORY / LORE WINDOW
   ============================================================ */

/* Widen the overlay content column when rendering the memory window.
   Default is 800px; three columns need more room. */
.pf-overlay.pf-overlay-wide .pf-overlay-content { max-width: 1200px; }

.pf-mem-window {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 60vh;
  position: relative;
}

.pf-mem-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(212,168,85,0.15);
  padding-bottom: 12px;
}

.pf-mem-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  font-family: Georgia, 'Times New Roman', serif;
  color: #e8dcc4;
  letter-spacing: 0.02em;
}

.pf-mem-context-chip {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 3px;
  background: linear-gradient(180deg, #2a1f0e 0%, #1a1508 100%);
  border: 1px solid rgba(212,168,85,0.35);
  color: var(--pf-accent, #d4a855);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ---- panels grid ---- */

.pf-mem-panels {
  display: grid;
  grid-template-columns: 1fr 1fr 0.6fr;
  gap: 12px;
  min-height: 0;
  flex: 1;
}

@media (max-width: 720px) {
  /* On narrow viewports, stack vertically. Delete zone stays at the
     bottom as a short band so it's still reachable by drag. */
  .pf-mem-panels {
    grid-template-columns: 1fr;
  }
}

.pf-mem-col {
  display: flex;
  flex-direction: column;
  min-height: 280px;
  background:
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px -8px rgba(0,0,0,0.5);
}

.pf-mem-col-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(212,168,85,0.15);
  background: rgba(212,168,85,0.04);
}

.pf-mem-col-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #e8dcc4;
}

.pf-mem-col-title-danger { color: var(--pf-palette-red); }

.pf-mem-col-count {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--pf-overlay-dark-25);
  opacity: 0.85;
}

.pf-mem-col-sub {
  margin-left: auto;
  font-size: 11px;
  opacity: 0.6;
  font-style: italic;
}

.pf-mem-col-drop-over {
  outline: 2px dashed var(--pf-accent, #d4a855);
  outline-offset: -6px;
  background: rgba(212,168,85,0.04);
}

.pf-mem-col-delete.pf-mem-col-drop-over {
  outline-color: #a83232;
  background: rgba(168,50,50,0.06);
}

/* ---- list + cards ---- */

.pf-mem-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pf-mem-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(212,168,85,0.12);
  border-radius: 8px;
  background: rgba(232,220,196,0.02);
  cursor: grab;
  user-select: none;
  transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
}
.pf-mem-card:hover {
  border-color: rgba(212,168,85,0.3);
  background: rgba(232,220,196,0.04);
}

.pf-mem-card:active { cursor: grabbing; }

.pf-mem-card-dragging {
  opacity: 0.45;
  transform: scale(0.98);
}

.pf-mem-card-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.pf-mem-card-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.pf-mem-action {
  font-family: inherit;
  font-size: 11px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  background: var(--box-color);
  color: var(--text-color);
  border-radius: calc(var(--border-radius) - 4px);
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.1s, background 0.1s;
}

.pf-mem-action:hover { opacity: 1; background: var(--box-color-hover, var(--box-color)); }
.pf-mem-action:focus-visible {
  outline: 2px solid var(--link-color, var(--pf-palette-blue));
  outline-offset: 1px;
}

.pf-mem-action-delete {
  color: var(--pf-palette-red);
  font-weight: 600;
}
.pf-mem-action-delete:hover {
  background: rgba(216, 122, 122, 0.12);
}

/* ============================================================
   BUBBLE (topic cluster) styles — added in commit 2 of the Bubble rework.
   ============================================================ */

/* k-control in the panel header */
.pf-mem-k-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 4px;
  background: var(--pf-overlay-dark-18);
  border-radius: 10px;
  font-size: 11px;
  opacity: 0.85;
}
.pf-mem-col-sub + .pf-mem-k-control {
  /* If both subtitle and k-control are present, reset margin-left so
     they sit next to each other */
  margin-left: 0;
}
.pf-mem-k-btn {
  font-family: inherit;
  border: none;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  opacity: 0.65;
  border-radius: 3px;
}
.pf-mem-k-btn:hover { opacity: 1; background: rgba(255, 255, 255, 0.08); }
.pf-mem-k-btn:focus-visible {
  outline: 1px solid var(--link-color, var(--pf-palette-blue));
  outline-offset: 1px;
}
.pf-mem-k-value {
  min-width: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

/* Bubble container */
.pf-mem-bubble {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: calc(var(--border-radius) - 2px);
  background: rgba(0, 0, 0, 0.10);
  overflow: hidden;
  transition: box-shadow 0.15s;
}
.pf-mem-bubble-ungrouped {
  border-style: dashed;
  opacity: 0.85;
}
.pf-mem-bubble-ungrouped .pf-mem-bubble-header {
  font-style: italic;
}

/* Bubble header: drag source + click-to-toggle */
.pf-mem-bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: grab;
  user-select: none;
  background: rgba(185, 137, 74, 0.04); /* subtle gold tint to mark bubble */
  border-bottom: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.pf-mem-bubble-header:active { cursor: grabbing; }
.pf-mem-bubble-header:hover {
  background: rgba(185, 137, 74, 0.10);
}
.pf-mem-bubble-header:focus-visible {
  outline: 2px solid var(--link-color, var(--pf-palette-blue));
  outline-offset: -2px;
}
.pf-mem-bubble[aria-expanded="true"] > .pf-mem-bubble-header,
.pf-mem-bubble-header[aria-expanded="true"] {
  border-bottom-color: var(--border-color);
}
.pf-mem-bubble-dragging {
  opacity: 0.5;
}

.pf-mem-bubble-chevron {
  font-size: 10px;
  opacity: 0.6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  flex-shrink: 0;
}

.pf-mem-bubble-label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  /* A <span> is inline by default, which means overflow/ellipsis don't
     engage — the box grows to fit content. Making it a block-level box
     with a max-width lets the flex parent constrain it, and the
     text-overflow kicks in as intended. */
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}

/* Subtle visual hint that a label has been user-renamed. Keeps the
   main type treatment but adds an italic cast so you can tell at a
   glance that this was set by you, not auto-derived. */
.pf-mem-bubble-label-renamed {
  font-style: italic;
}

/* Inline rename input. Sized to fill the label slot so typing feels
   natural. Text-first styling: same font weight/size as the label it
   replaces, matching the dark Perchance theme. */
.pf-mem-bubble-label-input {
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.01em;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(var(--pf-palette-amber-rgb), 0.5);
  border-radius: 4px;
  color: var(--text-color);
  outline: none;
  width: 100%;
  min-width: 0;
}
.pf-mem-bubble-label-input:focus {
  border-color: rgba(var(--pf-palette-amber-rgb), 0.9);
}

/* Stack label-on-top, preview-underneath, in a flex-column that takes
   the middle width of the bubble header between chevron and count/actions. */
.pf-mem-bubble-labelstack {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;  /* without this, ellipsis won't engage in flex children */
  gap: 1px;
}

.pf-mem-bubble-preview {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.6;
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0;
  font-style: italic;
}

.pf-mem-bubble-count {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--pf-overlay-dark-25);
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

/* "Recently used" indicator on a bubble header: appears when at least
   one member was referenced by the AI in the recent message window.
   Teal-ish accent so it doesn't collide with the lock's gold, the delete
   column's red, or the promote button's neutral. */
.pf-mem-bubble-used {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 9px;
  background: rgba(87, 178, 173, 0.18);
  color: rgba(160, 220, 215, 0.95);
  border: 1px solid rgba(87, 178, 173, 0.35);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

/* Per-card dot: appears to the left of the card text when this specific
   entry was referenced. Dot opacity scales inline via style="opacity: X".
   Same teal as the bubble-level badge. */
.pf-mem-card-used-dot {
  color: rgb(87, 178, 173);
  font-size: 16px;
  line-height: 1;
  margin-right: 6px;
  align-self: center;
  flex-shrink: 0;
  user-select: none;
}

/* Drop-gap elements for reorder (7d). Thin horizontal strips between
   sibling bubbles (in the Memory column) and between sibling cards
   (inside an expanded Memory bubble body). Become visible on dragover
   when a compatible reorder payload is hovering. */
.pf-mem-drop-gap {
  height: 4px;
  margin: 0;
  border-radius: 2px;
  pointer-events: auto;   /* must be true to receive dragover/drop */
  transition: background 0.12s, height 0.12s, margin 0.12s;
}
.pf-mem-drop-gap-bubble {
  height: 6px;            /* bubble-level gaps slightly taller for easier target */
}
.pf-mem-drop-gap-active {
  background: rgba(var(--pf-palette-amber-rgb), 0.6);    /* gold accent */
  height: 12px;
  margin: 2px 0;
  box-shadow: 0 0 8px rgba(var(--pf-palette-amber-rgb), 0.35);
}
.pf-mem-drop-gap-bubble.pf-mem-drop-gap-active {
  height: 14px;
}

/* Drag-reorder grip handle (7c). Rendered only on Memory-scope bubbles
   and Memory-scope cards within unlocked bubbles. 7c establishes the
   drag source; drops become functional in 7d. */
.pf-mem-bubble-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 22px;
  margin-right: -2px;                 /* tighten against chevron */
  cursor: grab;
  color: var(--text-color);
  opacity: 0.35;
  font-size: 14px;
  line-height: 1;
  user-select: none;
  letter-spacing: -3px;               /* pull the two ⋮ columns closer */
  flex-shrink: 0;
  transition: opacity 0.1s;
}
.pf-mem-bubble-grip:hover {
  opacity: 0.8;
}
.pf-mem-bubble-grip:active {
  cursor: grabbing;
}
.pf-mem-bubble-grip-disabled {
  opacity: 0.15;
  cursor: not-allowed;
}
.pf-mem-bubble-grip-disabled:hover {
  opacity: 0.15;
}

.pf-mem-card-grip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  min-height: 100%;
  margin-right: 2px;
  cursor: grab;
  color: var(--text-color);
  opacity: 0.3;
  font-size: 13px;
  line-height: 1;
  user-select: none;
  letter-spacing: -3px;
  flex-shrink: 0;
  transition: opacity 0.1s;
}
.pf-mem-card-grip:hover {
  opacity: 0.7;
}
.pf-mem-card-grip:active {
  cursor: grabbing;
}

/* Lock toggle on bubble header */
.pf-mem-bubble-lock {
  font-family: inherit;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  opacity: 0.5;
  border-radius: 4px;
  padding: 0;
  transition: opacity 0.1s, background 0.1s, border-color 0.1s;
  flex-shrink: 0;
}
.pf-mem-bubble-lock:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.06);
}
.pf-mem-bubble-lock:focus-visible {
  outline: 2px solid var(--link-color, var(--pf-palette-blue));
  outline-offset: 1px;
}
.pf-mem-bubble-lock-on {
  opacity: 1;
  color: var(--pf-palette-amber);                   /* gold accent for "locked" */
  border-color: rgba(var(--pf-palette-amber-rgb), 0.35);
  background: rgba(var(--pf-palette-amber-rgb), 0.08);
}
.pf-mem-bubble-lock-on:hover {
  background: rgba(var(--pf-palette-amber-rgb), 0.16);
}

/* Locked bubble header: subtle visual cue so it reads as "pinned" even
   when the lock icon is tucked to the right. Gold tint + a left border. */
.pf-mem-bubble-header-locked {
  background: rgba(var(--pf-palette-amber-rgb), 0.06);
  box-shadow: inset 3px 0 0 0 rgba(var(--pf-palette-amber-rgb), 0.6);
}
.pf-mem-bubble-header-locked:hover {
  background: rgba(var(--pf-palette-amber-rgb), 0.12);
}

/* Bubble body: the nested cards, only visible when expanded */
.pf-mem-bubble-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 10px 26px; /* left pad aligns with chevron indent */
}
.pf-mem-bubble-body[hidden] { display: none; }

/* Per-bubble settings row — sits at the TOP of an expanded Memory
   bubble's body, above the cards. Small, low-visual-weight strip.
   Currently hosts the Rename button; will grow to include other
   per-bubble controls. */
.pf-mem-bubble-settings-row {
  display: flex;
  gap: 6px;
  padding-bottom: 6px;
  margin-bottom: 2px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
}
.pf-mem-bubble-settings-btn {
  background: transparent;
  border: 1px solid transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  font-family: inherit;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.pf-mem-bubble-settings-btn:hover {
  color: rgba(var(--pf-palette-amber-rgb), 0.95);
  border-color: rgba(var(--pf-palette-amber-rgb), 0.3);
  background: rgba(var(--pf-palette-amber-rgb), 0.08);
}

/* Nested card: slightly subdued vs. standalone cards (pre-bubble era) */
.pf-mem-card-nested {
  background: var(--pf-overlay-dark-18);
  font-size: 12px;
  padding: 8px 10px;
}
.pf-mem-card-nested .pf-mem-card-text {
  font-size: 12px;
}

.pf-mem-empty {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  font-style: italic;
  opacity: 0.55;
}

/* ---- delete panel body (drop target only, no content) ---- */

.pf-mem-col-delete {
  border-color: rgba(216, 122, 122, 0.35);
}

.pf-mem-del-body-empty {
  flex: 1;
  min-height: 80px;
}

.pf-mem-del-count {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(216, 122, 122, 0.18);
  color: var(--pf-palette-red);
  margin-left: auto;
  font-weight: 600;
}

/* ---- footer ---- */

.pf-mem-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.pf-mem-footer-left,
.pf-mem-footer-right {
  display: flex;
  gap: 8px;
}

/* Post-save confirmation banner. A floating pill that appears briefly
   above the footer to confirm what landed on disk. Positioned via the
   wrapper (which is position:relative implicitly by being a flex col)
   so it doesn't displace layout. */
.pf-mem-save-banner {
  position: absolute;
  left: 50%;
  bottom: 70px;
  transform: translate(-50%, 8px);
  background: rgba(20, 40, 20, 0.92);
  border: 1px solid rgba(100, 200, 120, 0.55);
  color: rgba(200, 240, 210, 0.95);
  font-size: 13px;
  font-weight: 500;
  padding: 8px 18px;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
  z-index: 10;
  white-space: nowrap;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pf-mem-save-banner[hidden] {
  display: none;
}
.pf-mem-save-banner-visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

.pf-mem-btn {
  font-family: inherit;
  font-size: 12px;
  padding: 8px 16px;
  border: 1px solid rgba(212,168,85,0.25);
  border-radius: 6px;
  cursor: pointer;
  background: linear-gradient(180deg, var(--pf-theme-secondary-light, #1f2630) 0%, var(--pf-theme-secondary, #161b22) 100%);
  color: #e8dcc4;
  letter-spacing: 0.04em;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.pf-mem-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, #262e38 0%, #1a2028 100%);
  border-color: rgba(212,168,85,0.4);
}
.pf-mem-btn:active:not(:disabled) { transform: translateY(1px); }
.pf-mem-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pf-mem-btn:focus-visible {
  outline: 2px solid var(--pf-accent, #d4a855);
  outline-offset: 2px;
}

.pf-mem-btn-primary {
  background: linear-gradient(180deg, #e8c97a 0%, #d4a855 100%);
  border-color: #8a6a2c;
  color: #0d1117;
  font-weight: 600;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0.08em;
  box-shadow: 0 2px 0 #6b5220, 0 4px 8px rgba(0,0,0,0.3);
}
.pf-mem-btn-primary:hover:not(:disabled) {
  background: linear-gradient(180deg, #f0d590 0%, #d4a855 100%);
}
.pf-mem-btn-primary:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 0 0 #6b5220, 0 2px 4px rgba(0,0,0,0.3);
}

/* ---- export dialog ---- */

.pf-mem-export {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pf-mem-export-hint {
  margin: 0;
  font-size: 13px;
  opacity: 0.8;
}

.pf-mem-export-textarea {
  width: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  background: var(--pf-overlay-dark-25);
  color: var(--text-color);
  resize: vertical;
  min-height: 200px;
}

.pf-mem-export-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* Status pill inside the Import dialog — shows errors inline (wrong
   JSON, nothing to import) or success (which briefly appears before
   the dialog auto-closes). Matches tone of the save-confirm banner. */
.pf-mem-import-status {
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
  margin-top: 10px;
}
.pf-mem-import-status[hidden] { display: none; }
.pf-mem-import-status-ok {
  color: var(--pf-palette-green);
  background: rgba(106, 184, 124, 0.08);
  border: 1px solid rgba(106, 184, 124, 0.3);
}
.pf-mem-import-status-warn {
  color: var(--pf-palette-amber);
  background: rgba(var(--pf-palette-amber-rgb), 0.08);
  border: 1px solid rgba(var(--pf-palette-amber-rgb), 0.3);
}
.pf-mem-import-status-err {
  color: var(--pf-palette-red);
  background: rgba(var(--pf-palette-red-rgb), 0.08);
  border: 1px solid rgba(216, 122, 122, 0.3);
}

/* ---- restore dialog ---- */

.pf-mem-restore {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pf-mem-restore-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 6px;
  background: rgba(0, 0, 0, 0.15);
}

.pf-mem-restore-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border-radius: var(--border-radius);
  background: var(--box-color);
}

.pf-mem-restore-summary {
  flex: 1;
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.4;
  word-break: break-word;
}

/* ---- inert notice ---- */

.pf-mem-notice {
  padding: 30px;
  text-align: center;
  max-width: 500px;
  margin: 60px auto 0;
}

.pf-mem-notice-title {
  margin: 0 0 12px;
  font-size: 20px;
}

.pf-mem-notice-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  opacity: 0.85;
}

/* Activity section — grid of per-feature usage counter chips. One
   chip per action the user has taken (memory saves, bubble renames,
   etc.), plus a footer with first/last activity timestamps. */
.pf-activity {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pf-activity-empty {
  color: var(--text-color);
  opacity: 0.65;
  font-size: 13px;
  line-height: 1.5;
  font-style: italic;
}
.pf-activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}
.pf-activity-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  background: var(--pf-overlay-dark-18);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  transition: background 0.15s, border-color 0.15s;
  cursor: default;
}
.pf-activity-chip:hover {
  background: var(--pf-overlay-dark-25);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.4);
}
.pf-activity-chip-count {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color);
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.pf-activity-chip-label {
  font-size: 11px;
  opacity: 0.7;
  letter-spacing: 0.02em;
  line-height: 1.2;
}
/* 30-day activity sparkline under each chip's label. Uses
   currentColor so it inherits the chip's text color, then we tint
   to accent on hover for an extra beat of visual feedback. */
.pf-activity-chip-spark {
  margin-top: 4px;
  opacity: 0.55;
  color: var(--pf-accent, var(--pf-palette-amber));
  line-height: 0; /* avoid inline-SVG baseline gap */
  transition: opacity 0.15s;
}
.pf-activity-chip:hover .pf-activity-chip-spark {
  opacity: 0.9;
}
.pf-sparkline {
  display: block;
}
.pf-activity-footer {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  opacity: 0.7;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}
.pf-activity-footer strong {
  font-weight: 600;
  opacity: 1;
}

/* ---- Per-thread breakdown strip (#3) ----
   Sits between the chip grid and the timestamp footer. Same muted
   tone as the footer (12px, 0.7 opacity), with a small heading and
   one row per breakdown counter. Each row reads like a sentence:
   "Most-saved threads: Davie (12) · Eli (8) · Mira (3)". Renders
   only when there is per-thread data; never adds an empty section. */
.pf-thread-breakdown {
  font-size: 12px;
  opacity: 0.85;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
}
.pf-thread-breakdown-heading {
  font-weight: 600;
  opacity: 0.7;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.pf-thread-breakdown-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}
.pf-thread-breakdown-label {
  font-weight: 600;
  opacity: 0.85;
  white-space: nowrap;
}
.pf-thread-breakdown-cells {
  display: inline;
}
.pf-thread-breakdown-row-inner {
  display: inline;
}
.pf-thread-breakdown-cell {
  white-space: nowrap;
}
.pf-thread-breakdown-sep {
  opacity: 0.5;
}

/* ---- Memory tool settings drawer ----
   Gear icon in window header toggles a drawer between header and
   panels. Holds tunable knobs (currently: rename threshold). Drawer
   is collapsed by default; slides in when opened. */
.pf-mem-gear-btn {
  margin-left: auto;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-color);
  opacity: 0.55;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s, transform 0.2s;
}
.pf-mem-gear-btn:hover {
  opacity: 0.95;
  background: rgba(255, 255, 255, 0.04);
}
.pf-mem-gear-btn:focus-visible {
  outline: 2px solid rgba(var(--pf-palette-amber-rgb), 0.6);
  outline-offset: 2px;
}
.pf-mem-gear-btn-open {
  opacity: 1;
  background: rgba(var(--pf-palette-amber-rgb), 0.12);
  border-color: rgba(var(--pf-palette-amber-rgb), 0.35);
  transform: rotate(45deg);
}

.pf-mem-set-drawer {
  background: rgba(0, 0, 0, 0.22);
  border-bottom: 1px solid var(--border-color);
  padding: 14px 22px;
}
.pf-mem-set-drawer[hidden] {
  display: none;
}
.pf-mem-set-inner {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;
}
.pf-mem-set-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pf-mem-set-row-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.pf-mem-set-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}
.pf-mem-set-val {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--pf-palette-amber-rgb), 0.95);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  min-width: 40px;
  text-align: right;
}
.pf-mem-set-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.pf-mem-set-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(var(--pf-palette-amber-rgb), 0.95);
  border: 2px solid var(--bg-color, var(--pf-bg-dark));
  cursor: pointer;
  transition: transform 0.1s;
}
.pf-mem-set-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
.pf-mem-set-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(var(--pf-palette-amber-rgb), 0.95);
  border: 2px solid var(--bg-color, var(--pf-bg-dark));
  cursor: pointer;
}
.pf-mem-set-caption {
  font-size: 12px;
  opacity: 0.85;
  color: rgba(var(--pf-palette-amber-rgb), 0.85);
  font-style: italic;
}
.pf-mem-set-hint {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.6;
}

/* ---- Streak banner in Activity section ---- */
.pf-streak-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background: var(--pf-overlay-dark-18);
}
.pf-streak-icon {
  font-size: 28px;
  line-height: 1;
  flex: none;
}
.pf-streak-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pf-streak-line {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}
.pf-streak-sub {
  font-size: 11px;
  opacity: 0.7;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
}
.pf-streak-active {
  background: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.10);
  border-color: rgba(var(--pf-accent-rgb, var(--pf-palette-amber-rgb)), 0.35);
}
.pf-streak-active .pf-streak-line {
  color: rgba(236, 200, 130, 0.98);
}
.pf-streak-at-risk {
  background: rgba(180, 140, 60, 0.08);
  border-color: rgba(180, 140, 60, 0.3);
}
.pf-streak-at-risk .pf-streak-line {
  color: rgba(210, 170, 90, 0.9);
}
.pf-streak-broken {
  opacity: 0.75;
}

/* ---- Right column stack: Create Character (top 2/3) + Delete (bottom 1/3) ---- */
.pf-mem-right-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.pf-mem-right-stack > .pf-mem-col-create-char {
  flex: 2 1 0;
}
.pf-mem-right-stack > .pf-mem-col-delete {
  flex: 1 1 0;
  min-height: 120px;
}

/* Create Character drop zone — green accent to distinguish from
   red Delete. Drop hint centered so it's inviting, not just
   functional. */
.pf-mem-col-create-char {
  border-color: rgba(106, 184, 124, 0.3);
  background: var(--box-color);
}
.pf-mem-col-title-create {
  color: var(--pf-palette-green);
}
.pf-mem-create-char-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 14px;
  text-align: center;
  opacity: 0.72;
  transition: opacity 0.15s;
}
.pf-mem-col-create-char:hover .pf-mem-create-char-body {
  opacity: 0.9;
}
.pf-mem-create-char-icon {
  font-size: 28px;
  line-height: 1;
}
.pf-mem-create-char-hint {
  font-size: 12px;
  line-height: 1.45;
  max-width: 220px;
  opacity: 0.85;
}
.pf-mem-col-create-char.pf-mem-col-drop-over {
  outline-color: var(--pf-palette-green);
  background: rgba(106, 184, 124, 0.10);
}

/* ---- Spin-off confirmation dialog ---- */
.pf-spinoff-dialog {
  max-width: 560px;
  padding: 24px 28px;
}
.pf-spinoff-title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--pf-palette-green);
}
.pf-spinoff-blurb {
  margin: 0 0 18px;
  opacity: 0.8;
  font-size: 13px;
  line-height: 1.5;
}
.pf-spinoff-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.72;
  margin-bottom: 18px;
}
.pf-spinoff-name {
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  outline: none;
  text-transform: none;
  letter-spacing: normal;
  opacity: 1;
}
.pf-spinoff-name:focus {
  border-color: rgba(106, 184, 124, 0.5);
  background: rgba(0, 0, 0, 0.28);
}
.pf-spinoff-preview-wrap {
  margin-bottom: 14px;
  padding: 12px 14px;
  background: var(--pf-overlay-dark-18);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.pf-spinoff-preview-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 6px;
}
.pf-spinoff-preview {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.55;
}
.pf-spinoff-preview li {
  margin: 3px 0;
}
.pf-spinoff-more {
  opacity: 0.55;
  font-style: italic;
  list-style: none;
  margin-left: -18px !important;
}
.pf-spinoff-tip {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.55;
  margin: 0 0 14px;
}
.pf-spinoff-err {
  color: var(--pf-palette-red);
  font-size: 12px;
  padding: 8px 10px;
  background: rgba(var(--pf-palette-red-rgb), 0.08);
  border: 1px solid rgba(216, 122, 122, 0.3);
  border-radius: 4px;
  margin-bottom: 12px;
}
.pf-spinoff-err[hidden] {
  display: none;
}
.pf-spinoff-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* ---- Flair: accent swatch picker + accent color consumers ---- */
.pf-accent-row {
  /* 8 swatches × 34px + 7 gaps × 8px = 328px.
     max-width forces wrap at 8 so the picker reads as 3 clean rows of 8
     regardless of how wide the parent field is. */
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 328px;
}
.pf-accent-swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--pf-accent-preview, var(--pf-palette-amber));
  border: 2px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(0, 0, 0, 0.5);
  font-size: 13px;
  padding: 0;
  /* Kill the browser's default click-focus outline. Without this, the
     browser draws a thick blue/system-accent ring around the LAST-
     CLICKED swatch and that ring never dismisses on mousemove —
     which the eye reads as "this swatch keeps reacting to my hover."
     Keyboard-only focus is restored explicitly via :focus-visible
     below so accessibility isn't lost. */
  outline: none;
  transition: transform 0.1s, border-color 0.15s, box-shadow 0.15s;
}
.pf-accent-swatch:hover:not(:disabled) {
  /* Hover = "you're pointing at this": prominent scale + ring.
     Distinct visual signature from the ACTIVE state below so the
     two never look like they're animating in lockstep. */
  transform: scale(1.1);
  border-color: rgba(255, 255, 255, 0.55);
}
.pf-accent-swatch:focus-visible {
  /* Keyboard-only focus indicator. :focus-visible never matches on
     mouse-click in modern browsers, so this only fires when the user
     tabbed to the swatch — which is exactly when they need a clear
     ring. Uses an offset outline so it sits OUTSIDE the swatch's own
     border, keeping it visually distinct from the active state's
     subtle border-ring + checkmark. */
  outline: 2px dashed rgba(255, 255, 255, 0.7);
  outline-offset: 3px;
}
.pf-accent-swatch-active {
  /* Active = "this is your current pick": a bolder GLYPH inside (✓
     instead of the unlocked dot — handled in details_form.js) plus
     a subtle outline. NO scale, NO heavy white ring — those are the
     hover state's visual signatures, and reusing them here makes
     hovering one swatch look like it's animating another. */
  border-color: rgba(255, 255, 255, 0.35);
  /* The ✓ glyph itself does most of the "this is selected" work,
     so the chrome can stay quiet. */
  color: rgba(0, 0, 0, 0.75);
  font-size: 16px;
  font-weight: 700;
}
.pf-accent-swatch-locked {
  cursor: not-allowed;
  opacity: 0.35;
  filter: grayscale(0.7);
}
.pf-accent-swatch-locked:hover { transform: none; }

/* ---- Theme color pickers ---- */
.pf-theme-pickers {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}
.pf-theme-picker {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pf-theme-color-input {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 2px solid rgba(212,168,85,0.3);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s;
}
.pf-theme-color-input:hover:not(:disabled) {
  border-color: rgba(212,168,85,0.6);
}
.pf-theme-color-input:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.pf-theme-color-input::-webkit-color-swatch-wrapper { padding: 2px; }
.pf-theme-color-input::-webkit-color-swatch { border: none; border-radius: 3px; }
.pf-theme-color-input::-moz-color-swatch { border: none; border-radius: 3px; }
.pf-theme-picker-label {
  font-size: 11px;
  color: #e8dcc4;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.04em;
}
.pf-theme-picker-locked { color: #8b95a3; opacity: 0.5; }
.pf-theme-picker-lock { font-size: 11px; }
.pf-theme-picker-reset {
  background: none;
  border: 1px solid rgba(212,168,85,0.2);
  border-radius: 4px;
  color: #8b95a3;
  cursor: pointer;
  font-size: 12px;
  padding: 1px 5px;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s;
}
.pf-theme-picker-reset:hover { color: #e8dcc4; border-color: rgba(212,168,85,0.4); }

/* --- accent color consumers --- */
/* The overlay gets --pf-accent set via inline style by full_page.js.
   Chrome that previously used the hardcoded gold (var(--pf-palette-amber)) now reads
   --pf-accent so the user's pick shows everywhere appropriate. The
   fallback on .pf-overlay covers the first paint before JS runs. */
.pf-overlay {
  --pf-accent: var(--pf-palette-amber);
  --pf-accent-rgb: var(--pf-palette-amber-rgb);
}
.pf-splash-title {
  color: var(--pf-accent);
}
.pf-splash-level {
  background: var(--pf-accent);
}
.pf-pinned-badge {
  border-color: var(--pf-accent);
}

/* ---- Toast notifications ---- */
.pf-toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 10000;
  pointer-events: none;
  max-width: min(90vw, 360px);
}
.pf-toast {
  background: var(--box-color, var(--pf-bg-dark));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px 18px;
  color: var(--text-color);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.2s, transform 0.2s;
  pointer-events: auto;
}
.pf-toast-visible {
  opacity: 1;
  transform: translateY(0);
}
.pf-toast-info { border-color: rgba(106, 154, 216, 0.4); }
.pf-toast-ok   { border-color: rgba(106, 184, 124, 0.4); }
.pf-toast-warn { border-color: rgba(var(--pf-palette-amber-rgb), 0.4); }
.pf-toast-celebrate {
  border-color: rgba(var(--pf-palette-amber-rgb), 0.6);
  background: linear-gradient(135deg, var(--box-color, var(--pf-bg-dark)), rgba(var(--pf-palette-amber-rgb), 0.08));
}

/* Personal-best toast inner layout */
.pf-toast-pb {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.pf-toast-pb-eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: rgba(var(--pf-palette-amber-rgb), 0.95);
  text-transform: uppercase;
}
.pf-toast-pb-eyebrow-info {
  color: rgba(106, 154, 216, 0.95);
}
.pf-toast-pb-line {
  font-size: 15px;
  font-weight: 600;
}
.pf-toast-pb-sub {
  font-size: 11px;
  opacity: 0.7;
}

/* ---- Share dialog (text-code flow) ---- */
.pf-share-body {
  padding: 24px 28px;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
/* Compact preview card — shows what's packed into the code */
.pf-share-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 18px 16px;
  border-radius: 10px;
  border: 1px solid rgba(212,168,85,0.2);
  background:
    linear-gradient(180deg, rgba(232,220,196,0.02) 0%, transparent 40%),
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
}
.pf-share-preview-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--pf-accent, #d4a855);
  letter-spacing: 0.02em;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-share-preview-sub {
  font-size: 12px;
  color: #8b95a3;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-share-preview-badges {
  font-size: 16px;
  letter-spacing: 6px;
  margin-top: 2px;
}
.pf-share-code-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: #8b95a3;
  margin-top: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
/* The code textarea — monospace, read-only */
.pf-share-code {
  width: 100%;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
  padding: 10px 12px;
  background: rgba(232,220,196,0.03);
  color: #e8dcc4;
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 6px;
  resize: vertical;
  word-break: break-all;
  box-sizing: border-box;
}
.pf-share-code:focus {
  outline: none;
  border-color: rgba(212,168,85,0.55);
  background: rgba(232,220,196,0.05);
}
.pf-share-privacy {
  font-size: 11px;
  line-height: 1.5;
  color: #8b95a3;
  margin: 0;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-share-status {
  font-size: 12px;
  min-height: 16px;
}
.pf-share-status-ok  { color: #6aa36a; }
.pf-share-status-err { color: #c94545; }
.pf-share-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ---- Share-link card viewer v2 (#share-viewer) ----
   Rich profile card display for shared profile links. */
.pf-sv2-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 16px;
  max-width: 400px;
  margin: 0 auto;
  animation: pf-sv2-appear 0.4s ease-out;
}
@keyframes pf-sv2-appear {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pf-sv2-heading {
  font-size: 9px;
  letter-spacing: 0.2em;
  color: #8b95a3;
  font-weight: 600;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  text-transform: uppercase;
}
.pf-sv2-card {
  width: 100%;
  padding: 28px 24px 20px;
  border-radius: 14px;
  border: 1px solid rgba(212,168,85,0.2);
  background:
    linear-gradient(180deg, rgba(232,220,196,0.02) 0%, transparent 20%),
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 24px 50px -20px rgba(0,0,0,0.8);
  color: #e8dcc4;
}
.pf-sv2-stripe {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}
.pf-sv2-level {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin-top: 8px;
}
.pf-sv2-level-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}
.pf-sv2-level-label {
  font-size: 8px;
  letter-spacing: 0.12em;
  font-weight: 700;
  opacity: 0.8;
  color: #fff;
  margin-top: 2px;
}
.pf-sv2-name {
  font-size: 22px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0.02em;
}
.pf-sv2-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.pf-sv2-tag {
  font-size: 12px;
  padding: 3px 12px;
  border-radius: 20px;
  border: 1px solid rgba(212,168,85,0.25);
  font-weight: 500;
}
.pf-sv2-tag-arch {
  opacity: 0.6;
  font-style: italic;
  color: #8b95a3;
  border-color: rgba(139,149,163,0.3);
}
.pf-sv2-stats {
  display: flex;
  gap: 24px;
  padding: 12px 0;
  border-top: 1px solid rgba(212,168,85,0.1);
  border-bottom: 1px solid rgba(212,168,85,0.1);
  width: 100%;
  justify-content: center;
}
.pf-sv2-stat {
  text-align: center;
}
.pf-sv2-stat-val {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-sv2-stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #8b95a3;
  margin-top: 2px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-sv2-section {
  width: 100%;
}
.pf-sv2-sec-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--pf-accent, #d4a855);
  font-weight: 600;
  margin-bottom: 8px;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-sv2-badges {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pf-sv2-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(232,220,196,0.02);
  border: 1px solid rgba(212,168,85,0.12);
}
.pf-sv2-badge-icon {
  font-size: 16px;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}
.pf-sv2-badge-name {
  font-size: 13px;
  font-weight: 500;
  font-family: Georgia, 'Times New Roman', serif;
  color: #e8dcc4;
}
.pf-sv2-xp-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pf-sv2-xp-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(212,168,85,0.1);
  border: 1px solid rgba(212,168,85,0.15);
  overflow: hidden;
}
.pf-sv2-xp-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.6s ease-out;
}
.pf-sv2-xp-pct {
  font-size: 12px;
  font-weight: 500;
  min-width: 36px;
  text-align: right;
  color: #8b95a3;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-sv2-xp-detail {
  font-size: 10px;
  color: #8b95a3;
  margin-top: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-sv2-close {
  margin-top: 4px;
  padding: 8px 28px;
  border-radius: 6px;
  border: 1px solid rgba(212,168,85,0.25);
  background: linear-gradient(180deg, var(--pf-theme-secondary-light, #1f2630) 0%, var(--pf-theme-secondary, #161b22) 100%);
  color: #e8dcc4;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  letter-spacing: 0.04em;
  transition: background 0.15s, border-color 0.15s;
}
.pf-sv2-close:hover {
  border-color: rgba(212,168,85,0.4);
  background: linear-gradient(180deg, #262e38 0%, #1a2028 100%);
}

/* ---- Message controls (Batch 1) ----
   Per-message copy/edit/delete/regen buttons. Hidden by default,
   appear on hover over the message. Positioned below the message
   content. Adapted from FurAI's MIT-licensed CSS. */
.pf-msg-ctrls {
  display: flex;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  position: absolute;
  bottom: -4px;
  right: 8px;
  z-index: 5;
}
.message:hover > .pf-msg-ctrls,
.pf-msg-ctrls:hover {
  opacity: 1;
  pointer-events: auto;
}
.message.user > .pf-msg-ctrls {
  right: auto;
  left: 8px;
}
.pf-msg-ctrl-btn {
  background: var(--box-color, #2a2a2a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 14px;
  padding: 3px 7px;
  border-radius: 4px;
  line-height: 1;
  transition: background 0.1s, color 0.1s;
}
.pf-msg-ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--pf-accent, var(--pf-palette-amber));
}

/* ---- Chat search bar (Batch 1) ----
   Injected above #chatThreads in the sidebar. Filters threads
   by name as the user types. */
.pf-chat-search-bar {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.pf-chat-search-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--text-color, #ccc);
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.pf-chat-search-input:focus {
  border-color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-chat-search-input::placeholder {
  opacity: 0.5;
}
.pf-chat-search-clear {
  background: none;
  border: none;
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  opacity: 0.5;
  line-height: 1;
}
.pf-chat-search-clear:hover {
  opacity: 1;
}

/* ---- Stop generating button (Batch 1) ----
   Appears during AI generation, sits near the chat input. */
.pf-stop-gen-btn {
  background: rgba(220, 60, 60, 0.15);
  border: 1px solid rgba(220, 60, 60, 0.4);
  color: #e06060;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 5px 14px;
  border-radius: 6px;
  transition: background 0.15s;
  margin: 4px;
}
.pf-stop-gen-btn:hover {
  background: rgba(220, 60, 60, 0.3);
}

/* ---- Token count display (Batch 2) ---- */
.pf-token-display {
  font-size: 11px;
  opacity: 0.55;
  padding: 2px 8px;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
}

/* ---- Glossary editor (Batch 2) ---- */
.pf-glossary-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 8, 12, 0.8);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pf-glossary-modal {
  background:
    linear-gradient(180deg, rgba(232,220,196,0.02) 0%, transparent 20%),
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.25);
  border-radius: 14px;
  padding: 22px;
  width: 90%;
  max-width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 24px 50px -20px rgba(0,0,0,0.8);
  color: #e8dcc4;
}
.pf-glossary-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-glossary-hint {
  margin: 0;
  font-size: 12px;
  color: #8b95a3;
  line-height: 1.4;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-glossary-textarea {
  flex: 1;
  min-height: 160px;
  background: rgba(232,220,196,0.03);
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 6px;
  color: #e8dcc4;
  padding: 10px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
.pf-glossary-textarea:focus {
  outline: none;
  border-color: rgba(212,168,85,0.55);
  background: rgba(232,220,196,0.05);
}
.pf-glossary-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.pf-glossary-save, .pf-glossary-cancel {
  padding: 8px 18px;
  border-radius: 6px;
  border: 1px solid rgba(212,168,85,0.25);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  letter-spacing: 0.04em;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.pf-glossary-cancel {
  background: linear-gradient(180deg, var(--pf-theme-secondary-light, #1f2630) 0%, var(--pf-theme-secondary, #161b22) 100%);
  color: #e8dcc4;
}
.pf-glossary-cancel:hover {
  border-color: rgba(212,168,85,0.4);
}
.pf-glossary-save {
  background: linear-gradient(180deg, #e8c97a 0%, #d4a855 100%);
  color: #0d1117;
  border-color: #8a6a2c;
  font-weight: 600;
  font-family: Georgia, 'Times New Roman', serif;
  letter-spacing: 0.08em;
  box-shadow: 0 2px 0 #6b5220, 0 4px 8px rgba(0,0,0,0.3);
}
.pf-glossary-save:hover {
  background: linear-gradient(180deg, #f0d590 0%, #d4a855 100%);
}
.pf-glossary-save:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 #6b5220, 0 2px 4px rgba(0,0,0,0.3);
}
.pf-glossary-trigger {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.pf-glossary-trigger:hover {
  opacity: 1;
}

/* ---- Chat export button ---- */
.pf-export-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 6px;
  opacity: 0.5;
  color: var(--text-color, #ccc);
  transition: opacity 0.15s;
}
.pf-export-btn:hover {
  opacity: 1;
}

/* ---- Thread archiving ---- */
.pf-archive-btn {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.thread:hover .pf-archive-btn {
  opacity: 0.6;
  pointer-events: auto;
}
.pf-archive-btn:hover {
  opacity: 1 !important;
}
.thread.pf-archived {
  opacity: 0.5;
}
.pf-archive-section {
  padding: 4px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.pf-archive-toggle {
  background: none;
  border: none;
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 12px;
  opacity: 0.6;
  padding: 4px 0;
  font-family: inherit;
  width: 100%;
  text-align: left;
}
.pf-archive-toggle:hover {
  opacity: 1;
}

/* ---- Impersonation button (Batch 4) ---- */
.pf-impersonate-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.pf-impersonate-btn:hover {
  opacity: 1;
}
.pf-impersonate-btn:disabled {
  cursor: wait;
  opacity: 0.3;
}

/* ---- Writing enhancer + Narration buttons (Batch 4) ---- */
.pf-enhance-btn, .pf-narrate-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.pf-enhance-btn:hover, .pf-narrate-btn:hover {
  opacity: 1;
}
.pf-enhance-btn:disabled, .pf-narrate-btn:disabled {
  cursor: wait;
  opacity: 0.3;
}

/* ---- Prompt presets dropdown ---- */
.pf-presets-container { position: relative; display: inline-block; }
.pf-presets-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.pf-presets-btn:hover { opacity: 1; }
.pf-presets-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  min-width: 200px;
  max-height: 260px;
  overflow-y: auto;
  background: var(--box-color, #1e1e1e);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 4px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pf-preset-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 4px;
  text-align: left;
  font-family: inherit;
  width: 100%;
}
.pf-preset-item:hover { background: rgba(255,255,255,0.08); }
.pf-preset-save { opacity: 0.6; font-style: italic; }
.pf-preset-del {
  font-size: 11px;
  opacity: 0.4;
  margin-left: 8px;
  cursor: pointer;
}
.pf-preset-del:hover { opacity: 1; color: #e06060; }

/* ---- Bulk thread operations ---- */
.pf-bulk-toggle {
  background: none;
  border: none;
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  opacity: 0.6;
  font-family: inherit;
}
.pf-bulk-toggle:hover { opacity: 1; }
.pf-bulk-cb {
  margin-right: 6px;
  cursor: pointer;
  flex-shrink: 0;
}
.pf-bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 12px;
}
.pf-bulk-count { opacity: 0.6; }
.pf-bulk-action {
  background: none;
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  font-family: inherit;
}
.pf-bulk-action:hover { background: rgba(255,255,255,0.08); }
.pf-bulk-del:hover { border-color: #e06060; color: #e06060; }

/* ---- Image gen container ---- */
.pf-gen-img-container {
  margin-top: 8px;
  display: inline-block;
  border-radius: 8px;
  overflow: hidden;
}
.pf-gen-img-container iframe {
  max-width: 300px;
  max-height: 300px;
  border: none;
}

/* ---- Light theme overrides ---- */
body.pf-light-theme .pf-msg-ctrl-btn {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.12);
  color: #333;
}
body.pf-light-theme .pf-msg-ctrl-btn:hover {
  background: rgba(0, 0, 0, 0.12);
}
body.pf-light-theme .pf-chat-search-input {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.12);
  color: #1a1a1a;
}
body.pf-light-theme .pf-presets-dropdown,
body.pf-light-theme .pf-glossary-modal {
  background: #fff;
  border-color: rgba(0, 0, 0, 0.12);
  color: #1a1a1a;
}
body.pf-light-theme .pf-glossary-textarea {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.12);
  color: #1a1a1a;
}

/* ---- Character browser cards ---- */
.pf-char-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}
.pf-char-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--pf-accent, var(--pf-palette-amber));
}
.pf-char-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin: 0 auto 8px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.pf-char-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Branch navigation ---- */
.pf-branch-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 11px;
  opacity: 0.6;
}
.pf-branch-btn {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-color, #ccc);
  cursor: pointer;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1;
}
.pf-branch-btn:hover { background: rgba(255, 255, 255, 0.08); }
.pf-branch-btn:disabled { opacity: 0.3; cursor: default; }
.pf-branch-label { font-family: ui-monospace, monospace; }

/* ---- Document analysis status ---- */
.pf-doc-status {
  font-size: 11px;
  opacity: 0.6;
  padding: 2px 8px;
  white-space: nowrap;
}

/* ---- Message timestamps ---- */
.pf-timestamp {
  font-size: 10px;
  opacity: 0.4;
  margin-left: 8px;
  font-family: ui-monospace, monospace;
}

/* ---- Tools menu ---- */
.pf-tools-container {
  position: relative;
  display: inline-block;
}
.pf-tools-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: linear-gradient(180deg, var(--pf-theme-secondary-light, #1f2630) 0%, var(--pf-theme-secondary, #161b22) 100%);
  border: 1px solid rgba(212,168,85,0.3);
  border-radius: 8px;
  color: #e8dcc4;
  cursor: pointer;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  transition: border-color 0.15s, background 0.15s;
}
.pf-tools-trigger:hover {
  border-color: rgba(212,168,85,0.55);
}
.pf-tools-trigger-open {
  border-color: rgba(212,168,85,0.55);
  background: linear-gradient(180deg, rgba(212,168,85,0.12) 0%, var(--pf-theme-secondary, #161b22) 100%);
}
.pf-tools-trigger-icon {
  font-size: 14px;
  line-height: 1;
}
.pf-tools-trigger-label {
  font-weight: 500;
}
.pf-tools-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  max-width: 280px;
  background:
    linear-gradient(180deg, rgba(232,220,196,0.02) 0%, transparent 20%),
    linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.25);
  border-radius: 12px;
  box-shadow: 0 12px 32px -8px rgba(0,0,0,0.7);
  padding: 10px;
  z-index: 9999;
  animation: pf-tools-in 0.15s ease-out;
}
@keyframes pf-tools-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.pf-tools-popup-label {
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 600;
  margin-bottom: 8px;
  padding: 0 2px;
}
.pf-tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 4px;
}
.pf-tools-cell {
  display: flex;
  align-items: center;
  justify-content: center;
}
.pf-tools-cell .pf-presets-btn,
.pf-tools-cell .pf-export-btn,
.pf-tools-cell .pf-tools-item {
  width: 38px;
  height: 38px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: rgba(232,220,196,0.03);
  border: 1px solid rgba(212,168,85,0.12);
  border-radius: 8px;
  color: #e8dcc4;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.pf-tools-cell .pf-presets-btn:hover,
.pf-tools-cell .pf-export-btn:hover,
.pf-tools-cell .pf-tools-item:hover {
  background: rgba(212,168,85,0.08);
  border-color: rgba(212,168,85,0.35);
  transform: scale(1.08);
}
/* Presets containers inside the grid need special sizing */
.pf-tools-cell .pf-presets-container {
  position: relative;
}
.pf-tools-cell .pf-presets-dropdown {
  bottom: calc(100% + 4px);
  right: 0;
  left: auto;
}

/* ---- Context dashboard ---- */
.pf-ctx-dashboard {
  padding: 8px 10px;
  margin-bottom: 6px;
  background: linear-gradient(180deg, var(--pf-theme-secondary, #161b22) 0%, var(--pf-theme-primary, #0d1117) 100%);
  border: 1px solid rgba(212,168,85,0.15);
  border-radius: 8px;
  font-size: 11px;
}
.pf-ctx-header {
  margin-bottom: 6px;
}
.pf-ctx-title {
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 600;
}
.pf-ctx-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pf-ctx-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.4;
}
.pf-ctx-row-active {
  opacity: 1;
  background: rgba(212,168,85,0.04);
}
.pf-ctx-icon { font-size: 12px; width: 18px; text-align: center; flex-shrink: 0; }
.pf-ctx-label {
  font-weight: 500;
  color: #e8dcc4;
  min-width: 55px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
}
.pf-ctx-detail {
  color: #8b95a3;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
}
.pf-ctx-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  opacity: 0.4;
  transition: opacity 0.15s;
}
.pf-ctx-toggle:hover { opacity: 1; }

/* ---- Recap message ---- */
.pf-recap-message {
  position: relative;
  padding: 14px 16px;
  margin: 8px 0;
  background: linear-gradient(180deg, rgba(212,168,85,0.06) 0%, rgba(212,168,85,0.02) 100%);
  border: 1px solid rgba(212,168,85,0.2);
  border-radius: 10px;
  border-left: 3px solid var(--pf-accent, #d4a855);
}
.pf-recap-label {
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pf-accent, #d4a855);
  font-family: Georgia, 'Times New Roman', serif;
  font-weight: 600;
  margin-bottom: 6px;
}
.pf-recap-content {
  font-size: 13px;
  line-height: 1.5;
  color: #e8dcc4;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
}
.pf-recap-dismiss {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: #8b95a3;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.pf-recap-dismiss:hover { opacity: 1; }

/* ---- Message bookmarks ---- */
.pf-bookmark-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #8b95a3;
  opacity: 0.3;
  transition: opacity 0.15s, color 0.15s;
  padding: 2px 4px;
}
.pf-bookmark-btn:hover { opacity: 0.8; }
.pf-bookmark-active {
  color: var(--pf-accent, #d4a855);
  opacity: 1;
}
.pf-bookmarked {
  border-left: 2px solid var(--pf-accent, #d4a855);
}
.pf-bookmark-flash {
  animation: pf-bookmark-pulse 0.6s ease-out 3;
}
@keyframes pf-bookmark-pulse {
  0%, 100% { background: transparent; }
  50% { background: rgba(212,168,85,0.08); }
}

/* ---- Code syntax highlighting (Batch 3) ----
   Token colors for regex-based highlighting of code blocks.
   Designed for dark backgrounds matching upstream's code block style. */
.pf-tok-kw { color: #c792ea; } /* keywords — purple */
.pf-tok-str { color: #c3e88d; } /* strings — green */
.pf-tok-cmt { color: #6a737d; font-style: italic; } /* comments — grey */
.pf-tok-num { color: #f78c6c; } /* numbers — orange */
.pf-tok-fn { color: #82aaff; } /* function names — blue */

/* ---- Voice I/O buttons (Batch 3) ---- */
.pf-voice-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px;
  opacity: 0.6;
  transition: opacity 0.15s;
}
.pf-voice-btn:hover {
  opacity: 1;
}
.pf-mic-btn.pf-listening {
  opacity: 1;
  animation: pf-pulse 1s infinite;
}
@keyframes pf-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
`.trim();
