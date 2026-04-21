// haptic/backend.js
//
// HapticBackend contract (§1.5) and plugin registry.
//
// The generator knows nothing about any specific hardware protocol.
// Everything below this interface is a plugin. The registry manages
// registered backends, tracks the active one, and provides a unified
// API for the scheduler and UI.
//
// Multiple backends can be registered; only one is active at a time.
// The active backend is selected by the user in settings.

import { busError, busStop } from './control_bus.js';

// ---- Backend registry ----

const _backends = new Map();   // id → HapticBackend instance
let _activeId = null;

/**
 * Register a backend plugin. Built-in backends (buttplug) call this
 * at module load time. User-loaded plugins call this after blob import.
 *
 * @param {HapticBackend} backend
 */
export function registerBackend(backend) {
  if (!backend || !backend.id) {
    console.warn('[haptic:backend] cannot register backend without id');
    return;
  }
  _backends.set(backend.id, backend);
}

/**
 * Get all registered backend IDs + display names.
 */
export function listBackends() {
  return Array.from(_backends.values()).map(b => ({
    id: b.id,
    displayName: b.displayName || b.id,
    connected: b.isConnected(),
    capabilities: b.capabilities || {},
  }));
}

/**
 * Get a backend by ID.
 */
export function getBackend(id) {
  return _backends.get(id) || null;
}

/**
 * Set the active backend. Does NOT auto-connect — that's explicit.
 */
export function setActiveBackend(id) {
  if (!_backends.has(id)) return false;
  // Disconnect previous if different and connected
  if (_activeId && _activeId !== id) {
    const prev = _backends.get(_activeId);
    if (prev && prev.isConnected()) {
      prev.disconnect().catch(() => {});
    }
  }
  _activeId = id;
  return true;
}

/**
 * Get the currently active backend instance, or null.
 */
export function getActiveBackend() {
  if (!_activeId) return null;
  return _backends.get(_activeId) || null;
}

/**
 * Get the active backend ID.
 */
export function getActiveBackendId() {
  return _activeId;
}

// ---- Unified dispatch API ----

/**
 * Connect the active backend.
 * @returns {Promise<boolean>} true if connected successfully
 */
export async function connectActiveBackend() {
  const backend = getActiveBackend();
  if (!backend) {
    busError('no-backend', new Error('No active backend selected'));
    return false;
  }
  try {
    await backend.connect();
    return true;
  } catch (err) {
    busError('connect-failed', err);
    return false;
  }
}

/**
 * Disconnect the active backend.
 */
export async function disconnectActiveBackend() {
  const backend = getActiveBackend();
  if (!backend) return;
  try {
    await backend.disconnect();
  } catch { /* best-effort */ }
  busStop('user-disconnect');
}

/**
 * Execute a haptic event on the active backend.
 * The event has already been through the envelope resolver + clamps + slider.
 *
 * @param {HapticEvent} event - { track, intensity, duration }
 */
export async function executeEvent(event) {
  const backend = getActiveBackend();
  if (!backend || !backend.isConnected()) return;
  try {
    await backend.execute(event);
  } catch (err) {
    busError('execute-failed', err);
  }
}

/**
 * Stop all output on the active backend (ramp to zero).
 */
export async function stopAll() {
  const backend = getActiveBackend();
  if (!backend) return;
  try {
    await backend.stopAll();
  } catch { /* best-effort — device may already be disconnected */ }
}

/**
 * Check if the active backend is connected and has devices.
 */
export function isHapticReady() {
  const backend = getActiveBackend();
  return !!(backend && backend.isConnected());
}

/**
 * List devices on the active backend.
 */
export function listDevices() {
  const backend = getActiveBackend();
  if (!backend || !backend.isConnected()) return [];
  return backend.listDevices();
}
