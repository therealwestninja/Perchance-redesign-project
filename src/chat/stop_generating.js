// chat/stop_generating.js
//
// Adds a "Stop generating" button that appears while the AI is
// producing a response. Monkey-patches window.root.aiTextPlugin
// to capture the returned stream object, then calls .stop() on
// it when the user clicks the button.
//
// Why monkey-patch: the upstream stores streamObj as a local variable
// inside its generation function — we can't reach it otherwise.
// The patch is minimal: wrap the original function, intercept the
// return value, expose the .stop() handle. The original function
// runs unmodified.
//
// Adapted from Kustom-GPT's stopGenerating pattern, applied to
// Perchance's aiTextPlugin API instead of a custom LLM client.
//
// Bootstrap: call initStopGenerating() from start().

/**
 * Initialize the stop-generating feature. Monkey-patches
 * window.root.aiTextPlugin and injects a stop button into the
 * chat interface. Idempotent.
 */
export function initStopGenerating() {
  if (initStopGenerating._done) return;

  // Require window.root.aiTextPlugin to exist before patching
  if (typeof window === 'undefined' || !window.root ||
      typeof window.root.aiTextPlugin !== 'function') {
    return;
  }

  initStopGenerating._done = true;

  // ---- State ----
  let activeStreamObj = null;
  let isGenerating = false;

  // ---- Stop button ----
  // Injected next to the chat input. Hidden by default, shown
  // during generation.
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'pf-stop-gen-btn';
  stopBtn.textContent = '⬛ Stop';
  stopBtn.title = 'Stop generating';
  stopBtn.hidden = true;
  stopBtn.addEventListener('click', () => {
    if (activeStreamObj && typeof activeStreamObj.stop === 'function') {
      try { activeStreamObj.stop(); } catch { /* non-fatal */ }
    }
    activeStreamObj = null;
    hideStop();
  });

  // Find a place to inject the button. Try the chat input area
  // (typically has a send button we can sit next to).
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    // Append to the input area's parent so it sits alongside
    const parent = inputArea.parentElement || inputArea;
    parent.appendChild(stopBtn);
  } else {
    // Fallback: append to body — it'll still work, just floats
    document.body.appendChild(stopBtn);
  }

  function showStop() {
    isGenerating = true;
    stopBtn.hidden = false;
  }
  function hideStop() {
    isGenerating = false;
    stopBtn.hidden = true;
  }

  // ---- Monkey-patch aiTextPlugin ----
  // Wrap the original function. When called, capture the returned
  // promise/streamObj. The streamObj has a .stop() method. When
  // the promise resolves or rejects, clear the active handle.
  const original = window.root.aiTextPlugin;

  window.root.aiTextPlugin = function patchedAiTextPlugin(...args) {
    // Pass-through calls that aren't actual generation requests
    // (e.g. {getMetaObject:true} returns metadata, not a stream)
    const firstArg = args[0];
    if (firstArg && firstArg.getMetaObject) {
      return original.apply(this, args);
    }

    // ---- Context injection (all sources) ----
    // Each source returns a string block to append, or empty string.
    // All use the same injection pattern: append to systemMessage or
    // instruction. Refactored from 5 copy-pasted blocks into a loop.
    const injectionSources = [
      { name: 'glossary',       fn: typeof buildGlossaryBlock === 'function' ? buildGlossaryBlock : null },
      { name: 'summary',        fn: typeof buildSummaryBlock === 'function' ? buildSummaryBlock : null },
      { name: 'document',       fn: typeof buildDocumentBlock === 'function' ? buildDocumentBlock : null },
      { name: 'anti-repetition',fn: typeof buildAntiRepetitionBlock === 'function' ? buildAntiRepetitionBlock : null },
      { name: 'persona',        fn: typeof buildPersonaBlock === 'function' ? buildPersonaBlock : null },
      { name: 'reminder',       fn: typeof buildReminderBlock === 'function' ? buildReminderBlock : null },
    ];

    if (firstArg && typeof firstArg === 'object') {
      for (const source of injectionSources) {
        if (!source.fn) continue;
        try {
          const block = source.fn();
          if (!block) continue;
          // Clone args on first mutation to avoid mutating the caller's object
          if (args[0] === firstArg) args[0] = { ...firstArg };
          const target = args[0].systemMessage != null ? 'systemMessage' : 'instruction';
          if (args[0][target] != null) {
            args[0][target] = (args[0][target] || '') + block;
          }
        } catch { /* non-fatal — generation proceeds without this source */ }
      }
    }

    // ---- Generation settings overrides (Batch 6) ----
    // Apply user's temperature / maxTokens preferences if set.
    // getGenOverrides() is in the same IIFE scope (gen_settings.js).
    if (firstArg && typeof firstArg === 'object') {
      try {
        const overrides = getGenOverrides();
        if (overrides.temperature != null || overrides.maxTokens != null) {
          if (args[0] === firstArg) args[0] = { ...firstArg };
          if (overrides.temperature != null) args[0].temperature = overrides.temperature;
          if (overrides.maxTokens != null) args[0].maxTokensPerMessage = overrides.maxTokens;
        }
      } catch { /* non-fatal */ }
    }

    const result = original.apply(this, args);

    // result is a promise-like with a .stop() method (streamObj)
    if (result && typeof result.then === 'function') {
      activeStreamObj = result;
      showStop();

      // Clean up when generation completes (resolve or reject)
      const cleanup = () => {
        if (activeStreamObj === result) {
          activeStreamObj = null;
          hideStop();
        }
      };
      result.then(cleanup, cleanup);
    }

    return result;
  };

  // Copy any static properties from the original (some plugins
  // attach metadata to the function object itself)
  try {
    for (const key of Object.keys(original)) {
      window.root.aiTextPlugin[key] = original[key];
    }
  } catch { /* defensive */ }
}
