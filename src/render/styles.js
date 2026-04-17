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
`.trim();
