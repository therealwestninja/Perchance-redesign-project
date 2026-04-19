// chat/gen_settings.js
//
// Advanced generation settings: temperature and max tokens per
// message. These are injected into every aiTextPlugin call via
// the existing monkey-patch (stop_generating.js).
//
// Adds a ⚙ button near the input that opens a small popover
// with sliders for temperature (0.1-2.0) and max tokens (100-2000).
//
// Storage: settings.genTemperature, settings.genMaxTokens
//
// The stop_generating.js monkey-patch reads these values from
// settings and applies them to the call args. This module just
// provides the UI + storage.
//
// Bootstrap: call initGenSettings() from start(). Idempotent.

import { loadSettings, saveSettings } from '../profile/settings_store.js';

export function initGenSettings() {
  if (initGenSettings._done) return;
  initGenSettings._done = true;

  // Read current settings
  let temp, maxTok;
  try {
    const s = loadSettings();
    temp = s.genTemperature;
    maxTok = s.genMaxTokens;
  } catch {}

  // ---- Popover ----
  const container = document.createElement('div');
  container.className = 'pf-presets-container';
  container.style.position = 'relative';
  container.style.display = 'inline-block';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pf-presets-btn';
  btn.textContent = '⚙';
  btn.title = 'Generation settings';

  const popover = document.createElement('div');
  popover.className = 'pf-presets-dropdown';
  popover.hidden = true;
  popover.style.minWidth = '220px';
  popover.style.padding = '12px';

  // Temperature
  const tempLabel = document.createElement('label');
  tempLabel.style.cssText = 'display:block;font-size:12px;margin-bottom:4px;';
  const tempVal = document.createElement('span');
  tempVal.textContent = temp != null ? temp : 'default';

  tempLabel.textContent = 'Temperature: ';
  tempLabel.appendChild(tempVal);

  const tempSlider = document.createElement('input');
  tempSlider.type = 'range';
  tempSlider.min = '0';
  tempSlider.max = '20';
  tempSlider.step = '1';
  tempSlider.value = temp != null ? String(Math.round(temp * 10)) : '8';
  tempSlider.style.cssText = 'width:100%;margin:4px 0 12px;';
  tempSlider.addEventListener('input', () => {
    const v = Number(tempSlider.value) / 10;
    tempVal.textContent = v.toFixed(1);
    save('genTemperature', v);
  });

  // Max tokens
  const tokLabel = document.createElement('label');
  tokLabel.style.cssText = 'display:block;font-size:12px;margin-bottom:4px;';
  const tokVal = document.createElement('span');
  tokVal.textContent = maxTok != null ? maxTok : 'default';

  tokLabel.textContent = 'Max tokens: ';
  tokLabel.appendChild(tokVal);

  const tokSlider = document.createElement('input');
  tokSlider.type = 'range';
  tokSlider.min = '100';
  tokSlider.max = '2000';
  tokSlider.step = '50';
  tokSlider.value = maxTok != null ? String(maxTok) : '500';
  tokSlider.style.cssText = 'width:100%;margin:4px 0 8px;';
  tokSlider.addEventListener('input', () => {
    const v = Number(tokSlider.value);
    tokVal.textContent = v;
    save('genMaxTokens', v);
  });

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset to defaults';
  resetBtn.className = 'pf-preset-item pf-preset-save';
  resetBtn.style.marginTop = '4px';
  resetBtn.addEventListener('click', () => {
    save('genTemperature', null);
    save('genMaxTokens', null);
    tempSlider.value = '8';
    tempVal.textContent = 'default';
    tokSlider.value = '500';
    tokVal.textContent = 'default';
  });

  popover.appendChild(tempLabel);
  popover.appendChild(tempSlider);
  popover.appendChild(tokLabel);
  popover.appendChild(tokSlider);
  popover.appendChild(resetBtn);

  container.appendChild(btn);
  container.appendChild(popover);

  const inputArea = document.getElementById('chatInputEl') ||
                    document.getElementById('inputBarEl') ||
                    document.querySelector('.chat-input-container') ||
                    document.querySelector('.input-bar');
  if (inputArea) {
    (inputArea.parentElement || inputArea).appendChild(container);
  }

  btn.addEventListener('click', () => { popover.hidden = !popover.hidden; });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) popover.hidden = true;
  });

  function save(key, val) {
    try {
      const s = loadSettings();
      if (val == null) delete s[key];
      else s[key] = val;
      saveSettings(s);
    } catch {}
  }
}

/**
 * Read generation settings from our settings store. Called by the
 * aiTextPlugin monkey-patch to apply temperature/maxTokens overrides.
 * Returns {temperature, maxTokens} or nulls for defaults.
 */
export function getGenOverrides() {
  try {
    const s = loadSettings();
    return {
      temperature: s.genTemperature != null ? s.genTemperature : null,
      maxTokens: s.genMaxTokens != null ? s.genMaxTokens : null,
    };
  } catch {
    return { temperature: null, maxTokens: null };
  }
}
