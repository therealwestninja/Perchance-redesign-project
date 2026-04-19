// chat/dom_utils.js
//
// Common DOM lookup utilities for chat modules. Extracts the
// repeated querySelector patterns that appear 100+ times across
// the codebase into single-call helpers.
//
// These are lazy — they query the DOM each time, so they work
// even if the DOM isn't ready at module load time.

/**
 * Find the chat input area's parent container.
 * This is where tool buttons are typically appended.
 */
export function getChatInputParent() {
  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  return inputArea ? (inputArea.parentElement || inputArea) : null;
}

/**
 * Find the chat header (right side preferred).
 * This is where header buttons are typically appended.
 */
export function getChatHeader() {
  return document.querySelector('.chat-header-right') ||
         document.querySelector('.chat-header') ||
         null;
}

/**
 * Find the chat messages container.
 */
export function getChatMessages() {
  return document.getElementById('chatMessagesEl') || null;
}

/**
 * Find the chat text input element.
 */
export function getChatInput() {
  return document.querySelector('#messageInputEl') ||
         document.querySelector('.chat-input textarea') ||
         document.querySelector('textarea[placeholder]') ||
         null;
}
