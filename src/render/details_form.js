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

export function createDetailsBody({ profile = {} }) {
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

  // ---- title override ----
  const titleInput = h('input', {
    class: 'pf-field-input',
    type: 'text',
    maxlength: '40',
    placeholder: 'Leave blank for auto (rarest achievement)',
    onBlur: (ev) => updateField('profile.titleOverride', ev.target.value.trim()),
  });
  titleInput.value = String(profile.titleOverride || '');

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
    row('Title',        titleInput),
    row('Age range',    ageSelect),
    row('Gender',       h('div', { class: 'pf-field-stack' }, [
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
