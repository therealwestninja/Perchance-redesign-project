// chat/ui_polish.js
//
// UI animation polish and mobile-responsive refinements.
// Injects a stylesheet with smooth transitions, subtle animations,
// and responsive breakpoints for mobile.
//
// This is a CSS-only module — no JavaScript behavior, just style
// injection at init time.
//
// Bootstrap: call initUiPolish() from start(). Idempotent.

export function initUiPolish() {
  if (initUiPolish._done) return;
  initUiPolish._done = true;

  const style = document.createElement('style');
  style.id = 'pf-ui-polish';
  style.textContent = `
    /* ---- Smooth transitions ---- */
    .message {
      animation: pf-fade-in 0.2s ease-out;
    }
    @keyframes pf-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Sidebar thread hover */
    #chatThreads .thread {
      transition: background-color 0.15s, opacity 0.15s;
    }

    /* Smooth scroll for chat messages */
    #chatMessagesEl {
      scroll-behavior: smooth;
    }

    /* Input focus glow */
    #messageInputEl:focus,
    .chat-input textarea:focus {
      box-shadow: 0 0 0 2px rgba(var(--pf-accent-rgb, 245, 166, 35), 0.2);
      transition: box-shadow 0.2s;
    }

    /* Button press feedback */
    .pf-msg-ctrl-btn:active,
    .pf-presets-btn:active,
    .pf-export-btn:active {
      transform: scale(0.92);
    }

    /* ---- Mobile refinements ---- */
    @media (max-width: 768px) {
      /* Larger touch targets */
      .pf-msg-ctrl-btn {
        padding: 6px 10px;
        font-size: 16px;
      }

      /* Stack header buttons */
      .chat-header-right {
        flex-wrap: wrap;
        gap: 2px;
      }

      /* Full-width search */
      .pf-chat-search-input {
        font-size: 16px; /* prevents iOS zoom */
      }

      /* Glossary modal full-width on mobile */
      .pf-glossary-modal {
        width: 95%;
        max-height: 90vh;
      }

      /* Presets dropdown wider */
      .pf-presets-dropdown {
        min-width: 250px;
        right: auto;
        left: 0;
      }

      /* Character grid 2 columns on mobile */
      .pf-char-grid {
        grid-template-columns: repeat(2, 1fr) !important;
      }

      /* Token display smaller */
      .pf-token-display {
        font-size: 10px;
        padding: 1px 4px;
      }

      /* Stop button full width */
      .pf-stop-gen-btn {
        width: 100%;
        margin: 4px 0;
      }

      /* Input area buttons wrap */
      .pf-impersonate-btn,
      .pf-enhance-btn,
      .pf-narrate-btn {
        font-size: 16px;
        padding: 6px;
      }
    }

    @media (max-width: 480px) {
      /* Even smaller screens */
      .pf-char-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 6px !important;
      }
      .pf-char-avatar {
        width: 48px !important;
        height: 48px !important;
      }
      .pf-char-name {
        font-size: 11px !important;
      }
    }
  `;
  document.head.appendChild(style);
}
