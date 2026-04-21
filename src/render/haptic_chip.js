// render/haptic_chip.js
//
// Compact haptic controls for the chat header (§5):
//   - Device status chip (grey → green → pulsing → amber)
//   - Pause/stop button
//   - Intensity slider (0–150%)
//
// All controls are inert until a backend connects. The chip shows
// connection state; clicking it opens the connect flow. The slider
// directly drives the backend's primary actuator for M2 (no tags yet).

import { h } from '../utils/dom.js';
import {
  getActiveBackend,
  connectActiveBackend,
  disconnectActiveBackend,
  isHapticReady,
  listDevices,
  executeEvent,
  stopAll,
} from '../haptic/backend.js';
import {
  getBusState,
  onBusEvent,
  busPause,
  busResume,
  busActivate,
} from '../haptic/control_bus.js';
import {
  loadHapticSettings,
  updateHapticSetting,
} from '../haptic/settings.js';

// Settings panel moved to render/input_dock.js (Options button in input dock)

// ---- State ----
let _chipEl = null;
let _sliderEl = null;
let _pauseBtn = null;
let _statusDot = null;
let _statusLabel = null;
let _sliderValue = 1.0;
let _connecting = false;

// ---- Public: render into container ----

/**
 * Create the haptic chip UI and mount it.
 * Called from haptic/init.js after the header container exists.
 *
 * @param {HTMLElement} container - the .pf-haptic-chip-container
 */
export function renderHapticChip(container) {
  if (!container) return;

  // Status dot
  _statusDot = h('span', { class: 'pf-haptic-dot pf-haptic-dot-grey' });

  // Status label
  _statusLabel = h('span', { class: 'pf-haptic-label' }, ['Disconnected']);

  // Chip button — click to connect/disconnect
  _chipEl = h('button', {
    type: 'button',
    class: 'pf-haptic-chip',
    title: 'Click to connect device',
    onClick: () => handleChipClick(),
  }, [_statusDot, _statusLabel]);

  // Pause button
  _pauseBtn = h('button', {
    type: 'button',
    class: 'pf-haptic-pause',
    title: 'Pause haptic output',
    hidden: true,
    onClick: () => handlePauseClick(),
  }, ['⏸']);

  // Intensity slider
  _sliderEl = h('input', {
    type: 'range',
    class: 'pf-haptic-slider',
    min: '0',
    max: '150',
    value: '100',
    title: 'Haptic intensity: 100%',
    hidden: true,
    onInput: (ev) => handleSliderInput(ev),
  });

  // Settings button removed — now lives in the input dock (render/input_dock.js)

  container.replaceChildren(_chipEl, _pauseBtn, _sliderEl);

  // Subscribe to bus state changes for live updates
  onBusEvent('stateChange', () => refreshChipState());
  onBusEvent('error', (detail) => showChipError(detail));

  // Load saved slider value
  loadHapticSettings().then(settings => {
    _sliderValue = settings.intensitySlider || 1.0;
    _sliderEl.value = String(Math.round(_sliderValue * 100));
    _sliderEl.title = `Haptic intensity: ${Math.round(_sliderValue * 100)}%`;
  }).catch(() => {});

  refreshChipState();
}

// ---- Event handlers ----

async function handleChipClick() {
  if (_connecting) return;

  if (isHapticReady()) {
    // Already connected — disconnect
    await disconnectActiveBackend();
    refreshChipState();
    return;
  }

  // Connect
  _connecting = true;
  setChipState('connecting', 'Connecting…');

  const success = await connectActiveBackend();
  _connecting = false;

  if (success) {
    const devices = listDevices();
    const devName = devices.length > 0 ? devices[0].name : 'Connected';
    setChipState('connected', devName);
    _pauseBtn.hidden = false;
    _sliderEl.hidden = false;
  } else {
    setChipState('error', 'Connection failed');
    setTimeout(() => refreshChipState(), 3000);
  }
}

function handlePauseClick() {
  const state = getBusState();
  if (state === 'paused') {
    busResume('user-resume');
    _pauseBtn.textContent = '⏸';
    _pauseBtn.title = 'Pause haptic output';
  } else {
    busPause('user-pause');
    _pauseBtn.textContent = '▶';
    _pauseBtn.title = 'Resume haptic output';
  }
}

async function handleSliderInput(ev) {
  const pct = Number(ev.target.value);
  _sliderValue = pct / 100;
  _sliderEl.title = `Haptic intensity: ${pct}%`;

  // Save preference
  updateHapticSetting('intensitySlider', _sliderValue).catch(() => {});

  // M2: directly drive the device when slider changes (no tags yet).
  // This gives the user immediate feedback that the connection works.
  if (isHapticReady() && _sliderValue > 0) {
    busActivate('slider-direct');
    try {
      await executeEvent({
        track: 'vibe',
        intensity: _sliderValue,
        duration: 0,  // continuous until changed
      });
    } catch {}
  } else if (isHapticReady() && _sliderValue === 0) {
    try { await stopAll(); } catch {}
  }
}

// ---- State display ----

function setChipState(state, label) {
  if (!_statusDot || !_statusLabel) return;

  _statusDot.className = 'pf-haptic-dot pf-haptic-dot-' + state;
  _statusLabel.textContent = label || state;

  const titles = {
    grey: 'Click to connect device',
    connecting: 'Connecting to Intiface Central…',
    connected: `Connected: ${label}. Click to disconnect.`,
    active: `Active: ${label}`,
    error: label || 'Connection error',
    paused: 'Paused — click ▶ to resume',
  };
  if (_chipEl) _chipEl.title = titles[state] || label || '';
}

function refreshChipState() {
  const busState = getBusState();
  const ready = isHapticReady();

  if (!ready) {
    setChipState('grey', 'Disconnected');
    if (_pauseBtn) _pauseBtn.hidden = true;
    if (_sliderEl) _sliderEl.hidden = true;
    return;
  }

  const devices = listDevices();
  const devName = devices.length > 0 ? devices[0].name : 'Connected';

  if (busState === 'paused') {
    setChipState('paused', 'Paused');
  } else if (busState === 'error') {
    setChipState('error', 'Error');
  } else if (busState === 'active') {
    setChipState('active', devName);
  } else {
    setChipState('connected', devName);
  }

  if (_pauseBtn) _pauseBtn.hidden = false;
  if (_sliderEl) _sliderEl.hidden = false;
}

function showChipError(detail) {
  const reason = (detail && detail.reason) || 'error';
  setChipState('error', reason);
}
