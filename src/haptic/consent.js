// haptic/consent.js
//
// First-launch consent gate (§3) and AI instruction injection.
//
// When a character with haptics.enabled loads (especially from a
// share link), all tag dispatch is MUTED until the user explicitly
// enables haptics for that character. The consent dialog shows:
//   - Character name
//   - Pattern count + names
//   - Effective clamp values
//   - Buttons: Enable · Load Muted · Cancel
//
// AI instruction injection appends the haptic tag reference and
// available patterns to the system prompt when haptics are active.

import { h } from '../utils/dom.js';
import { normalizeHaptics, mergeClamps, defaultClamps } from './schema.js';
import { hasCharacterConsent, grantCharacterConsent, loadHapticSettings } from './settings.js';
import { setActiveCharacterHaptics, disableHapticProcessing } from './message_hook.js';
import { setCharacterConfig, setVoiceConfig } from './scheduler.js';
import { generatePatternInstructionSnippet } from './patterns.js';
import { generateCorrectionSnippet } from './hallucination.js';
import { createOverlay } from '../render/overlay.js';

/**
 * Check consent and activate haptics for a character.
 * Called when a thread loads or character switches.
 *
 * @param {Object} character - the character object from Dexie
 * @returns {Promise<boolean>} true if haptics were enabled
 */
export async function activateCharacterHaptics(character) {
  if (!character) return false;

  const haptics = normalizeHaptics(character.haptics);
  if (!haptics.enabled) {
    disableHapticProcessing();
    return false;
  }

  const characterId = character.id || character.name;

  // Check if user has already consented for this character
  const consented = await hasCharacterConsent(characterId);

  if (consented) {
    // Already consented — activate immediately
    setActiveCharacterHaptics(haptics);
    setCharacterConfig(haptics);
    if (character.voice) {
      setVoiceConfig(character.voice);
    }
    return true;
  }

  // Show consent gate
  return new Promise((resolve) => {
    showConsentDialog(character, haptics, async (choice) => {
      if (choice === 'enable') {
        await grantCharacterConsent(characterId);
        setActiveCharacterHaptics(haptics);
        setCharacterConfig(haptics);
        if (character.voice) {
          setVoiceConfig(character.voice);
        }
        resolve(true);
      } else {
        // 'muted' or 'cancel' — load without haptics
        disableHapticProcessing();
        resolve(false);
      }
    });
  });
}

/**
 * Show the consent dialog for a haptic-enabled character.
 */
function showConsentDialog(character, haptics, onChoice) {
  const patternNames = Object.keys(haptics.patterns || {});
  const clamps = mergeClamps(null, haptics.clampOverrides);

  const content = h('div', { class: 'pf-consent' }, [
    h('div', { class: 'pf-consent-header' }, [
      h('span', { class: 'pf-consent-icon' }, ['◈']),
      h('span', { class: 'pf-consent-title' }, ['Haptic Character']),
    ]),

    h('p', { class: 'pf-consent-name' }, [
      `"${character.name || 'This character'}" includes haptic feedback data.`,
    ]),

    patternNames.length > 0
      ? h('div', { class: 'pf-consent-patterns' }, [
          h('div', { class: 'pf-consent-label' }, [`${patternNames.length} named patterns:`]),
          h('div', { class: 'pf-consent-list' }, [patternNames.join(', ')]),
        ])
      : null,

    h('div', { class: 'pf-consent-clamps' }, [
      h('div', { class: 'pf-consent-label' }, ['Safety limits:']),
      h('div', { class: 'pf-consent-detail' }, [
        `Max intensity: ${Math.round(clamps.intensityCeiling * 100)}% · `,
        `Max duration: ${clamps.durationCeiling / 1000}s · `,
        `Max tags/msg: ${clamps.tagsPerMessageCap}`,
      ]),
    ]),

    character.voice && character.voice.enabled
      ? h('div', { class: 'pf-consent-voice' }, [
          `Voice: ${character.voice.preferredVoiceName || 'default'}, `,
          `rate ${character.voice.rate || 1.0}`,
        ])
      : null,

    h('div', { class: 'pf-consent-actions' }, [
      h('button', {
        type: 'button',
        class: 'pf-consent-btn pf-consent-btn-primary',
        onClick: () => { overlay.hide(); onChoice('enable'); },
      }, ['Enable for this character']),
      h('button', {
        type: 'button',
        class: 'pf-consent-btn',
        onClick: () => { overlay.hide(); onChoice('muted'); },
      }, ['Load muted']),
      h('button', {
        type: 'button',
        class: 'pf-consent-btn',
        onClick: () => { overlay.hide(); onChoice('cancel'); },
      }, ['Cancel']),
    ]),

    h('p', { class: 'pf-consent-note' }, [
      'You can change this later in Settings → Haptics.',
    ]),
  ].filter(Boolean));

  const overlay = createOverlay({
    ariaLabel: 'Haptic character consent',
    children: [content],
  });
  overlay.show();
}

// ---- AI Instruction Injection ----

/**
 * Build the haptic instruction snippet to inject into the AI's
 * system prompt. Called when composing the message context.
 *
 * @param {Object} characterHaptics - normalized haptics config
 * @param {Object} opts
 * @param {boolean} opts.includeCorrectionFeedback - include §3.5 correction
 * @returns {string|null} snippet to append, or null if haptics inactive
 */
export function buildHapticInstruction(characterHaptics, opts = {}) {
  if (!characterHaptics || !characterHaptics.enabled) return null;

  const parts = [];

  // Author's custom snippet takes priority
  if (characterHaptics.instructionSnippet) {
    parts.push(characterHaptics.instructionSnippet);
  } else {
    // Auto-generated snippet from pattern library
    const clamps = mergeClamps(null, characterHaptics.clampOverrides);
    const snippet = generatePatternInstructionSnippet(
      characterHaptics.patterns || {},
      clamps
    );
    if (snippet) parts.push(snippet);
  }

  // Self-correcting feedback (§3.5) — appended when 3+ unknowns
  if (opts.includeCorrectionFeedback) {
    const correction = generateCorrectionSnippet(characterHaptics.patterns);
    if (correction) parts.push(correction);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
