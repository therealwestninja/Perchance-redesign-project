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

.pf-mini-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  margin-bottom: 0.5rem;
  background: var(--box-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  font-family: inherit;
}
.pf-mini-card:hover {
  background: var(--box-color-hover, var(--box-color));
  border-color: var(--button-border-color, var(--border-color));
}
.pf-mini-card:active {
  transform: translateY(1px);
}
.pf-mini-card:focus-visible {
  outline: 2px solid var(--link-color, #4a90e2);
  outline-offset: 1px;
}

.pf-mini-avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--button-bg);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 18px;
  line-height: 1;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}
.pf-mini-avatar-text {
  /* letter-only monogram when no avatar image is set */
  color: var(--text-color);
  opacity: 0.85;
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
}

.pf-mini-level {
  flex-shrink: 0;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.65;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}

.pf-mini-meta {
  font-size: 10px;
  opacity: 0.55;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
}

.pf-mini-bar {
  height: 3px;
  background: rgba(127, 127, 127, 0.18);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 2px;
}
.pf-mini-bar-fill {
  height: 100%;
  /* Warm gold accent — chosen to read well on both dark and light themes.
     Not theme-var-driven on purpose: this is the single "game accent" the
     project adds, and keeping it constant makes the UI recognizably ours. */
  background: linear-gradient(90deg, #b9894a 0%, #d8b36a 100%);
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
   Full-screen profile overlay
   ============================================================ */

.pf-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.75);
  color: var(--text-color);
  /* Backdrop blur when supported — subtle, doesn't scream */
  -webkit-backdrop-filter: blur(2px);
          backdrop-filter: blur(2px);
}
.pf-overlay[hidden] { display: none; }

.pf-overlay-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px 16px 80px;
  /* Let scroll-container click dismiss only when clicking the BG, not content */
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
  right: 12px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--box-color);
  color: var(--text-color);
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
  outline: 2px solid var(--link-color, #4a90e2);
  outline-offset: 2px;
}

/* ============================================================
   Splash — the above-the-fold breadwinner
   ============================================================ */

.pf-splash {
  background: var(--box-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 28px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.pf-splash-top {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.pf-splash-avatar {
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: var(--button-bg);
  border: 2px solid #d8b36a;
  box-shadow: 0 0 0 1px rgba(216, 179, 106, 0.25), 0 4px 14px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}
.pf-splash-avatar-text {
  font-size: 44px;
  font-weight: 600;
  line-height: 1;
  color: #d8b36a;
}

.pf-splash-ident {
  flex: 1;
  min-width: 0;
}
.pf-splash-name {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  margin: 0 0 4px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pf-splash-title {
  font-style: italic;
  font-size: 14px;
  opacity: 0.75;
  color: #d8b36a;
}

.pf-splash-levelrow {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pf-splash-level {
  flex-shrink: 0;
  padding: 4px 10px;
  border: 1px solid rgba(216, 179, 106, 0.45);
  border-radius: 999px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #d8b36a;
  background: rgba(185, 137, 74, 0.08);
}
.pf-splash-level-word { opacity: 0.7; }
.pf-splash-level strong { color: var(--text-color); font-weight: 600; }

.pf-splash-xpbar {
  flex: 1;
  height: 8px;
  background: rgba(127, 127, 127, 0.18);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(216, 179, 106, 0.2);
}
.pf-splash-xpbar-fill {
  height: 100%;
  background: linear-gradient(90deg, #b9894a 0%, #d8b36a 100%);
  transition: width 0.4s ease;
}
.pf-splash-xp-label {
  flex-shrink: 0;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  opacity: 0.65;
  letter-spacing: 0.02em;
}

.pf-splash-badges {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.pf-splash-badge {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: rgba(185, 137, 74, 0.12);
  border: 1px solid rgba(216, 179, 106, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #d8b36a;
}
.pf-splash-badge-locked {
  background: transparent;
  border-style: dashed;
  border-color: var(--border-color);
  color: var(--text-color);
  opacity: 0.22;
}

/* ============================================================
   Section — collapsible + blurrable wrapper used below the fold
   ============================================================ */

.pf-section {
  background: var(--box-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 16px 20px;
}

.pf-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.pf-section-title {
  flex: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  opacity: 0.75;
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
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-color);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  font-family: inherit;
}
.pf-section-ctrl:hover { opacity: 1; background: var(--box-color-hover, var(--button-bg)); }
.pf-section-ctrl:focus-visible {
  outline: 2px solid var(--link-color, #4a90e2);
  outline-offset: 1px;
}
.pf-section-eye[aria-pressed="true"] {
  opacity: 1;
  background: rgba(185, 137, 74, 0.12);
  border-color: rgba(216, 179, 106, 0.45);
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
  outline: 2px solid var(--link-color, #4a90e2);
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
  border-color: rgba(216, 179, 106, 0.55);
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
  font-size: 12px;
  letter-spacing: 0.06em;
  opacity: 0.7;
  padding-top: 8px;
}
.pf-field-input {
  width: 100%;
  padding: 8px 10px;
  background: var(--textarea-bg, var(--background));
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-family: inherit;
  font-size: 13px;
  font-family: inherit;
}
.pf-field-input:focus {
  outline: none;
  border-color: rgba(216, 179, 106, 0.55);
}
.pf-field-stack { display: flex; flex-direction: column; gap: 10px; }

.pf-details-note {
  margin: 4px 0 0;
  font-size: 11px;
  opacity: 0.55;
  font-style: italic;
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
    linear-gradient(180deg, rgba(216, 179, 106, 0.06) 0%, rgba(0, 0, 0, 0.1) 100%),
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
  outline: 2px solid rgba(216, 179, 106, 0.55);
  outline-offset: 2px;
}

.pf-gs-dot {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #d8b36a;
  border: 2px solid var(--box-color);
  box-shadow: 0 0 0 1px rgba(216, 179, 106, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
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
.pf-chron-value-maxed .pf-chron-denom { color: #d8b36a; opacity: 1; }
.pf-chron-bar {
  height: 3px;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 2px;
  overflow: hidden;
}
.pf-chron-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #b9894a 0%, #d8b36a 100%);
  border-radius: 2px;
  transition: width 0.4s;
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
  background: rgba(127, 127, 127, 0.04);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  text-align: center;
  cursor: default;
}
.pf-ach-card:focus-visible {
  outline: 2px solid var(--link-color, #4a90e2);
  outline-offset: 1px;
}
.pf-ach-icon { font-size: 22px; line-height: 1; }
.pf-ach-name { font-size: 11px; font-weight: 600; }
.pf-ach-tier {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.55;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.pf-ach-locked {
  opacity: 0.35;
}
.pf-ach-locked .pf-ach-icon { filter: grayscale(1); }

.pf-ach-tier-common    .pf-ach-icon { color: #a8a8a8; }
.pf-ach-tier-uncommon  .pf-ach-icon { color: #6aa36a; }
.pf-ach-tier-rare      .pf-ach-icon { color: #6a9ad8; }
.pf-ach-tier-epic      .pf-ach-icon { color: #b47ad8; }
.pf-ach-tier-legendary .pf-ach-icon { color: #d8b36a; }

.pf-ach-unlocked {
  background: rgba(185, 137, 74, 0.04);
  border-color: rgba(216, 179, 106, 0.20);
}
`.trim();
