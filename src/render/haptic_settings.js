// render/haptic_settings.js
//
// Unified Chat Settings panel — consolidates scattered tool settings
// into a single discoverable panel with organized sections.
//
// Sections:
//   Appearance — font family/size, theme mode, custom background
//   Generation — temperature, max tokens
//   Haptics    — device, safety clamps, bridging
//   Narration  — TTS backend, voice picker, rate/pitch
//   Plugins    — registered backends, add URL/file
//
// Opened via the ⚙ gear button in the haptic chip container (chat header).

import { h } from '../utils/dom.js';
import {
  loadHapticSettings,
  saveHapticSettings,
} from '../haptic/settings.js';
import {
  listBackends,
  setActiveBackend,
  connectActiveBackend,
  disconnectActiveBackend,
  isHapticReady,
  listDevices,
} from '../haptic/backend.js';
import {
  listTtsBackends,
  setActiveTtsBackend,
  getActiveTtsBackend,
  listVoices,
} from '../haptic/tts.js';
import { loadPluginFromUrl, loadPluginFromFile } from '../haptic/plugin_loader.js';
import { defaultClamps } from '../haptic/schema.js';
import { loadSettings, updateField } from '../profile/settings_store.js';

/**
 * Create the unified chat settings panel.
 */
export async function createHapticSettingsPanel() {
  const hapticSettings = await loadHapticSettings();
  const profileSettings = loadSettings();

  const panel = h('div', { class: 'pf-haptic-settings' });

  // Header
  panel.appendChild(h('div', { class: 'pf-hs-header' }, [
    h('span', { class: 'pf-hs-header-icon' }, ['⚙']),
    h('span', { class: 'pf-hs-header-title' }, ['Chat Settings']),
  ]));

  // Sections
  panel.appendChild(buildAppearanceSection(profileSettings));
  panel.appendChild(buildGenerationSection(profileSettings));
  panel.appendChild(buildDeviceSection(hapticSettings));
  panel.appendChild(buildClampsSection(hapticSettings));
  panel.appendChild(buildBridgingSection(hapticSettings));
  panel.appendChild(buildNarrationSection(hapticSettings));
  panel.appendChild(buildPluginsSection(hapticSettings));

  return panel;
}

// ---- Helpers ----

function settingsRow(label, control) {
  return h('div', { class: 'pf-hs-row' }, [
    h('span', { class: 'pf-hs-label' }, [label]),
    control,
  ]);
}

function sectionHeader(text, icon) {
  return h('div', { class: 'pf-hs-section-header' }, [
    icon ? h('span', { style: 'margin-right:4px' }, [icon]) : null,
    text,
  ].filter(Boolean));
}

async function saveHSetting(key, value) {
  const s = await loadHapticSettings();
  s[key] = value;
  await saveHapticSettings(s);
}

async function saveClamp(key, value) {
  const s = await loadHapticSettings();
  if (!s.clamps) s.clamps = defaultClamps();
  s.clamps[key] = value;
  await saveHapticSettings(s);
}

// ---- Appearance section ----

function buildAppearanceSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Appearance', '🎨'));

  // Font family
  const FONTS = [
    { value: '', label: 'Default' },
    { value: 'Georgia, serif', label: 'Georgia' },
    { value: "'Times New Roman', serif", label: 'Times New Roman' },
    { value: 'system-ui, sans-serif', label: 'System UI' },
    { value: "'Segoe UI', sans-serif", label: 'Segoe UI' },
    { value: 'ui-monospace, monospace', label: 'Monospace' },
    { value: "'Comic Sans MS', cursive", label: 'Comic Sans' },
  ];
  const currentFont = (settings && settings.fontFamily) || '';
  const fontSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => {
      updateField('fontFamily', e.target.value);
      document.documentElement.style.setProperty('--chat-font-family', e.target.value || 'inherit');
    },
  }, FONTS.map(f => h('option', {
    value: f.value,
    selected: f.value === currentFont,
    style: f.value ? `font-family:${f.value}` : '',
  }, [f.label])));
  container.appendChild(settingsRow('Font', fontSelect));

  // Font size
  const currentSize = (settings && settings.fontSize) || '';
  const SIZES = [
    { value: '', label: 'Default' },
    { value: '13px', label: 'Small' },
    { value: '15px', label: 'Medium' },
    { value: '17px', label: 'Large' },
    { value: '19px', label: 'X-Large' },
  ];
  const sizeSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => {
      updateField('fontSize', e.target.value);
      document.documentElement.style.setProperty('--chat-font-size', e.target.value || 'inherit');
    },
  }, SIZES.map(s => h('option', { value: s.value, selected: s.value === currentSize }, [s.label])));
  container.appendChild(settingsRow('Size', sizeSelect));

  // Theme mode
  const currentTheme = (settings && settings.themeMode) || 'dark';
  const themeSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => {
      updateField('themeMode', e.target.value);
      document.documentElement.classList.toggle('pf-light-theme', e.target.value === 'light');
    },
  }, [
    h('option', { value: 'dark', selected: currentTheme === 'dark' }, ['Dark']),
    h('option', { value: 'light', selected: currentTheme === 'light' }, ['Light']),
  ]);
  container.appendChild(settingsRow('Theme', themeSelect));

  // Timestamps toggle
  const showTimestamps = !!(settings && settings.showTimestamps);
  const tsToggle = h('input', {
    type: 'checkbox',
    checked: showTimestamps,
    onChange: (e) => updateField('showTimestamps', e.target.checked),
  });
  container.appendChild(settingsRow('Timestamps', tsToggle));

  // Reasoning toggle
  const showReasoning = !!(settings && settings.showReasoning);
  const rToggle = h('input', {
    type: 'checkbox',
    checked: showReasoning,
    onChange: (e) => updateField('showReasoning', e.target.checked),
  });
  container.appendChild(settingsRow('Show AI reasoning', rToggle));

  return container;
}

// ---- Generation section ----

function buildGenerationSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('AI Generation', '🤖'));

  // Temperature
  const temp = (settings && settings.genTemperature != null) ? settings.genTemperature : 0.9;
  const tempLabel = h('span', { class: 'pf-hs-val' }, [temp.toFixed(1)]);
  container.appendChild(settingsRow('Temperature', h('div', { class: 'pf-hs-slider-row' }, [
    h('input', {
      type: 'range', min: '1', max: '20', step: '1', value: String(Math.round(temp * 10)),
      class: 'pf-hs-slider',
      onInput: (e) => {
        const v = Number(e.target.value) / 10;
        tempLabel.textContent = v.toFixed(1);
        updateField('genTemperature', v);
      },
    }),
    tempLabel,
  ])));

  // Max tokens
  const maxTok = (settings && settings.genMaxTokens) || 800;
  const tokLabel = h('span', { class: 'pf-hs-val' }, [String(maxTok)]);
  container.appendChild(settingsRow('Max tokens', h('div', { class: 'pf-hs-slider-row' }, [
    h('input', {
      type: 'range', min: '100', max: '2000', step: '100', value: String(maxTok),
      class: 'pf-hs-slider',
      onInput: (e) => {
        const v = Number(e.target.value);
        tokLabel.textContent = String(v);
        updateField('genMaxTokens', v);
      },
    }),
    tokLabel,
  ])));

  container.appendChild(h('div', { class: 'pf-hs-hint' }, [
    'Higher temperature = more creative. Lower = more focused.',
  ]));

  return container;
}

// ---- Device section ----

function buildDeviceSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Haptic Device', '◈'));

  const backends = listBackends();
  const backendSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => {
      setActiveBackend(e.target.value);
      saveHSetting('activeBackendId', e.target.value);
    },
  }, backends.map(b => h('option', {
    value: b.id, selected: b.id === settings.activeBackendId,
  }, [b.displayName])));
  container.appendChild(settingsRow('Backend', backendSelect));

  const statusEl = h('span', { class: 'pf-hs-status' }, [
    isHapticReady() ? 'Connected' : 'Disconnected',
  ]);
  const connectBtn = h('button', {
    type: 'button', class: 'pf-hs-btn',
    onClick: async () => {
      if (isHapticReady()) {
        await disconnectActiveBackend();
        connectBtn.textContent = 'Connect';
        statusEl.textContent = 'Disconnected';
      } else {
        connectBtn.textContent = 'Connecting…';
        connectBtn.disabled = true;
        const ok = await connectActiveBackend();
        connectBtn.disabled = false;
        if (ok) {
          connectBtn.textContent = 'Disconnect';
          const devs = listDevices();
          statusEl.textContent = devs.length > 0 ? devs[0].name : 'Connected';
        } else {
          connectBtn.textContent = 'Connect';
          statusEl.textContent = 'Failed';
        }
      }
    },
  }, [isHapticReady() ? 'Disconnect' : 'Connect']);
  container.appendChild(h('div', { class: 'pf-hs-row' }, [connectBtn, statusEl]));

  const sliderVal = Math.round((settings.intensitySlider || 1.0) * 100);
  const sliderLabel = h('span', { class: 'pf-hs-val' }, [`${sliderVal}%`]);
  container.appendChild(settingsRow('Intensity', h('div', { class: 'pf-hs-slider-row' }, [
    h('input', {
      type: 'range', min: '0', max: '150', value: String(sliderVal), class: 'pf-hs-slider',
      onInput: (e) => {
        const v = Number(e.target.value);
        sliderLabel.textContent = `${v}%`;
        saveHSetting('intensitySlider', v / 100);
      },
    }),
    sliderLabel,
  ])));

  return container;
}

// ---- Clamps section ----

function buildClampsSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Safety Limits', '🛡'));

  const c = settings.clamps || defaultClamps();
  const fields = [
    { key: 'intensityCeiling', label: 'Max intensity', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v*100)}%` },
    { key: 'durationCeiling', label: 'Max duration', min: 1000, max: 60000, step: 1000, fmt: v => `${v/1000}s` },
    { key: 'tagsPerMessageCap', label: 'Max tags/msg', min: 1, max: 20, step: 1, fmt: v => String(v) },
    { key: 'minTagGap', label: 'Min tag gap', min: 0, max: 2000, step: 100, fmt: v => v ? `${v}ms` : 'Off' },
    { key: 'blockCooldown', label: 'Block cooldown', min: 0, max: 5000, step: 500, fmt: v => v ? `${v}ms` : 'Off' },
  ];
  for (const f of fields) {
    const valLabel = h('span', { class: 'pf-hs-val' }, [f.fmt(c[f.key])]);
    container.appendChild(settingsRow(f.label, h('div', { class: 'pf-hs-slider-row' }, [
      h('input', {
        type: 'range', min: String(f.min), max: String(f.max), step: String(f.step),
        value: String(c[f.key]), class: 'pf-hs-slider',
        onInput: (e) => { const v = Number(e.target.value); valLabel.textContent = f.fmt(v); saveClamp(f.key, v); },
      }),
      valLabel,
    ])));
  }
  return container;
}

// ---- Bridging section ----

function buildBridgingSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Haptic Bridging', '〰'));

  const hl = settings.decayHalfLife || 2000;
  const hlLabel = h('span', { class: 'pf-hs-val' }, [hl === 0 ? 'Off' : `${hl/1000}s`]);
  container.appendChild(settingsRow('Decay half-life', h('div', { class: 'pf-hs-slider-row' }, [
    h('input', {
      type: 'range', min: '0', max: '10000', step: '500', value: String(hl), class: 'pf-hs-slider',
      onInput: (e) => { const v = Number(e.target.value); hlLabel.textContent = v === 0 ? 'Off' : `${v/1000}s`; saveHSetting('decayHalfLife', v); },
    }),
    hlLabel,
  ])));

  const modeSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => saveHSetting('taglessBlockMode', e.target.value),
  }, [
    h('option', { value: 'silent', selected: settings.taglessBlockMode === 'silent' }, ['Silent']),
    h('option', { value: 'baseline', selected: settings.taglessBlockMode === 'baseline' }, ['Baseline']),
    h('option', { value: 'ambient', selected: settings.taglessBlockMode === 'ambient' }, ['Ambient pattern']),
  ]);
  container.appendChild(settingsRow('Tagless blocks', modeSelect));

  const bi = settings.baselineIntensity || 0.15;
  const biLabel = h('span', { class: 'pf-hs-val' }, [`${Math.round(bi*100)}%`]);
  container.appendChild(settingsRow('Baseline floor', h('div', { class: 'pf-hs-slider-row' }, [
    h('input', {
      type: 'range', min: '0', max: '30', step: '1', value: String(Math.round(bi*100)), class: 'pf-hs-slider',
      onInput: (e) => { const v = Number(e.target.value)/100; biLabel.textContent = `${Math.round(v*100)}%`; saveHSetting('baselineIntensity', v); },
    }),
    biLabel,
  ])));

  return container;
}

// ---- Narration section ----

function buildNarrationSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Narration (TTS)', '🔊'));

  const ttsBackends = listTtsBackends();
  const active = getActiveTtsBackend();
  const ttsSelect = h('select', {
    class: 'pf-hs-select',
    onChange: (e) => setActiveTtsBackend(e.target.value),
  }, ttsBackends.map(b => h('option', {
    value: b.id, selected: active && b.id === active.id,
  }, [b.displayName])));
  container.appendChild(settingsRow('Backend', ttsSelect));

  const voices = listVoices();
  if (voices.length > 0) {
    const voiceSelect = h('select', { class: 'pf-hs-select' },
      voices.map(v => h('option', { value: v.id || v.name }, [
        `${v.name} (${v.lang})${v.offline ? ' ⚡' : ''}`,
      ]))
    );
    container.appendChild(settingsRow('Default voice', voiceSelect));
  }

  container.appendChild(h('div', { class: 'pf-hs-hint' }, [
    'Enable narration per-character in their Voice settings.',
  ]));
  return container;
}

// ---- Plugins section ----

function buildPluginsSection(settings) {
  const container = h('div', { class: 'pf-hs-section' });
  container.appendChild(sectionHeader('Plugins', '🔌'));

  const allBackends = [...listBackends(), ...listTtsBackends()];
  const seen = new Set();
  for (const b of allBackends) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    container.appendChild(h('div', { class: 'pf-hs-plugin-row' }, [
      h('span', { class: 'pf-hs-plugin-name' }, [b.displayName]),
      h('span', { class: 'pf-hs-plugin-status' }, [b.connected ? '● Connected' : '○']),
    ]));
  }

  const urlInput = h('input', { type: 'text', class: 'pf-hs-input', placeholder: 'Plugin URL (.js)' });
  const addBtn = h('button', {
    type: 'button', class: 'pf-hs-btn',
    onClick: async () => {
      if (!urlInput.value.trim()) return;
      addBtn.textContent = 'Loading…'; addBtn.disabled = true;
      try {
        const r = await loadPluginFromUrl(urlInput.value.trim());
        urlInput.value = ''; addBtn.textContent = `✓ ${r.id}`;
      } catch (e) { addBtn.textContent = `✗ ${e.message}`; }
      setTimeout(() => { addBtn.textContent = 'Add'; addBtn.disabled = false; }, 2500);
    },
  }, ['Add']);
  container.appendChild(h('div', { class: 'pf-hs-add-row' }, [urlInput, addBtn]));

  const fileInput = h('input', { type: 'file', accept: '.js,.mjs', style: 'display:none',
    onChange: async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try { const r = await loadPluginFromFile(file); fileBtn.textContent = `✓ ${r.id}`; }
      catch (err) { fileBtn.textContent = `✗ ${err.message}`; }
      setTimeout(() => { fileBtn.textContent = 'Load file'; }, 2500);
    },
  });
  const fileBtn = h('button', { type: 'button', class: 'pf-hs-btn', onClick: () => fileInput.click() }, ['Load file']);
  container.appendChild(h('div', { class: 'pf-hs-add-row' }, [fileBtn, fileInput]));

  container.appendChild(h('div', { class: 'pf-hs-hint' }, [
    '⚠ Plugin code runs with full page access. Only add from trusted sources.',
  ]));
  return container;
}
