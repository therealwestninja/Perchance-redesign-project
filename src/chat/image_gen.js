// chat/image_gen.js
//
// Per-message image generation. Adds a 🖼 button to AI messages
// (via the existing message_controls pattern). When clicked, uses
// aiTextPlugin to extract a visual prompt from the message text,
// then calls root.textToImagePlugin to generate an image.
//
// The generated image is appended after the message as a
// clickable thumbnail.
//
// Bootstrap: call initImageGen() from start(). Idempotent.

export function initImageGen() {
  if (initImageGen._done) return;

  if (!window.root || typeof window.root.textToImagePlugin !== 'function') return;
  if (!window.root || typeof window.root.aiTextPlugin !== 'function') return;

  initImageGen._done = true;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;

  // ---- Delegated click handler for image gen buttons ----
  chatEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('.pf-gen-img-btn');
    if (!btn || btn.disabled) return;

    const message = btn.closest('.message');
    if (!message) return;

    const text = (message.querySelector('.content') || {}).innerText || '';
    if (!text) return;

    btn.disabled = true;
    btn.textContent = '⏳';

    try {
      // Step 1: Extract a visual prompt from the message
      const promptResult = await window.root.aiTextPlugin({
        instruction: [
          'Extract a concise visual image prompt from this text.',
          'Describe what should be depicted: characters, scene, mood, lighting.',
          'Reply with ONLY the image prompt, nothing else. Keep it under 100 words.',
          '',
          'Text:',
          text.substring(0, 500),
        ].join('\n'),
        stopSequences: ['\n\n'],
      });

      const prompt = (promptResult && promptResult.text) ? promptResult.text.trim() : text.substring(0, 200);

      // Step 2: Generate the image
      const imgContainer = document.createElement('div');
      imgContainer.className = 'pf-gen-img-container';
      imgContainer.innerHTML = window.root.textToImagePlugin({
        prompt,
        negativePrompt: 'low quality, worst quality, blurry',
        resolution: '512x512',
        onFinish: function(result) {
          try {
            const dataUrl = result.canvas.toDataURL('image/jpeg');
            const iframe = imgContainer.querySelector('iframe');
            if (iframe) {
              iframe.outerHTML = `<img src="${dataUrl}" style="max-width:300px; max-height:300px; border-radius:8px; cursor:pointer;" onclick="window.open(this.src)">`;
            }
          } catch {}
        },
      });

      message.appendChild(imgContainer);
    } catch (err) {
      console.warn('[pf] image gen failed:', err && err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🖼';
    }
  });

  // ---- Inject image gen buttons via MutationObserver ----
  function addImgBtn(messageEl) {
    if (!messageEl || !messageEl.classList.contains('ai')) return;
    if (messageEl.querySelector('.pf-gen-img-btn')) return;
    if (messageEl.id.startsWith('typing-')) return;

    const controls = messageEl.querySelector('.pf-msg-ctrls');
    if (!controls) return;

    const btn = document.createElement('button');
    btn.className = 'pf-msg-ctrl-btn pf-gen-img-btn';
    btn.title = 'Generate image from this message';
    btn.textContent = '🖼';
    btn.type = 'button';
    controls.insertBefore(btn, controls.firstChild);
  }

  // Process existing + observe new
  chatEl.querySelectorAll('.message.ai').forEach(addImgBtn);

  const observer = new MutationObserver(() => {
    clearTimeout(addImgBtn._t);
    addImgBtn._t = setTimeout(() => {
      chatEl.querySelectorAll('.message.ai').forEach(addImgBtn);
    }, 200);
  });
  observer.observe(chatEl, { childList: true, subtree: false });
}
