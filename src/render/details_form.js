// render/details_form.js
//
// The "Details" section body: username, age range, gender square,
// optional free-text self-description. All fields are optional and
// auto-save on blur.

import { h } from '../utils/dom.js';
import { updateField, AGE_RANGE_OPTIONS } from '../profile/settings_store.js';
import { createGenderSquare } from './gender_square.js';

export function createDetailsBody({ profile = {} }) {
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
    row('Display name', displayNameInput),
    row('Username',     usernameInput),
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
