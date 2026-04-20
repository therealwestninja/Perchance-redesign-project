// render/details_form.js
//
// The "Details" section body: avatar upload, display name, username, title
// override, age range, gender square, optional free-text. All fields
// optional; non-file fields auto-save on blur.

import { h, replaceContents, escapeCssUrl } from '../utils/dom.js';
import { getInitialFromName } from '../utils/format.js';
import { updateField, loadSettings, AGE_RANGE_OPTIONS } from '../profile/settings_store.js';
import { createGenderSquare } from './gender_square.js';
import { checkImageFile, resizeImageToDataURL } from '../utils/image.js';
import { getAvailableTitles, getAccents, getVellums, getSilvers } from '../profile/flair.js';
import { ACHIEVEMENTS } from '../achievements/registry.js';

/**
 * Check whether specific flair picker achievements are unlocked.
 * Each picker gates on a dedicated achievement rather than a
 * percentage-of-total, so the thresholds are explicit and the
 * achievement grid shows the user exactly what they need.
 */
function getFlairUnlocks(unlockedIds) {
  const set = new Set(unlockedIds || []);
  return {
    accent:  set.has('palette_unlocked'),  // first profile open
    vellum:  set.has('palette_vellum'),     // 3 achievements
    silver:  set.has('palette_silver'),     // 8 achievements
    deep:    set.has('palette_deep'),       // 15 achievements
  };
}

export function createDetailsBody({ profile = {}, unlockedIds = [], stats = {} } = {}) {
  // ---- avatar upload ----
  const avatarControl = createAvatarControl({ initialUrl: profile.avatarUrl });

  // ---- display name ----
  const displayNameInput = h('input', {
    class: 'pf-field-input',
    type: 'text',
    maxlength: '40',
    placeholder: 'How your name appears on your profile',
    onBlur: (ev) => updateField('profile.displayName', ev.target.value.trim()),
  });
  displayNameInput.value = String(profile.displayName || '');

  // ---- username (separate from display name — short handle) ----
  const usernameInput = h('input', {
    class: 'pf-field-input',
    type: 'text',
    maxlength: '30',
    placeholder: '@yourhandle',
    onBlur: (ev) => updateField('profile.username', ev.target.value.trim()),
  });
  usernameInput.value = String(profile.username || '');

  // ---- title: free-text override OR pick from unlocked achievements ----
  //
  // Previously this was a single text input ("type whatever" or fall
  // back to auto-rarest). Now the user also sees a dropdown of titles
  // they've actually earned, letting them wear a specific achievement
  // instead of accepting the auto pick. Free text still wins if both
  // are set (documented in flair.js#resolveActiveTitle).
  const currentFlair = (profile.flair && typeof profile.flair === 'object')
    ? profile.flair
    : { title: null, accent: null };

  const availableTitles = getAvailableTitles(unlockedIds);
  const titleSelect = h('select', {
    class: 'pf-field-input',
    onChange: (ev) => {
      const v = ev.target.value;
      updateField('profile.flair.title', v || null);
    },
  }, [
    h('option', { value: '' }, ['Auto (rarest unlocked)']),
    ...availableTitles.map(t =>
      h('option', {
        value: t.id,
        selected: t.id === currentFlair.title,
      }, [`${t.name} (${t.tier})`])
    ),
  ]);

  const titleInput = h('input', {
    class: 'pf-field-input',
    type: 'text',
    maxlength: '40',
    placeholder: 'Or type a custom title (overrides the picker)',
    onBlur: (ev) => updateField('profile.titleOverride', ev.target.value.trim()),
  });
  titleInput.value = String(profile.titleOverride || '');

  // ---- flair: achievement-gated color pickers ----
  //
  // Three swatch rows — Accent, Text (vellum), Meta (silver) — each
  // gated on a dedicated palette_* achievement. The picker for each
  // row only appears once the user has earned the corresponding
  // achievement; before that, a locked hint shows what's needed.
  const flairUnlocks = getFlairUnlocks(unlockedIds);

  // Shared glyph logic for all swatch rows.
  function glyphFor(isUnlocked, isActive) {
    if (!isUnlocked) return '🔒';
    if (isActive)   return '✓';
    return '●';
  }

  /**
   * Build a swatch row for a flair palette. Reused for accent, vellum,
   * and silver — same markup, same click-to-toggle, same glyph logic.
   *
   * @param {Array} items        palette items from getAccents / getVellums / getSilvers
   * @param {string} flairKey    settings path under profile.flair (e.g. 'accent')
   * @param {string} defaultId   the default color id (e.g. 'amber', 'parchment', 'pewter')
   */
  function buildSwatchRow(items, flairKey, defaultId) {
    const currentPick = currentFlair[flairKey] || null;
    const container = h('div', { class: 'pf-accent-row' },
      items.map(a => {
        const isActive = currentPick === a.id || (!currentPick && a.id === defaultId);
        const btn = h('button', {
          type: 'button',
          class: [
            'pf-accent-swatch',
            isActive ? 'pf-accent-swatch-active' : '',
            a.isUnlocked ? '' : 'pf-accent-swatch-locked',
          ].filter(Boolean).join(' '),
          'aria-label': a.isUnlocked
            ? `${a.label}${isActive ? ' (active)' : ''}`
            : `Locked: ${a.description}`,
          title: a.isUnlocked
            ? `${a.label} — ${a.description}`
            : `🔒 ${a.description}`,
          disabled: !a.isUnlocked,
          style: `--pf-accent-preview:${a.color};`,
          onClick: () => {
            if (!a.isUnlocked) return;
            const nextVal = (currentPick === a.id) ? null : a.id;
            updateField(`profile.flair.${flairKey}`, nextVal);
            const updated = items.map(x => ({
              ...x,
              _active: nextVal === x.id || (!nextVal && x.id === defaultId),
            }));
            for (let i = 0; i < updated.length; i++) {
              const swatch = container.children[i];
              if (!swatch) continue;
              swatch.classList.toggle('pf-accent-swatch-active', updated[i]._active);
              const innerSpan = swatch.firstChild;
              if (innerSpan && innerSpan.tagName === 'SPAN') {
                innerSpan.textContent = glyphFor(updated[i].isUnlocked, updated[i]._active);
              }
            }
            currentFlair[flairKey] = nextVal;
            try { btn.blur(); } catch { /* non-fatal */ }
          },
        }, [
          h('span', { 'aria-hidden': 'true' }, [glyphFor(a.isUnlocked, isActive)]),
        ]);
        return btn;
      })
    );
    return container;
  }

  // Build each row only if the corresponding achievement is unlocked;
  // otherwise show a locked hint.
  function lockedHint(text) {
    return h('div', { class: 'pf-flair-locked-hint' }, [`🔒 ${text}`]);
  }

  const accentRow = flairUnlocks.accent
    ? buildSwatchRow(getAccents(stats, unlockedIds), 'accent', 'amber')
    : lockedHint('Open your profile to unlock the accent palette.');

  const vellumRow = flairUnlocks.vellum
    ? buildSwatchRow(getVellums(stats, unlockedIds), 'vellum', 'parchment')
    : lockedHint('Earn 3 achievements to unlock the text color palette.');

  const silverRow = flairUnlocks.silver
    ? buildSwatchRow(getSilvers(stats, unlockedIds), 'silver', 'pewter')
    : lockedHint('Earn 8 achievements to unlock the meta text palette.');

  // ---- age range ----
  const ageSelect = h('select', {
    class: 'pf-field-input',
    onBlur: (ev) => updateField('profile.ageRange', ev.target.value),
    onChange: (ev) => updateField('profile.ageRange', ev.target.value),
  }, AGE_RANGE_OPTIONS.map(opt =>
    h('option', { value: opt.value, selected: opt.value === (profile.ageRange || '') }, [opt.label])
  ));

  // ---- gender square ----
  const genderSquare = createGenderSquare({ initialValue: profile.genderPos });

  // ---- gender free-text ----
  const genderCustomInput = h('input', {
    class: 'pf-field-input',
    type: 'text',
    maxlength: '80',
    placeholder: 'in your own words (optional)',
    onBlur: (ev) => updateField('profile.genderCustom', ev.target.value.trim()),
  });
  genderCustomInput.value = String(profile.genderCustom || '');

  return h('div', { class: 'pf-details' }, [
    row('Avatar',       avatarControl),
    row('Display name', displayNameInput),
    row('Username',     usernameInput),
    row('Title',        titleSelect),
    row('Custom title', titleInput),
    // Multi-control rows below use groupRow (a <div role="group">) so
    // the wrapping element doesn't implicitly associate with the first
    // child control — which would propagate :hover to it from anywhere
    // in the row.
    groupRow('Accent',     accentRow),
    groupRow('Text color', vellumRow),
    groupRow('Meta color', silverRow),
    createThemeColorRow(profile, unlockedIds),
    row('Age range',    ageSelect),
    groupRow('Gender',  h('div', { class: 'pf-field-stack' }, [
      genderSquare,
      genderCustomInput,
    ])),
    h('p', { class: 'pf-details-note' }, [
      'All fields optional. Data stays in your browser.',
    ]),
  ]);
}

function row(labelText, control) {
  return h('label', { class: 'pf-field-row' }, [
    h('span', { class: 'pf-field-label' }, [labelText]),
    control,
  ]);
}

/**
 * Like row(), but for multi-control groups (accent picker, gender
 * options, etc.). Uses a <div role="group"> instead of <label>
 * because <label>-wrapping a row of N buttons makes the FIRST button
 * the label's implicit target — every :hover inside the label fires
 * :hover on that first button too. (Same behavior is what makes
 * clicking a <label> focus its associated input — fine for single-
 * control rows, broken for picker rows.)
 *
 * Visually identical to row() — same .pf-field-row class, same
 * .pf-field-label span. Only the wrapper element changes.
 */
function groupRow(labelText, control) {
  return h('div', { class: 'pf-field-row', role: 'group', 'aria-label': labelText }, [
    h('span', { class: 'pf-field-label' }, [labelText]),
    control,
  ]);
}

// ---------------------------------------------------------------------
// Avatar upload control
// ---------------------------------------------------------------------

/**
 * Build the avatar upload UI — circular preview, Change/Remove buttons,
 * hidden file input, status/error line below.
 *
 * @param {{ initialUrl: string | null }} opts
 */
function createAvatarControl({ initialUrl }) {
  let currentUrl = initialUrl || null;

  const preview = h('div', {
    class: 'pf-avatar-preview',
    'aria-hidden': 'true',
  });

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    hidden: true,
    onChange: onFileChosen,
  });

  const changeBtn = h('button', {
    type: 'button',
    class: 'pf-avatar-btn',
    onClick: () => fileInput.click(),
  }, ['Change']);

  const removeBtn = h('button', {
    type: 'button',
    class: 'pf-avatar-btn pf-avatar-btn-secondary',
    onClick: clearAvatar,
  }, ['Remove']);

  const status = h('div', { class: 'pf-avatar-status', role: 'status', 'aria-live': 'polite' });

  const root = h('div', { class: 'pf-avatar-control' }, [
    preview,
    h('div', { class: 'pf-avatar-buttons' }, [changeBtn, removeBtn]),
    fileInput,
    status,
  ]);

  renderPreview();

  function renderPreview() {
    if (currentUrl) {
      preview.style.backgroundImage = `url("${escapeCssUrl(currentUrl)}")`;
      replaceContents(preview, []);
      preview.classList.remove('pf-avatar-preview-text');
      removeBtn.disabled = false;
      removeBtn.classList.remove('pf-avatar-btn-disabled');
    } else {
      preview.style.backgroundImage = '';
      preview.classList.add('pf-avatar-preview-text');
      const name = loadNameForMonogram();
      replaceContents(preview, [getInitialFromName(name)]);
      removeBtn.disabled = true;
      removeBtn.classList.add('pf-avatar-btn-disabled');
    }
  }

  function setStatus(message, kind) {
    // kind = 'info' | 'error' | ''
    status.className = 'pf-avatar-status' + (kind ? ` pf-avatar-status-${kind}` : '');
    status.textContent = message || '';
  }

  async function onFileChosen(ev) {
    const file = ev.target.files && ev.target.files[0];
    // Clear the input so re-selecting the same file re-fires change
    try { ev.target.value = ''; } catch {}

    if (!file) return;

    const check = checkImageFile(file);
    if (!check.ok) {
      setStatus(check.error, 'error');
      return;
    }

    setStatus('Processing…', 'info');
    setBusy(true);

    try {
      const dataUrl = await resizeImageToDataURL(file);
      currentUrl = dataUrl;
      updateField('profile.avatarUrl', dataUrl);
      renderPreview();
      setStatus('Avatar updated.', 'info');
      // Clear the status after a moment so it doesn't linger
      setTimeout(() => {
        if (status.textContent === 'Avatar updated.') setStatus('', '');
      }, 2500);
    } catch (err) {
      setStatus((err && err.message) || 'Failed to process image.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function clearAvatar() {
    if (!currentUrl) return;
    currentUrl = null;
    updateField('profile.avatarUrl', null);
    renderPreview();
    setStatus('Avatar removed.', 'info');
    setTimeout(() => {
      if (status.textContent === 'Avatar removed.') setStatus('', '');
    }, 2500);
  }

  function setBusy(busy) {
    changeBtn.disabled = busy;
    removeBtn.disabled = busy || !currentUrl;
    changeBtn.classList.toggle('pf-avatar-btn-disabled', busy);
    removeBtn.classList.toggle('pf-avatar-btn-disabled', busy || !currentUrl);
  }

  return root;
}

/**
 * For the monogram fallback: grab whatever display name / username is saved.
 * We re-read via loadSettings() (not reusing the prop passed to createDetailsBody)
 * so renaming inside the form updates the monogram on the next preview render.
 */
function loadNameForMonogram() {
  try {
    const settings = loadSettings();
    const p = (settings && settings.profile) || {};
    return p.displayName || p.username || '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------
// Theme color pickers — primary + secondary background gradient stops
// ---------------------------------------------------------------------

const THEME_DEFAULTS = {
  primary:   '#0d1117',
  secondary: '#161b22',
};

/**
 * Create the theme color picker row.
 * Two <input type="color"> pickers: Secondary (lighter) and Primary (darker).
 * Each unlocks at a different achievement threshold.
 * An Accent picker is already handled by the swatches above, so the
 * accent threshold from getThemeUnlocks() gates the swatches, not these.
 */
function createThemeColorRow(profile, unlockedIds) {
  const unlocks = getFlairUnlocks(unlockedIds);
  const tc = (profile && profile.themeColors) || {};

  function makeColorPicker(label, field, defaultColor, isUnlocked, unlockHint) {
    const wrapper = h('div', { class: 'pf-theme-picker' }, []);

    const colorInput = h('input', {
      type: 'color',
      class: 'pf-theme-color-input',
      value: tc[field] || defaultColor,
      disabled: !isUnlocked,
      title: isUnlocked
        ? `${label} — click to change`
        : `🔒 Unlock at ${unlockHint}`,
      onInput: (ev) => {
        updateField(`profile.themeColors.${field}`, ev.target.value);
        applyThemeColorsLive();
      },
    });

    const labelEl = h('span', {
      class: 'pf-theme-picker-label' + (isUnlocked ? '' : ' pf-theme-picker-locked'),
    }, [label]);

    const lockIcon = !isUnlocked
      ? h('span', { class: 'pf-theme-picker-lock' }, ['🔒'])
      : null;

    const resetBtn = isUnlocked
      ? h('button', {
          type: 'button',
          class: 'pf-theme-picker-reset',
          title: 'Reset to default',
          onClick: () => {
            colorInput.value = defaultColor;
            updateField(`profile.themeColors.${field}`, null);
            applyThemeColorsLive();
          },
        }, ['↺'])
      : null;

    wrapper.appendChild(colorInput);
    wrapper.appendChild(labelEl);
    if (lockIcon) wrapper.appendChild(lockIcon);
    if (resetBtn) wrapper.appendChild(resetBtn);
    return wrapper;
  }

  const container = h('div', { class: 'pf-theme-pickers' }, [
    makeColorPicker('Secondary', 'secondary', THEME_DEFAULTS.secondary, unlocks.silver, '8 achievements'),
    makeColorPicker('Primary',   'primary',   THEME_DEFAULTS.primary,   unlocks.deep,   '15 achievements'),
  ]);

  return groupRow('Theme', container);
}

/**
 * Apply theme colors to the page by setting CSS custom properties.
 * Called on change + at boot time from profile/index.js.
 */
function applyThemeColorsLive() {
  try {
    const settings = loadSettings();
    const tc = (settings && settings.profile && settings.profile.themeColors) || {};
    const primary   = tc.primary   || THEME_DEFAULTS.primary;
    const secondary = tc.secondary || THEME_DEFAULTS.secondary;
    // Derive a lighter shade for button gradients
    const secLight = lightenHex(secondary, 12);
    document.documentElement.style.setProperty('--pf-theme-primary', primary);
    document.documentElement.style.setProperty('--pf-theme-secondary', secondary);
    document.documentElement.style.setProperty('--pf-theme-secondary-light', secLight);
  } catch { /* non-fatal */ }
}

function lightenHex(hex, amount) {
  const h = (hex || '').replace('#', '');
  const r = Math.min(255, (parseInt(h.substring(0,2),16)||0) + amount);
  const g = Math.min(255, (parseInt(h.substring(2,4),16)||0) + amount);
  const b = Math.min(255, (parseInt(h.substring(4,6),16)||0) + amount);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

// Expose for boot-time call from profile/index.js (same IIFE scope)
// No window global needed — direct function reference in shared scope.
// The function is exported so the bundler includes it; callers in
// the same IIFE can reference it directly by name.
