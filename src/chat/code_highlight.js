// chat/code_highlight.js
//
// Adds syntax highlighting to code blocks in AI responses. The
// upstream renders code as <pre data-markdown-codeblock="lang">
// with escaped text. This module finds those blocks, tokenizes
// the content with regex, and wraps tokens in colored spans.
//
// Highlighting algorithm adapted from Kustom-GPT (MIT). No
// external library needed — pure regex tokenization covers
// keywords, strings, comments, numbers, and function names.
//
// Bootstrap: call initCodeHighlight() from start(). Idempotent.

const JS_KEYWORDS = [
  'const','let','var','function','return','if','else','for','while',
  'class','import','export','from','async','await','try','catch',
  'throw','new','this','true','false','null','undefined','switch',
  'case','break','continue','default','typeof','instanceof','void',
  'delete','in','of','do','yield','static','extends','super',
];

const PY_KEYWORDS = [
  'def','class','return','if','elif','else','for','while','import',
  'from','as','try','except','finally','raise','with','yield',
  'lambda','pass','break','continue','and','or','not','is','in',
  'True','False','None','self','print','async','await','global',
  'nonlocal','assert','del',
];

/**
 * Apply syntax highlighting to a code block element.
 * Reads innerText, tokenizes, replaces innerHTML.
 */
function highlightBlock(preEl) {
  if (preEl.dataset.pfHighlighted) return;
  preEl.dataset.pfHighlighted = 'true';

  const lang = (preEl.dataset.markdownCodeblock || '').toLowerCase();
  const isPython = lang === 'python' || lang === 'py';
  const keywords = isPython ? PY_KEYWORDS : JS_KEYWORDS;

  let code = preEl.textContent || '';

  // Escape HTML entities
  code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Order matters: strings first (so keywords inside strings aren't highlighted)
  // 1. Strings (single, double, backtick)
  code = code.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
    '<span class="pf-tok-str">$1</span>'
  );

  // 2. Comments (single-line // and #, multi-line /* */)
  code = code.replace(
    /(\/\/.*$)/gm,
    '<span class="pf-tok-cmt">$1</span>'
  );
  code = code.replace(
    /(#.*$)/gm,
    '<span class="pf-tok-cmt">$1</span>'
  );
  code = code.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    '<span class="pf-tok-cmt">$1</span>'
  );

  // 3. Keywords
  for (const kw of keywords) {
    code = code.replace(
      new RegExp(`\\b(${kw})\\b`, 'g'),
      '<span class="pf-tok-kw">$1</span>'
    );
  }

  // 4. Numbers
  code = code.replace(
    /\b(\d+\.?\d*)\b/g,
    '<span class="pf-tok-num">$1</span>'
  );

  // 5. Function calls (word followed by parenthesis)
  code = code.replace(
    /\b([a-zA-Z_]\w*)\s*(?=\()/g,
    '<span class="pf-tok-fn">$1</span>'
  );

  preEl.innerHTML = code;
}

/**
 * Initialize code highlighting. Watches for new code blocks and
 * highlights them. Idempotent.
 */
export function initCodeHighlight() {
  if (initCodeHighlight._done) return;

  const chatEl = document.getElementById('chatMessagesEl');
  if (!chatEl) return;
  initCodeHighlight._done = true;

  // Highlight all existing code blocks
  function highlightAll() {
    const blocks = chatEl.querySelectorAll('pre[data-markdown-codeblock]');
    for (const block of blocks) {
      highlightBlock(block);
    }
  }

  highlightAll();

  // Watch for new messages / streaming updates
  const observer = new MutationObserver(() => {
    // Debounce to avoid thrashing during streaming
    clearTimeout(highlightAll._timer);
    highlightAll._timer = setTimeout(highlightAll, 500);
  });
  observer.observe(chatEl, { childList: true, subtree: true });
}
