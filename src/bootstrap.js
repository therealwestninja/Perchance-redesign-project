// bootstrap.js
//
// Runs at the end of the bundle. We wait for two things before calling
// start():
//
//   1. The DOM to be at least parsed (readyState !== 'loading').
//   2. Upstream's Dexie instance (window.db) to be set up AND to have
//      the schema defined. Touching IndexedDB ourselves before upstream
//      finishes its version/upgrade dance causes Dexie to error on
//      subsequent transactions with "storeNames parameter was empty".
//
// Not imported by Node tests — only included in the Perchance bundle.

(function bootstrap() {
  const POLL_MS = 100;
  const TIMEOUT_MS = 30_000;
  const deadline = Date.now() + TIMEOUT_MS;

  function upstreamReady() {
    return typeof window !== 'undefined' &&
           window.db &&
           typeof window.db === 'object' &&
           window.db.characters &&
           typeof window.db.characters.toArray === 'function';
  }

  function tryStart() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryStart, { once: true });
      return;
    }
    if (!upstreamReady()) {
      if (Date.now() >= deadline) {
        console.warn('[pf] upstream DB never became ready; profile feature inactive');
        return;
      }
      setTimeout(tryStart, POLL_MS);
      return;
    }
    try { start(); }
    catch (e) { console.warn('[pf] start() failed:', e && e.message); }
  }

  tryStart();
})();
