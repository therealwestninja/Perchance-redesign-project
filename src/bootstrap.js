// bootstrap.js
//
// Runs at the end of the bundle. Kicks off the profile feature.
// Not imported by Node tests — only included in the Perchance bundle,
// via its position as the last entry in src/manifest.json.

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { start(); }, { once: true });
} else {
  start();
}
