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
   Mini-card pending indicator — the "friendly wave"
   - Gentle breathing glow while there's anything unseen
   - Small gold dot in the avatar corner as a permanent marker
     (survives prefers-reduced-motion, colorblind-friendly)
   - Cleared when the full profile is opened (mark-seen)
   ============================================================ */

@keyframes pf-mini-pending-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(216, 179, 106, 0); }
  50%      { box-shadow: 0 0 10px 1px rgba(216, 179, 106, 0.28); }
}

@keyframes pf-mini-pending-dot-pulse {
  0%, 100% { transform: scale(1);    opacity: 0.95; }
  50%      { transform: scale(1.18); opacity: 0.70; }
}

.pf-mini-card-pending {
  animation: pf-mini-pending-pulse 3.5s ease-in-out infinite;
  border-color: rgba(216, 179, 106, 0.35);
}
.pf-mini-card-pending:hover {
  /* On hover, settle the glow — we've got their attention, stop waving */
  animation: none;
  border-color: rgba(216, 179, 106, 0.55);
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
  background: #d8b36a;
  border: 2px solid var(--box-color, var(--background));
  box-shadow: 0 0 4px 1px rgba(216, 179, 106, 0.5);
  animation: pf-mini-pending-dot-pulse 2.2s ease-in-out infinite;
  pointer-events: none;
}

/* Respect users who've asked for reduced motion — kill the animations
   but keep the dot + border so the state is still conveyed visually. */
@media (prefers-reduced-motion: reduce) {
  .pf-mini-card-pending          { animation: none; }
  .pf-mini-avatar-has-dot::after { animation: none; }
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
  /* Align to the right edge of the 800px-max content column on wide viewports.
     Falls back to the viewport edge (+12px gutter) on screens narrow enough
     that the content column is already flush against the sides. */
  right: max(12px, calc(50% - 400px - 44px));
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

/* Share/screenshot button — small, top-right corner of the splash */
.pf-splash {
  position: relative; /* anchor for the share button's absolute positioning */
}
.pf-splash-share {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-color);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 0.15s, border-color 0.15s, transform 0.15s;
}
.pf-splash-share:hover {
  opacity: 1;
  border-color: rgba(216, 179, 106, 0.55);
  transform: scale(1.05);
}
.pf-splash-share:focus-visible {
  outline: 2px solid rgba(216, 179, 106, 0.55);
  outline-offset: 1px;
  opacity: 1;
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

/* Hide everything in the content column except the splash when focused */
.pf-overlay-focused .pf-overlay-content > :not(.pf-splash) {
  display: none;
}

/* Center the splash vertically in the viewport when focused */
.pf-overlay-focused .pf-overlay-scroll {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 40px 16px;
}
.pf-overlay-focused .pf-overlay-content {
  width: 100%;
  max-width: 560px;
}

/* Make the splash card-like when focused — slightly bigger, extra glow */
.pf-overlay-focused .pf-splash {
  box-shadow:
    0 0 0 1px rgba(216, 179, 106, 0.15),
    0 20px 60px -10px rgba(0, 0, 0, 0.65),
    0 4px 20px rgba(216, 179, 106, 0.08);
  padding: 36px 32px 28px;
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
  border: 2px solid #d8b36a;
  box-shadow: 0 0 0 1px rgba(216, 179, 106, 0.25);
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
  color: #d8b36a;
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
  border-color: rgba(216, 179, 106, 0.55);
}
.pf-avatar-btn:focus-visible {
  outline: 2px solid rgba(216, 179, 106, 0.55);
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
  color: #d8b36a;
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
   Prompts section — this week's writing ideas
   ============================================================ */
.pf-prompts { display: flex; flex-direction: column; gap: 14px; }

/* Event groups (active holidays/observances) appear above regular prompts.
   Each event gets a subtle gold-tinted banner to distinguish it from the
   weekly rotation. */
.pf-event-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pf-event-group {
  background: linear-gradient(180deg, rgba(216, 179, 106, 0.07) 0%, rgba(216, 179, 106, 0.03) 100%);
  border: 1px solid rgba(216, 179, 106, 0.30);
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
  color: #d8b36a;
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
  border-color: rgba(216, 179, 106, 0.25);
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
  accent-color: #d8b36a;
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
  text-decoration-color: rgba(216, 179, 106, 0.5);
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
  fill: rgba(216, 179, 106, 0.22);
  stroke: #d8b36a;
  stroke-width: 1.5;
  stroke-linejoin: round;
}
/* Vertex dots where the user's values land */
.pf-radar-value-dot {
  fill: #d8b36a;
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
  color: #d8b36a;
  font-weight: 600;
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
