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
