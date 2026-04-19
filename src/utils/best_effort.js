// utils/best_effort.js
//
// Shared pattern for "this operation should never crash the app,
// but I'd like to know if it fails." Wraps a callable in a try/
// catch and, on failure, emits a console.debug entry so developers
// with DevTools open see what went wrong. Returns undefined on
// failure. Fully inline-replaceable with the existing
// `try { ... } catch { /* non-fatal */ }` pattern.
//
// Why a helper, and why debug-level:
//
//   - The existing 28+ inline catches do the right thing for the
//     user (swallow the error), but silence means a developer
//     auditing storage-quota failures or quirky browser behavior
//     has to add ad-hoc console.logs to figure out what's going
//     on. A consistent debug-level log means those diagnostics are
//     always available; users don't see anything in the normal
//     console view (warn+ filter) but devs can opt in.
//
//   - Debug-level, not warn/error, because these operations ARE
//     expected to sometimes fail (localStorage quota, third-party
//     blockers, element.select() on non-text inputs) and a noisier
//     level would train developers to tune the logs out.
//
// Adoption is incremental — existing inline catches are safe and
// don't need to migrate unless someone is touching the file for
// another reason. New code SHOULD prefer this helper.
//
// Usage:
//
//   import { bestEffort } from '../utils/best_effort.js';
//
//   bestEffort(() => bumpCounter('shareCardOpens'), 'shareCardOpens');
//
//   // with a return value
//   const settings = bestEffort(() => loadSettings(), 'loadSettings');

/**
 * Invoke `fn` and swallow any thrown error. If an error is
 * thrown, logs it at console.debug level with the provided `tag`
 * so developers can diagnose failures without users seeing them.
 *
 * @param {() => T} fn         the operation to attempt
 * @param {string} [tag]       short human-readable label for the log
 * @returns {T | undefined}    return value of fn, or undefined on throw
 * @template T
 */
export function bestEffort(fn, tag) {
  try {
    return fn();
  } catch (e) {
    try {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug(`[pf:best-effort] ${tag || 'operation'} failed:`, e);
      }
    } catch {
      // console.debug itself could (very rarely) throw in exotic
      // sandboxed environments. Don't let the logger undermine
      // the swallow-and-continue guarantee.
    }
    return undefined;
  }
}

/**
 * Async variant. Awaits the promise `fn` returns and swallows any
 * rejection. Same logging behavior as bestEffort. Useful for
 * fire-and-forget promise chains where you don't care about the
 * result but want failures visible in the debug log.
 *
 * @param {() => Promise<T>} fn
 * @param {string} [tag]
 * @returns {Promise<T | undefined>}
 * @template T
 */
export async function bestEffortAsync(fn, tag) {
  try {
    return await fn();
  } catch (e) {
    try {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug(`[pf:best-effort-async] ${tag || 'operation'} failed:`, e);
      }
    } catch { /* see bestEffort */ }
    return undefined;
  }
}
