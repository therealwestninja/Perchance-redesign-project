// memory/spinoff_character.js
//
// Drop a Memory or Lore bubble onto the Create Character zone in the
// Memory window's right column → spin off a new character whose seed
// lore is the bubble's entries. The bubble itself is unchanged in the
// source thread (this is a copy-out, not a move-out).
//
// Flow:
//   1. We open OUR own minimal confirmation dialog: name + preview.
//      User edits the name (default = bubble's auto/custom label) and
//      reviews what'll be created.
//   2. On confirm: create a character row in db.characters, then add
//      one db.lore row per bubble entry, scoped to a synthetic lore
//      book attached to the new character via loreBookUrls.
//
// Why our own dialog and not Perchance's `characterDetailsPrompt`:
//   characterDetailsPrompt is defined inside Perchance's IIFE closure
//   and isn't reachable from our iframe context. We could programmati-
//   cally click the #newCharacterButton DOM element to open the form,
//   but that would lose our pre-filled content (the form opens blank).
//   So we ship a focused minimal dialog that does exactly what this
//   feature needs, and leave a TODO marker for future integration if
//   the upstream API gets exposed.
//
// Lore-book scoping note:
//   Perchance's lore is per-thread (each thread has loreBookId =
//   thread.id). Characters have a loreBookUrls array for "shareable"
//   lore books referenced by URL. We use a synthetic URL of the form
//   `pf-spawned:<characterId>` which serves as the bookId for our
//   seeded lore items. When the user creates a new thread with this
//   character, we'd want that thread's loreBookId to also reference
//   our entries — that integration is a follow-up.

import { h } from '../utils/dom.js';
import { createOverlay } from '../render/overlay.js';

/**
 * Open the spin-off confirmation dialog. On confirm, creates the
 * character and lore items via window.db (Perchance's Dexie instance).
 *
 * @param {{
 *   sourceLabel: string,
 *   entries: Array<{ id: string|number, text: string, embedding?: any }>,
 *   onCreated?: (result: { character: object, loreCount: number }) => void,
 *   onCancel?: () => void,
 * }} opts
 */
export function openSpinOffDialog({ sourceLabel, entries, onCreated, onCancel } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    if (typeof onCancel === 'function') onCancel();
    return;
  }

  // Default name: the bubble's auto-derived label, lightly cleaned.
  const defaultName = (sourceLabel || '').replace(/^[\s•·:]+|[\s•·:]+$/g, '').trim() || 'New Character';

  const nameInput = h('input', {
    type: 'text',
    class: 'pf-spinoff-name',
    value: defaultName,
    placeholder: 'Character name',
    'aria-label': 'New character name',
    spellcheck: 'true',
  });

  // Read-only preview of what we'll create. Each entry shown as a
  // bullet so the user can see what's about to land in lore.
  const previewList = h('ul', { class: 'pf-spinoff-preview' });
  const maxPreview = 8;
  const shown = entries.slice(0, maxPreview);
  for (const e of shown) {
    const txt = (e && e.text) ? String(e.text) : '';
    const truncated = txt.length > 200 ? txt.slice(0, 200) + '…' : txt;
    previewList.appendChild(h('li', {}, [truncated]));
  }
  if (entries.length > maxPreview) {
    previewList.appendChild(h('li', { class: 'pf-spinoff-more' }, [
      `…and ${entries.length - maxPreview} more`,
    ]));
  }

  const errEl = h('div', { class: 'pf-spinoff-err', hidden: true });

  let busy = false;
  const cancelBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-neutral',
    onClick: () => {
      if (busy) return;
      overlay.hide();
      if (typeof onCancel === 'function') onCancel();
    },
  }, ['Cancel']);

  const createBtn = h('button', {
    type: 'button',
    class: 'pf-mem-btn pf-mem-btn-primary',
    onClick: async () => {
      if (busy) return;
      const name = nameInput.value.trim();
      if (!name) {
        errEl.textContent = 'Please enter a character name.';
        errEl.hidden = false;
        nameInput.focus();
        return;
      }
      errEl.hidden = true;
      busy = true;
      createBtn.disabled = true;
      cancelBtn.disabled = true;
      createBtn.textContent = 'Creating…';
      try {
        const result = await createCharacterWithLore({
          name,
          sourceLabel: sourceLabel || '',
          entries,
        });
        overlay.hide();
        if (typeof onCreated === 'function') onCreated(result);
      } catch (err) {
        errEl.textContent = `Could not create character: ${(err && err.message) || String(err)}`;
        errEl.hidden = false;
        busy = false;
        createBtn.disabled = false;
        cancelBtn.disabled = false;
        createBtn.textContent = 'Create Character';
      }
    },
  }, ['Create Character']);

  const wrapper = h('div', { class: 'pf-spinoff-dialog' }, [
    h('h2', { class: 'pf-spinoff-title' }, ['Spin off as new character']),
    h('p', { class: 'pf-spinoff-blurb' }, [
      `Creates a new character seeded with ${entries.length} ` +
      (entries.length === 1 ? 'memory' : 'memories') +
      ' as starter lore. Source thread is unchanged.',
    ]),
    h('label', { class: 'pf-spinoff-label' }, [
      'Character name',
      nameInput,
    ]),
    h('div', { class: 'pf-spinoff-preview-wrap' }, [
      h('div', { class: 'pf-spinoff-preview-label' }, ['Lore preview:']),
      previewList,
    ]),
    h('p', { class: 'pf-spinoff-tip' }, [
      'After creation, find your new character in the upstream character ' +
      'list. You can edit details, add an avatar, and tune lore there.',
    ]),
    errEl,
    h('div', { class: 'pf-spinoff-actions' }, [cancelBtn, createBtn]),
  ]);

  const overlay = createOverlay({
    ariaLabel: 'Create character from bubble',
    children: [wrapper],
  });
  overlay.show();
  // Focus name input after a tick so the overlay's own focus management
  // doesn't steal it.
  setTimeout(() => nameInput.select(), 0);
}

/**
 * Create the character row + lore rows. Returns { character, loreCount }.
 *
 * Throws if window.db isn't available or the writes fail.
 */
async function createCharacterWithLore({ name, sourceLabel, entries }) {
  const db = (typeof window !== 'undefined') ? window.db : null;
  if (!db || !db.characters || !db.lore) {
    throw new Error('Perchance database not available');
  }

  // Build a description that hints at the seed-from-bubble origin.
  // Kept short — the character form will let the user edit/expand it.
  // First line is a one-liner, second is a faded source note.
  const description = [
    `${name} — spun off from a memory bubble.`,
    sourceLabel ? `Seeded from: ${sourceLabel}` : '',
  ].filter(Boolean).join('\n');

  // Build the character object with the minimum-viable shape that
  // upstream expects. These defaults MIRROR upstream's
  // `upgradeCharacterFromOldVersion` function (search that name in
  // vendor/perchance_2.txt) which sets defaults for fields that
  // characters are loaded without. That migration runs on LOAD, not
  // on add, so we have to populate these fields at creation time —
  // otherwise UI code like `renderCharacterList` that reads the raw
  // row breaks on undefined fields (e.g. `c.folderPath.startsWith`).
  //
  // The set of fields here should be kept in sync with upstream as
  // their schema evolves. If upstream adds a new field, load it once,
  // then re-save — the migration will fill in our character too.
  const characterObj = {
    name,
    description,
    avatar: { url: '', size: 1, shape: 'square' },
    // Upstream migration deletes avatarUrl after constructing `avatar`
    // from it, so we don't pass avatarUrl here.
    scene: { background: {}, music: {} },
    streamingResponse: true,
    roleInstruction: '',
    folderPath: '',
    uuid: null,
    customData: {},
    userCharacter: {},
    systemCharacter: { avatar: {} },
    loreBookUrls: [],
    autoGenerateMemories: 'none',
    maxTokensPerMessage: null,
    customCode: '',
    initialMessagesText: '',
    reminderMessage: '',
    lastMessageTime: Date.now(),
    creationTime: Date.now(),
    // Mark our origin so future versions of the tool can find what
    // we created (for stats, gamification, or future cleanup).
    pfSpawnedFrom: {
      sourceLabel: sourceLabel || '',
      entryCount: entries.length,
      createdAt: new Date().toISOString(),
    },
  };

  // Insert character. Dexie returns the new id.
  const newId = await db.characters.add(characterObj);
  characterObj.id = newId;

  // Synthetic lore-book identifier that links the new character to its
  // seeded lore. Stored as a URL-shaped string in loreBookUrls so the
  // upstream loader recognizes it as a known shape, but the value is
  // ours (`pf-spawned:<id>`) so we can find it later.
  const loreBookId = `pf-spawned:${newId}`;

  // Patch the character with the new loreBookUrls now that we have id.
  await db.characters.update(newId, { loreBookUrls: [loreBookId] });

  // Add each entry as a lore row in the synthetic book. Triggers left
  // empty — user can tune in the upstream lore editor. Embeddings
  // preserved if present so retrieval can use them right away.
  let loreCount = 0;
  for (const entry of entries) {
    if (!entry || !entry.text) continue;
    try {
      await db.lore.add({
        bookId: loreBookId,
        bookUrl: loreBookId,
        text: String(entry.text),
        triggers: [],
        embeddings: entry.embedding ? { default: entry.embedding } : {},
      });
      loreCount++;
    } catch (e) {
      // Per-entry failure shouldn't block the whole spin-off. Log and
      // continue. The character still gets created with whatever lore
      // landed successfully.
      console.warn('[pf] lore add failed during spin-off:', e && e.message);
    }
  }

  return { character: characterObj, loreCount };
}

/**
 * Heal any previously-spun-off characters that were created before we
 * populated the full field set. Walks db.characters, finds rows with
 * pfSpawnedFrom but missing required fields, and backfills the
 * defaults upstream's migration would normally provide.
 *
 * Safe to call on every window open — idempotent.
 */
export async function backfillSpawnedCharacterFields() {
  const db = (typeof window !== 'undefined') ? window.db : null;
  if (!db || !db.characters) return;
  try {
    const all = await db.characters.toArray();
    for (const c of all) {
      if (!c || !c.pfSpawnedFrom) continue;
      const patch = {};
      if (c.folderPath === undefined)           patch.folderPath = '';
      if (c.uuid === undefined)                 patch.uuid = null;
      if (c.customData === undefined)           patch.customData = {};
      if (c.userCharacter === undefined)        patch.userCharacter = {};
      if (c.systemCharacter === undefined)      patch.systemCharacter = { avatar: {} };
      if (c.scene === undefined)                patch.scene = { background: {}, music: {} };
      if (c.streamingResponse === undefined)    patch.streamingResponse = true;
      if (c.roleInstruction === undefined)      patch.roleInstruction = '';
      if (c.autoGenerateMemories === undefined) patch.autoGenerateMemories = 'none';
      if (c.maxTokensPerMessage === undefined)  patch.maxTokensPerMessage = null;
      if (c.customCode === undefined)           patch.customCode = '';
      if (c.initialMessagesText === undefined)  patch.initialMessagesText = '';
      if (c.reminderMessage === undefined)      patch.reminderMessage = '';
      if (c.creationTime === undefined)         patch.creationTime = c.lastMessageTime || Date.now();
      if (c.avatar === undefined)               patch.avatar = { url: '', size: 1, shape: 'square' };
      if (c.loreBookUrls === undefined)         patch.loreBookUrls = [];
      if (Object.keys(patch).length > 0) {
        try {
          await db.characters.update(c.id, patch);
        } catch (e) {
          console.warn('[pf] character backfill failed for id', c.id, ':', e && e.message);
        }
      }
    }
  } catch (e) {
    console.warn('[pf] backfillSpawnedCharacterFields failed:', e && e.message);
  }
}
