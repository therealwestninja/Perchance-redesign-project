// render/chat_settings.js
//
// Unified Chat Settings panel — consolidates all chat customization
// into a single discoverable location. Opens from the ⚙ button in
// the haptic chip container (always visible in chat header).
//
// Sections:
//   Appearance  — theme, font family, font size, custom background
//   Display     — reasoning toggle, token display
//   AI          — generation model overrides
//   Haptics     — device, clamps, bridging
//   Narration   — TTS backend, voice, rate/pitch
//   Plugins     — registered backends, add URL/file
//
// Each section reads/writes the same settings paths as the scattered
// modules (font_settings.js, theme_toggle.js, etc.), so both the
// panel controls and the individual buttons stay in sync.

import { h } from '../utils/dom.js';
import { loadSettings, saveSettings } from '../profile/settings_store.js';
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

// ---- Font/theme constants (mirrored from font_settings.js/theme_toggle.js) ----

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Sans-serif', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monospace', value: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' },
  { label: 'Dyslexic-friendly', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

const FONT_SIZES = [
  { label: 'Small (13px)', value: '13px' },
  { label: 'Medium (15px)', value: '15px' },
  { label: 'Large (17px)', value: '17px' },
  { label: 'X-Large (20px)', value: '20px' },
];

// ---- Public API ----

/**
 * Create the full Chat Settings panel. Returns a DOM element.
 */
export async function createChatSettingsPanel() {
  const profileSettings = loadSettings();
  const hapticSettings = await loadHapticSettings();

  const panel = h('div', { class: 'pf-cs-panel' });

  panel.appendChild(h('div', { class: 'pf-cs-title' }, ['Chat Settings']));

  // Accordion sections
  const sections = [
    { id: 'appearance', label: '🎨 Appearance', builder: () => buildAppearanceSection(profileSettings) },
    { id: 'display', label: '👁 Display', builder: () => buildDisplaySection(profileSettings) },
    { id: 'haptics', label: '◈ Haptics', builder: () => buildHapticsSection(hapticSettings) },
    { id: 'narration', label: '🔊 Narration', builder: () => buildNarrationSection(hapticSettings) },
    { id: 'plugins', label: '🔌 Plugins', builder: () => buildPluginsSection() },
  ];

  for (const sec of sections) {
    panel.appendChild(buildAccordion(sec.id, sec.label, sec.builder));
  }

  return panel;
}

// ---- Accordion helper ----

function buildAccordion(id, label, contentBuilder) {
  const body = h('div', { class: 'pf-cs-accordion-body', hidden: true });
  let built = false;

  const header = h('button', {
    type: 'button',
    class: 'pf-cs-accordion-header',
    onClick: () => {
      const open = !body.hidden;
      body.hidden = open;
      chevron.textContent = open ? '▸' : '▾';
      if (!built && !open) {
        built = true;
        const content = contentBuilder();
        if (content instanceof Promise) {
          content.then(el => body.appendChild(el));
        } else {
          body.appendChild(content);
        }
      }
    },
  });

  const chevron = h('span', { class: 'pf-cs-chevron' }, ['▸']);
  header.appendChild(h('span', {}, [label]));
  header.appendChild(chevron);

  return h('div', { class: 'pf-cs-accordion', 'data-section': id }, [header, body]);
}

// ---- Helpers ----

function sRow(label, control) {
  return h('div', { class: 'pf-cs-row' }, [
    h('span', { class: 'pf-cs-label' }, [label]),
    control,
  ]);
}

function sSelect(options, currentValue, onChange) {
  return h('select', { class: 'pf-cs-select', onChange: (e) => onChange(e.target.value) },
    options.map(o => h('option', { value: o.value, selected: o.value === currentValue }, [o.label]))
  );
}

function sSlider(min, max, step, value, fmt, onChange) {
  const valLabel = h('span', { class: 'pf-cs-val' }, [fmt(value)]);
  const input = h('input', {
    type: 'range', min: String(min), max: String(max), step: String(step),
    value: String(value), class: 'pf-cs-slider',
    onInput: (e) => {
      const v = Number(e.target.value);
      valLabel.textContent = fmt(v);
      onChange(v);
    },
  });
  return h('div', { class: 'pf-cs-slider-row' }, [input, valLabel]);
}

function sToggle(label, checked, onChange) {
  const cb = h('input', {
    type: 'checkbox', checked: checked || false,
    onChange: (e) => onChange(e.target.checked),
  });
  return h('label', { class: 'pf-cs-toggle' }, [cb, h('span', {}, [label])]);
}

function saveProfileSetting(key, value) {
  const s = loadSettings();
  s[key] = value;
  saveSettings(s);
}

async function saveHapticSetting(key, value) {
  const s = await loadHapticSettings();
  s[key] = value;
  await saveHapticSettings(s);
}

async function saveHapticClamp(key, value) {
  const s = await loadHapticSettings();
  if (!s.clamps) s.clamps = defaultClamps();
  s.clamps[key] = value;
  await saveHapticSettings(s);
}

// ---- Appearance ----

function buildAppearanceSection(settings) {
  const container = h('div', { class: 'pf-cs-section' });

  // Theme
  const currentTheme = settings.themeMode || 'dark';
  container.appendChild(sRow('Theme', sSelect(
    [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }],
    currentTheme,
    (v) => {
      saveProfileSetting('themeMode', v);
      // Apply immediately — same path as theme_toggle.js
      document.documentElement.classList.toggle('pf-light-theme', v === 'light');
    }
  )));

  // Font family
  container.appendChild(sRow('Font', sSelect(
    FONT_FAMILIES, settings.fontFamily || '',
    (v) => {
      saveProfileSetting('fontFamily', v);
      if (v) document.documentElement.style.setProperty('--pf-chat-font', v);
      else document.documentElement.style.removeProperty('--pf-chat-font');
    }
  )));

  // Font size
  container.appendChild(sRow('Size', sSelect(
    FONT_SIZES, settings.fontSize || '',
    (v) => {
      saveProfileSetting('fontSize', v);
      if (v) document.documentElement.style.setProperty('--pf-chat-font-size', v);
      else document.documentElement.style.removeProperty('--pf-chat-font-size');
    }
  )));

  return container;
}

// ---- Display ----

function buildDisplaySection(settings) {
  const container = h('div', { class: 'pf-cs-section' });

  container.appendChild(sToggle('Show AI reasoning blocks', settings.showReasoning !== false, (v) => {
    saveProfileSetting('showReasoning', v);
    document.documentElement.classList.toggle('pf-hide-reasoning', !v);
  }));

  container.appendChild(sToggle('Show token count', settings.showTokenCount === true, (v) => {
    saveProfileSetting('showTokenCount', v);
  }));

  container.appendChild(sToggle('Show timestamps on messages', settings.showTimestamps === true, (v) => {
    saveProfileSetting('showTimestamps', v);
  }));

  return container;
}

// ---- Haptics ----

function buildHapticsSection(settings) {
  const container = h('div', { class: 'pf-cs-section' });

  // Backend selector
  const backends = listBackends();
  container.appendChild(sRow('Backend', sSelect(
    backends.map(b => ({ label: b.displayName, value: b.id })),
    settings.activeBackendId || 'buttplug',
    (v) => { setActiveBackend(v); saveHapticSetting('activeBackendId', v); }
  )));

  // Connect button
  const statusEl = h('span', { class: 'pf-cs-status' }, [isHapticReady() ? 'Connected' : 'Disconnected']);
  const connectBtn = h('button', {
    type: 'button', class: 'pf-cs-btn',
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
  container.appendChild(h('div', { class: 'pf-cs-row' }, [connectBtn, statusEl]));

  // Intensity
  container.appendChild(sRow('Intensity',
    sSlider(0, 150, 1, Math.round((settings.intensitySlider || 1) * 100),
      v => `${v}%`, v => saveHapticSetting('intensitySlider', v / 100))
  ));

  // Clamps
  const c = settings.clamps || defaultClamps();
  container.appendChild(sRow('Max intensity',
    sSlider(0, 100, 5, Math.round(c.intensityCeiling * 100),
      v => `${v}%`, v => saveHapticClamp('intensityCeiling', v / 100))
  ));
  container.appendChild(sRow('Max duration',
    sSlider(1, 60, 1, c.durationCeiling / 1000,
      v => `${v}s`, v => saveHapticClamp('durationCeiling', v * 1000))
  ));
  container.appendChild(sRow('Max tags/msg',
    sSlider(1, 20, 1, c.tagsPerMessageCap,
      v => String(v), v => saveHapticClamp('tagsPerMessageCap', v))
  ));

  // Bridging
  container.appendChild(sRow('Decay half-life',
    sSlider(0, 10000, 500, settings.decayHalfLife || 2000,
      v => v === 0 ? 'Off' : `${v/1000}s`, v => saveHapticSetting('decayHalfLife', v))
  ));
  container.appendChild(sRow('Tagless blocks', sSelect(
    [{ label: 'Silent', value: 'silent' }, { label: 'Baseline', value: 'baseline' }, { label: 'Ambient', value: 'ambient' }],
    settings.taglessBlockMode || 'silent',
    v => saveHapticSetting('taglessBlockMode', v)
  )));

  return container;
}

// ---- Narration ----

function buildNarrationSection(settings) {
  const container = h('div', { class: 'pf-cs-section' });

  const ttsBackends = listTtsBackends();
  const active = getActiveTtsBackend();
  container.appendChild(sRow('TTS backend', sSelect(
    ttsBackends.map(b => ({ label: b.displayName, value: b.id })),
    active ? active.id : 'web-speech',
    v => setActiveTtsBackend(v)
  )));

  const voices = listVoices();
  if (voices.length > 0) {
    container.appendChild(sRow('Default voice', sSelect(
      voices.map(v => ({
        label: `${v.name} (${v.lang})${v.offline ? ' ⚡' : ''}`,
        value: v.id || v.name,
      })),
      '', () => {} // voice selection is per-character in §8
    )));
  }

  container.appendChild(h('div', { class: 'pf-cs-hint' }, [
    'Voice is configured per-character. Set a default here for new characters.',
  ]));

  return container;
}

// ---- Plugins ----

function buildPluginsSection() {
  const container = h('div', { class: 'pf-cs-section' });

  // List
  const allBackends = [...listBackends(), ...listTtsBackends()];
  const seen = new Set();
  for (const b of allBackends) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    container.appendChild(h('div', { class: 'pf-cs-plugin' }, [
      h('span', {}, [b.displayName]),
      h('span', { class: 'pf-cs-plugin-dot' }, [b.connected ? '●' : '○']),
    ]));
  }

  // Add from URL
  const urlInput = h('input', { type: 'text', class: 'pf-cs-input', placeholder: 'Plugin URL (.js)' });
  const addBtn = h('button', { type: 'button', class: 'pf-cs-btn',
    onClick: async () => {
      const url = urlInput.value.trim();
      if (!url) return;
      addBtn.textContent = 'Loading…';
      addBtn.disabled = true;
      try {
        const r = await loadPluginFromUrl(url);
        urlInput.value = '';
        addBtn.textContent = `✓ ${r.id}`;
      } catch (e) { addBtn.textContent = `✗ ${e.message}`; }
      setTimeout(() => { addBtn.textContent = 'Add'; addBtn.disabled = false; }, 2500);
    },
  }, ['Add']);
  container.appendChild(h('div', { class: 'pf-cs-add-row' }, [urlInput, addBtn]));

  // Add from file
  const fileInput = h('input', { type: 'file', accept: '.js,.mjs', style: 'display:none',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const r = await loadPluginFromFile(file);
        fileBtn.textContent = `✓ ${r.id}`;
      } catch (err) { fileBtn.textContent = `✗ ${err.message}`; }
      setTimeout(() => { fileBtn.textContent = 'Load file'; }, 2500);
    },
  });
  const fileBtn = h('button', { type: 'button', class: 'pf-cs-btn',
    onClick: () => fileInput.click(),
  }, ['Load file']);
  container.appendChild(h('div', { class: 'pf-cs-add-row' }, [fileBtn, fileInput]));

  container.appendChild(h('div', { class: 'pf-cs-hint' }, [
    '⚠ Plugin code runs with full page access. Only add from trusted sources.',
  ]));

  return container;
}
