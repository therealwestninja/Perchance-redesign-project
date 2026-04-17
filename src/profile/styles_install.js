// profile/styles_install.js
//
// Installs the project stylesheet exactly once. Idempotent.

import { CSS } from '../render/styles.js';

const STYLE_ID = 'pf-styles';

export function injectStylesheet() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
