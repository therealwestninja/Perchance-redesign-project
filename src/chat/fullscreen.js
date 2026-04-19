// chat/fullscreen.js
//
// Fullscreen mode toggle. Adds a button that uses the Fullscreen
// API to go fullscreen on the chat container, providing a
// distraction-free experience.
//
// Adapted from URV-AI's toggleAppFullscreen concept (MIT).
//
// Bootstrap: call initFullscreen() from start(). Idempotent.

export function initFullscreen() {
  if (initFullscreen._done) return;
  if (!document.documentElement.requestFullscreen &&
      !document.documentElement.webkitRequestFullscreen) return;
  initFullscreen._done = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-export-btn'; // reuse small header button style
  btn.textContent = '⛶';
  btn.title = 'Toggle fullscreen';

  btn.addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
  });

  // Update icon on fullscreen change
  const updateIcon = () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.textContent = isFs ? '⛶' : '⛶';
    btn.title = isFs ? 'Exit fullscreen' : 'Toggle fullscreen';
  };
  document.addEventListener('fullscreenchange', updateIcon);
  document.addEventListener('webkitfullscreenchange', updateIcon);

  const header = document.querySelector('.chat-header-right') ||
                 document.querySelector('.chat-header');
  if (header) header.appendChild(btn);
}
