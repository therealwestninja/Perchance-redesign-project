// chat/voice.js
//
// Voice input (speech-to-text) and voice output (text-to-speech)
// for the chat. Adds a microphone button for dictation and a
// speaker toggle for reading AI responses aloud.
//
// Uses the Web Speech API — no external services or API keys.
// Falls back gracefully (buttons hidden) on browsers that don't
// support it.
//
// Adapted from Kustom-GPT's voice I/O pattern (MIT).
//
// Bootstrap: call initVoice() from start(). Idempotent.

/**
 * Initialize voice features. Adds mic + speaker buttons near
 * the chat input. Idempotent.
 */
export function initVoice() {
  if (initVoice._done) return;
  initVoice._done = true;

  const hasSpeechRecognition = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const hasSpeechSynthesis = typeof window !== 'undefined' &&
    'speechSynthesis' in window;

  if (!hasSpeechRecognition && !hasSpeechSynthesis) return;

  // Find input area to inject buttons
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (!inputArea) return;
  const parent = inputArea.parentElement || inputArea;

  // ---- Voice INPUT (speech-to-text) ----
  if (hasSpeechRecognition) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;

    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'pf-voice-btn pf-mic-btn';
    micBtn.textContent = '🎤';
    micBtn.title = 'Voice input (dictation)';

    micBtn.addEventListener('click', () => {
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });

    function startListening() {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        // Find the chat textarea and append the transcript
        const textarea = document.querySelector('#inputEl') ||
                         document.querySelector('textarea') ||
                         document.querySelector('[contenteditable]');
        if (textarea) {
          if (textarea.value !== undefined) {
            textarea.value += transcript;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            textarea.textContent += transcript;
            try { bumpCounter("voiceInputs"); } catch {}
          }
        }
      };

      recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove('pf-listening');
        micBtn.textContent = '🎤';
      };

      recognition.onerror = () => {
        isListening = false;
        micBtn.classList.remove('pf-listening');
        micBtn.textContent = '🎤';
      };

      try {
        recognition.start();
        isListening = true;
        micBtn.classList.add('pf-listening');
        micBtn.textContent = '⏹';
      } catch { /* already started or blocked */ }
    }

    function stopListening() {
      if (recognition) {
        try { recognition.stop(); } catch { /* non-fatal */ }
      }
      isListening = false;
      micBtn.classList.remove('pf-listening');
      micBtn.textContent = '🎤';
    }

    parent.appendChild(micBtn);
  }

  // ---- Voice OUTPUT (text-to-speech) ----
  if (hasSpeechSynthesis) {
    let voiceEnabled = false;

    const speakerBtn = document.createElement('button');
    speakerBtn.type = 'button';
    speakerBtn.className = 'pf-voice-btn pf-speaker-btn';
    speakerBtn.textContent = '🔇';
    speakerBtn.title = 'Toggle voice output';

    speakerBtn.addEventListener('click', () => {
      voiceEnabled = !voiceEnabled;
      speakerBtn.textContent = voiceEnabled ? '🔊' : '🔇';
      speakerBtn.title = voiceEnabled
        ? 'Voice output ON (click to mute)'
        : 'Toggle voice output';
      if (!voiceEnabled) {
        window.speechSynthesis.cancel();
      }
    });

    parent.appendChild(speakerBtn);

    // Watch for new AI messages and read them aloud
    const chatEl = document.getElementById('chatMessagesEl');
    if (chatEl) {
      const observer = new MutationObserver((mutations) => {
        if (!voiceEnabled) return;
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (!node.classList.contains('message')) continue;
            if (!node.classList.contains('ai')) continue;
            if (node.id.startsWith('typing-')) continue;
            // Debounce — wait for streaming to finish
            clearTimeout(speakMsg._timer);
            speakMsg._timer = setTimeout(() => speakMessage(node), 1000);
          }
        }
      });
      observer.observe(chatEl, { childList: true, subtree: false });
    }

    function speakMessage(msgEl) {
      if (!voiceEnabled) return;
      const content = msgEl.querySelector('.content');
      if (!content) return;

      // Strip code blocks, markdown formatting, HTML tags
      let text = (content.innerText || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '')
        .replace(/\*\*[^*]+\*\*/g, (m) => m.replace(/\*\*/g, ''))
        .replace(/\*[^*]+\*/g, (m) => m.replace(/\*/g, ''))
        .replace(/[#_>`]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (!text) return;

      // Truncate very long messages
      if (text.length > 1000) text = text.substring(0, 1000) + '...';

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  }
}
