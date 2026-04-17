// utils/dom.js
//
// Safe DOM construction helper. Builds elements via createElement + textContent,
// never innerHTML, so user-supplied strings cannot inject HTML.
//
// Usage:
//   h('div', { class: 'card', onClick: () => ... }, [
//     h('img', { src: avatarUrl, alt: '' }),
//     h('span', { class: 'name' }, [displayName]),   // text node from string
//   ])

/**
 * Create an element with attributes and children.
 *
 * Attributes:
 *   - `class` / `className` → element className
 *   - `style` with object value → Object.assign onto el.style
 *   - keys starting with `on` + value is function → addEventListener
 *   - other keys → setAttribute (booleans set empty attribute or omit)
 *
 * Children can be:
 *   - null / false / undefined → skipped
 *   - string / number → appended as text node (SAFE — not innerHTML)
 *   - Element → appended as-is
 *   - Array → flattened and handled recursively
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === false) continue;

    if (key === 'class' || key === 'className') {
      el.className = String(val);
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(val));
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(el, c);
    return;
  }
  if (typeof children === 'string' || typeof children === 'number') {
    el.appendChild(document.createTextNode(String(children)));
    return;
  }
  if (children instanceof Node) {
    el.appendChild(children);
    return;
  }
  // unknown — ignore rather than throw; profile must be robust
}

/**
 * Replace contents of an element. Uses replaceChildren if available,
 * falls back to manual remove + append.
 */
export function replaceContents(el, newChildren) {
  if (!el) return;
  if (el.replaceChildren) {
    el.replaceChildren();
  } else {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
  appendChildren(el, newChildren);
}

/**
 * Escape a string for use inside a CSS `url("...")` expression.
 * Escapes backslashes and double quotes per CSS string-token rules.
 * Anything non-string becomes an empty string — callers don't need to
 * check for null themselves.
 *
 * Example:
 *   el.style.backgroundImage = `url("${escapeCssUrl(avatarDataUrl)}")`;
 */
export function escapeCssUrl(url) {
  return String(url || '').replace(/["\\]/g, '\\$&');
}
