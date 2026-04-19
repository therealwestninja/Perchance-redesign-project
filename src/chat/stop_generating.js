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

    // ---- Dynamic glossary injection (Batch 2) ----
    // If the call has a systemMessage (the main generation call),
    // append the glossary block to it. buildGlossaryBlock() returns
    // empty string if no glossary exists or no keywords match — so
    // this is a no-op for users who haven't set up a glossary.
    if (firstArg && typeof firstArg === 'object') {
      try {
        const glossaryBlock = buildGlossaryBlock();
        if (glossaryBlock) {
          // Clone the args to avoid mutating the caller's object
          args[0] = { ...firstArg };
          const existing = args[0].systemMessage || args[0].instruction || '';
          if (args[0].systemMessage != null) {
            args[0].systemMessage = existing + glossaryBlock;
          } else if (args[0].instruction != null) {
            args[0].instruction = existing + glossaryBlock;
          }
        }
      } catch { /* non-fatal — generation proceeds without glossary */ }
    }

    // ---- Auto-summary injection (Batch 2) ----
    // Inject conversation summary for older messages if available.
    // buildSummaryBlock() is in the same IIFE scope (auto_summary.js).
    if (firstArg && typeof firstArg === 'object') {
      try {
        const summaryBlock = buildSummaryBlock();
        if (summaryBlock) {
          if (args[0] === firstArg) args[0] = { ...firstArg };
          const existing = args[0].systemMessage || args[0].instruction || '';
          if (args[0].systemMessage != null) {
            args[0].systemMessage = existing + summaryBlock;
          } else if (args[0].instruction != null) {
            args[0].instruction = existing + summaryBlock;
          }
        }
      } catch { /* non-fatal */ }
    }

    // ---- Document context injection (Batch 6) ----
    // Inject uploaded document content if present.
    // buildDocumentBlock() is in the same IIFE scope (doc_analysis.js).
    if (firstArg && typeof firstArg === 'object') {
      try {
        const docBlock = buildDocumentBlock();
        if (docBlock) {
          if (args[0] === firstArg) args[0] = { ...firstArg };
          const existing = args[0].systemMessage || args[0].instruction || '';
          if (args[0].systemMessage != null) {
            args[0].systemMessage = existing + docBlock;
          } else if (args[0].instruction != null) {
            args[0].instruction = existing + docBlock;
          }
        }
      } catch { /* non-fatal */ }
    }

    // ---- Anti-repetition injection (Batch 8) ----
    // Inject word banlists + auto-detected repetitions.
    // buildAntiRepetitionBlock() is in the same IIFE scope.
    if (firstArg && typeof firstArg === 'object') {
      try {
        const antiRepBlock = buildAntiRepetitionBlock();
        if (antiRepBlock) {
          if (args[0] === firstArg) args[0] = { ...firstArg };
          const existing = args[0].systemMessage || args[0].instruction || '';
          if (args[0].systemMessage != null) {
            args[0].systemMessage = existing + antiRepBlock;
          } else if (args[0].instruction != null) {
            args[0].instruction = existing + antiRepBlock;
          }
        }
      } catch { /* non-fatal */ }
    }

    // ---- User persona injection (Batch 9) ----
    // Inject the user's character info so the AI knows who it's talking to.
    // buildPersonaBlock() is in the same IIFE scope (user_persona.js).
    if (firstArg && typeof firstArg === 'object') {
      try {
        const personaBlock = buildPersonaBlock();
        if (personaBlock) {
          if (args[0] === firstArg) args[0] = { ...firstArg };
          const existing = args[0].systemMessage || args[0].instruction || '';
          if (args[0].systemMessage != null) {
            args[0].systemMessage = existing + personaBlock;
          } else if (args[0].instruction != null) {
            args[0].instruction = existing + personaBlock;
          }
        }
      } catch { /* non-fatal */ }
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
