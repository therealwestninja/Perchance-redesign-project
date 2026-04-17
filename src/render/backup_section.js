// render/backup_section.js
//
// Body of the "Backup" section: Export and Import affordances for the
// user's profile settings. Each button reveals its own textarea inline;
// nothing is modal. No destructive action without explicit confirmation.

import { h, replaceContents } from '../utils/dom.js';
import {
  exportSettingsAsJson,
  importSettingsFromJson,
  copyToClipboard,
} from '../profile/backup.js';

export function createBackupBody() {
  // Panels — each is hidden by default, revealed by its respective button
  const exportPanel = h('div', { class: 'pf-backup-panel', hidden: true });
  const importPanel = h('div', { class: 'pf-backup-panel', hidden: true });

  const exportBtn = h('button', {
    class: 'pf-backup-btn',
    type: 'button',
    onClick: () => toggleExport(),
  }, ['Export']);

  const importBtn = h('button', {
    class: 'pf-backup-btn',
    type: 'button',
    onClick: () => toggleImport(),
  }, ['Import']);

  function toggleExport() {
    if (!exportPanel.hidden) { exportPanel.hidden = true; return; }
    importPanel.hidden = true;
    renderExportPanel();
    exportPanel.hidden = false;
  }

  function toggleImport() {
    if (!importPanel.hidden) { importPanel.hidden = true; return; }
    exportPanel.hidden = true;
    renderImportPanel();
    importPanel.hidden = false;
  }

  function renderExportPanel() {
    const json = exportSettingsAsJson();

    const textarea = h('textarea', {
      class: 'pf-backup-textarea',
      readonly: true,
      rows: 10,
      spellcheck: 'false',
      'aria-label': 'Profile backup as JSON',
    });
    textarea.value = json;

    const status = h('span', { class: 'pf-backup-status' });

    const copyBtn = h('button', {
      class: 'pf-backup-action',
      type: 'button',
      onClick: async () => {
        const ok = await copyToClipboard(json);
        if (ok) {
          showStatus(status, 'Copied to clipboard ✓', 'ok');
        } else {
          showStatus(status, 'Clipboard blocked — select all and copy manually (⌘/Ctrl+C)', 'warn');
          textarea.focus();
          textarea.select();
        }
      },
    }, ['Copy']);

    replaceContents(exportPanel, [
      h('p', { class: 'pf-backup-hint' }, [
        'Your full profile as JSON — avatar, bio, section states, prompt completions, everything. Save this text somewhere safe.',
      ]),
      textarea,
      h('div', { class: 'pf-backup-actionbar' }, [copyBtn, status]),
    ]);
  }

  function renderImportPanel() {
    const textarea = h('textarea', {
      class: 'pf-backup-textarea',
      rows: 10,
      spellcheck: 'false',
      placeholder: 'Paste your exported backup JSON here…',
      'aria-label': 'Paste backup JSON to restore',
    });

    const status = h('span', { class: 'pf-backup-status' });
    const confirmRow = h('div', { class: 'pf-backup-confirm-row', hidden: true });

    const applyBtn = h('button', {
      class: 'pf-backup-action',
      type: 'button',
      onClick: () => {
        const text = textarea.value;
        if (!text.trim()) {
          showStatus(status, 'Paste your backup JSON first.', 'warn');
          return;
        }
        // Show confirm row — two-step so accidental click doesn't nuke data
        replaceContents(confirmRow, [
          h('span', { class: 'pf-backup-confirm-text' }, [
            'This will overwrite your current profile data. Continue?',
          ]),
          h('button', {
            class: 'pf-backup-action pf-backup-action-danger',
            type: 'button',
            onClick: () => doApply(text),
          }, ['Yes, replace']),
          h('button', {
            class: 'pf-backup-action',
            type: 'button',
            onClick: () => {
              confirmRow.hidden = true;
              clearStatus(status);
            },
          }, ['Cancel']),
        ]);
        confirmRow.hidden = false;
      },
    }, ['Restore from backup']);

    function doApply(text) {
      const result = importSettingsFromJson(text);
      confirmRow.hidden = true;
      if (result.success) {
        showStatus(
          status,
          'Restored. Reloading profile…',
          'ok'
        );
        // Close the overlay so the next open picks up fresh settings.
        // A full page reload is overkill; settings change events will
        // propagate on the next open of the profile.
        setTimeout(() => {
          const overlay = document.querySelector('.pf-overlay');
          if (overlay && typeof overlay.hide === 'function') overlay.hide();
        }, 800);
      } else {
        showStatus(status, result.error || 'Could not restore backup.', 'err');
      }
    }

    replaceContents(importPanel, [
      h('p', { class: 'pf-backup-hint' }, [
        'Paste a previously exported backup to restore. This will overwrite your current profile.',
      ]),
      textarea,
      h('div', { class: 'pf-backup-actionbar' }, [applyBtn, status]),
      confirmRow,
    ]);
  }

  return h('div', { class: 'pf-backup' }, [
    h('p', { class: 'pf-backup-intro' }, [
      'Save a portable copy of your profile as JSON, or restore from one. ',
      h('span', { class: 'pf-backup-intro-soft' }, [
        'Useful if your browser clears storage, you switch devices, or you just want a safety net.',
      ]),
    ]),
    h('div', { class: 'pf-backup-buttonrow' }, [exportBtn, importBtn]),
    exportPanel,
    importPanel,
  ]);
}

/** Transient status with color-coded variant, auto-clears after 4s for success/warn. */
function showStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'pf-backup-status pf-backup-status-' + (kind || 'info');
  if (kind !== 'err') {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => clearStatus(el), 4000);
  }
}

function clearStatus(el) {
  el.textContent = '';
  el.className = 'pf-backup-status';
}
