// haptic/plugin_loader.js
//
// Third-party plugin loading for haptic and TTS backends (§1.5, §8).
//
// Loading paths:
//   - URL paste: fetched via superFetch, wrapped in Blob, imported via
//     blob URL, default export registered.
//   - Local file picker: FileReader → same blob-import path. File never
//     leaves the user's machine.
//   - Cache in IndexedDB: registered plugins auto-load on subsequent
//     page loads. User can reload from source or remove at will.
//
// Trust model: one-time dialog on first add. No silent refetch — cached
// copy runs unless user clicks "Reload from source."
//
// Plugin manifest validation adapted from Adaptive Session Studio's
// plugin-host.js (MIT license, scrapped).

import { registerBackend } from './backend.js';
import { savePlugin, loadPlugins } from './settings.js';

// ---- Manifest validation ----

const REQUIRED_FIELDS = ['id', 'displayName'];
const VALID_TYPES = ['haptic', 'tts'];

/**
 * Validate a plugin's exported manifest/shape.
 * Adapted from plugin-host.js validatePluginManifest().
 */
export function validatePluginExport(exported) {
  if (!exported || typeof exported !== 'object') {
    throw new Error('Plugin must export an object with id, displayName, and backend methods.');
  }
  for (const field of REQUIRED_FIELDS) {
    if (!exported[field]) {
      throw new Error(`Plugin missing required field: "${field}".`);
    }
  }
  if (typeof exported.id !== 'string' || !/^[a-z0-9_-]{2,64}$/.test(exported.id)) {
    throw new Error('Plugin id must be 2–64 lowercase alphanumeric/dash/underscore characters.');
  }
  // Must implement at least connect/disconnect/execute or speak/stop
  const isHaptic = typeof exported.connect === 'function' && typeof exported.execute === 'function';
  const isTts = typeof exported.speak === 'function' && typeof exported.stop === 'function';
  if (!isHaptic && !isTts) {
    throw new Error('Plugin must implement either HapticBackend (connect, execute) or TtsBackend (speak, stop).');
  }
  return isHaptic ? 'haptic' : 'tts';
}

// ---- Loading from URL ----

/**
 * Load a plugin from a URL. Fetches the source, caches in IDB,
 * and registers the backend.
 *
 * @param {string} url - URL to a .js module
 * @returns {Promise<{id: string, type: string}>}
 */
export async function loadPluginFromUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Plugin URL is required.');
  }

  // Fetch source (use superFetch for CORS bypass if available)
  let response;
  if (typeof window !== 'undefined' && window.root && typeof window.root.superFetch === 'function') {
    response = await window.root.superFetch(url);
  } else {
    response = await fetch(url);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch plugin: ${response.status} ${response.statusText}`);
  }

  const code = await response.text();
  return _loadFromCode(code, 'url', url);
}

// ---- Loading from file ----

/**
 * Load a plugin from a local file.
 *
 * @param {File} file - a .js file from <input type="file">
 * @returns {Promise<{id: string, type: string}>}
 */
export async function loadPluginFromFile(file) {
  if (!file) throw new Error('No file provided.');

  const code = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file);
  });

  return _loadFromCode(code, 'file', file.name);
}

// ---- Common import path ----

async function _loadFromCode(code, source, sourceRef) {
  // Wrap in a Blob and import via blob URL
  const blob = new Blob([code], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  let exported;
  try {
    const module = await import(blobUrl);
    exported = module.default || module;
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
    throw new Error(`Plugin code failed to load: ${err.message}`);
  }
  URL.revokeObjectURL(blobUrl);

  // Validate
  const type = validatePluginExport(exported);

  // Register
  if (type === 'haptic') {
    // Ensure the backend has required interface methods with safe defaults
    const backend = {
      capabilities: {},
      isConnected: () => false,
      listDevices: () => [],
      getActiveDeviceType: () => null,
      stopAll: async () => {},
      on: () => {},
      ...exported,
    };
    registerBackend(backend);
  }
  // TTS plugins will be handled in M9/M10

  // Cache in IDB for auto-load on next page load
  await savePlugin({
    id: exported.id,
    source,
    sourceRef,
    code,
    registeredAt: new Date().toISOString(),
    lastReloadedAt: new Date().toISOString(),
    trusted: true,
    type,
  });

  return { id: exported.id, type };
}

// ---- Auto-load cached plugins ----

/**
 * Load all cached plugins from IDB on boot.
 * Called from haptic/init.js after DB is ready.
 */
export async function autoLoadCachedPlugins() {
  try {
    const plugins = await loadPlugins();
    for (const plugin of plugins) {
      if (!plugin.code || plugin.source === 'builtin') continue;
      if (!plugin.trusted) continue;
      try {
        await _loadFromCode(plugin.code, plugin.source, plugin.sourceRef);
      } catch (err) {
        console.warn(`[haptic:plugin] Failed to reload cached plugin "${plugin.id}":`, err.message);
      }
    }
  } catch {}
}

/**
 * Reload a plugin from its original source URL.
 */
export async function reloadPluginFromSource(pluginId) {
  const plugins = await loadPlugins();
  const plugin = plugins.find(p => p.id === pluginId);
  if (!plugin || plugin.source !== 'url' || !plugin.sourceRef) {
    throw new Error('Plugin cannot be reloaded — no source URL.');
  }
  return loadPluginFromUrl(plugin.sourceRef);
}
