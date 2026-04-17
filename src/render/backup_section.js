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
import { clearCompletionHistory } from '../prompts/gc.js';

export function createBackupBody() {
  // Panels — each is hidden by default, revealed by its respective button
  const exportPanel = h('div', { class: 'pf-backup-panel', hidden: true });
  const importPanel = h('div', { class: 'pf-backup-panel', hidden: true });
  const clearPanel  = h('div', { class: 'pf-backup-panel', hidden: true });

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

  const clearBtn = h('button', {
    class: 'pf-backup-btn',
    type: 'button',
    onClick: () => toggleClear(),
  }, ['Clear history']);

  function hideAllPanels() {
    exportPanel.hidden = true;
    importPanel.hidden = true;
    clearPanel.hidden = true;
  }

  function toggleExport() {
    if (!exportPanel.hidden) { exportPanel.hidden = true; return; }
    hideAllPanels();
    renderExportPanel();
    exportPanel.hidden = false;
  }

  function toggleImport() {
    if (!importPanel.hidden) { importPanel.hidden = true; return; }
    hideAllPanels();
    renderImportPanel();
    importPanel.hidden = false;
  }

  function toggleClear() {
    if (!clearPanel.hidden) { clearPanel.hidden = true; return; }
    hideAllPanels();
    renderClearPanel();
    clearPanel.hidden = false;
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
        // Capture the overlay reference NOW rather than via
        // document.querySelector inside the setTimeout. See doClear
        // for the full rationale — same concern here.
        const overlay = importPanel.closest('.pf-overlay');
        setTimeout(() => {
          if (overlay && typeof overlay.hide === 'function' && overlay.parentNode) {
            overlay.hide();
          }
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

  function renderClearPanel() {
    const status = h('span', { class: 'pf-backup-status' });
    const confirmRow = h('div', { class: 'pf-backup-confirm-row', hidden: true });

    const clearActionBtn = h('button', {
      class: 'pf-backup-action',
      type: 'button',
      onClick: () => {
        replaceContents(confirmRow, [
          h('span', { class: 'pf-backup-confirm-text' }, [
            'This clears your Prompt Archive but preserves your lifetime completion counts. Continue?',
          ]),
          h('button', {
            class: 'pf-backup-action pf-backup-action-danger',
            type: 'button',
            onClick: () => doClear(),
          }, ['Yes, clear history']),
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
    }, ['Clear past weeks']);

    function doClear() {
      const result = clearCompletionHistory();
      confirmRow.hidden = true;
      if (result.droppedWeeks === 0) {
        showStatus(status, 'Nothing to clear — no past history yet.', 'warn');
        return;
      }
      showStatus(
        status,
        `Cleared ${result.droppedWeeks} past ${result.droppedWeeks === 1 ? 'week' : 'weeks'}. Reloading…`,
        'ok'
      );
      // Capture the overlay reference NOW rather than via document.
      // querySelector inside the setTimeout. If the user dismisses
      // manually and reopens before 800ms elapses, we'd otherwise
      // close their fresh overlay. closest() walks up from clearPanel
      // which is inside this very overlay.
      const overlay = clearPanel.closest('.pf-overlay');
      setTimeout(() => {
        if (overlay && typeof overlay.hide === 'function' && overlay.parentNode) {
          overlay.hide();
        }
      }, 800);
    }

    replaceContents(clearPanel, [
      h('p', { class: 'pf-backup-hint' }, [
        'Clear the Prompt Archive\u2019s history of past weeks. Your current week stays intact, and your ',
        h('em', {}, ['lifetime']),
        ' completion counts are preserved so achievements don\u2019t regress. Useful if you want a fresh-looking archive without losing earned progress.',
      ]),
      h('div', { class: 'pf-backup-actionbar' }, [clearActionBtn, status]),
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
    h('div', { class: 'pf-backup-buttonrow' }, [exportBtn, importBtn, clearBtn]),
    exportPanel,
    importPanel,
    clearPanel,
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
