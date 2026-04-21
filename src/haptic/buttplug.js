// haptic/buttplug.js
//
// First-party haptic backend plugin — Buttplug.io via Intiface Central.
//
// Connects to Intiface Central's WebSocket server (default ws://localhost:12345).
// Maps HapticEvent → Buttplug protocol messages (ScalarCmd, LinearCmd, RotateCmd).
// Enumerates paired devices on connect. Auto-selects first available device.
//
// This plugin is always available and cannot be removed. It self-registers
// into the backend registry at module load time.
//
// Requires: Intiface Central running locally with WebSocket server enabled.
// Download: https://intiface.com/central/
//
// Protocol reference: https://buttplug-spec.docs.buttplug.io/

import { registerBackend } from './backend.js';
import { busError } from './control_bus.js';

const DEFAULT_WS_URL = 'ws://localhost:12345';
const CLIENT_NAME = 'PerchanceHapticChat';
const MSG_VERSION = 3; // Buttplug protocol version

// ---- Track → Buttplug command mapping ----

const TRACK_TO_CMD = {
  vibe:      'ScalarCmd',
  intensity: 'ScalarCmd',    // abstract channel → primary actuator
  stroke:    'LinearCmd',
  rotate:    'RotateCmd',
};

const TRACK_TO_ACTUATOR = {
  vibe:      'Vibrate',
  intensity: 'Vibrate',
  stroke:    'Linear',
  rotate:    'Rotate',
};

// ---- Buttplug protocol message helpers ----

let _msgId = 1;
function nextId() { return _msgId++; }

function bpMsg(type, fields) {
  return [{ [type]: { Id: nextId(), ...fields } }];
}

// ---- Plugin implementation ----

class ButtplugBackend {
  constructor() {
    this.id = 'buttplug';
    this.displayName = 'Buttplug.io (Intiface Central)';
    this.capabilities = { vibe: true, stroke: true, rotate: true, intensity: true };

    this._ws = null;
    this._connected = false;
    this._devices = new Map();         // deviceIndex → DeviceInfo
    this._activeDeviceIndex = null;
    this._wsUrl = DEFAULT_WS_URL;
    this._listeners = { connect: new Set(), disconnect: new Set(), deviceChange: new Set() };
    this._pendingResponses = new Map(); // msgId → { resolve, reject, timer }
  }

  // ---- Connection ----

  async connect(wsUrl) {
    if (this._connected) return;
    const url = wsUrl || this._wsUrl;

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(url);
        this._ws = ws;

        ws.onopen = async () => {
          try {
            // Handshake: RequestServerInfo
            await this._send('RequestServerInfo', {
              ClientName: CLIENT_NAME,
              MessageVersion: MSG_VERSION,
            });

            // Request device list
            const deviceResp = await this._send('RequestDeviceList', {});
            if (deviceResp && deviceResp.DeviceList) {
              this._handleDeviceList(deviceResp.DeviceList.Devices || []);
            }

            // Start scanning for new devices
            this._sendFire('StartScanning', {});

            this._connected = true;
            this._emit('connect');
            resolve();
          } catch (err) {
            this._cleanup();
            reject(err);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msgs = JSON.parse(event.data);
            for (const msg of msgs) {
              this._handleMessage(msg);
            }
          } catch { /* malformed message */ }
        };

        ws.onerror = () => {
          if (!this._connected) {
            reject(new Error('Could not connect to Intiface Central at ' + url));
          }
        };

        ws.onclose = () => {
          const wasConnected = this._connected;
          this._cleanup();
          if (wasConnected) {
            this._emit('disconnect');
            busError('device-disconnected', new Error('Intiface Central connection lost'));
          }
        };

        // Timeout — don't wait forever for a dead server
        setTimeout(() => {
          if (!this._connected && ws.readyState !== WebSocket.OPEN) {
            ws.close();
            reject(new Error('Connection to Intiface Central timed out'));
          }
        }, 5000);

      } catch (err) {
        reject(err);
      }
    });
  }

  async disconnect() {
    if (!this._ws) return;
    // Stop all devices before disconnecting
    try { await this.stopAll(); } catch {}
    // Send StopAllDevices
    try { this._sendFire('StopAllDevices', {}); } catch {}
    this._cleanup();
    this._emit('disconnect');
  }

  isConnected() {
    return this._connected && this._ws && this._ws.readyState === WebSocket.OPEN;
  }

  // ---- Device enumeration ----

  listDevices() {
    return Array.from(this._devices.values());
  }

  getActiveDeviceType() {
    if (this._activeDeviceIndex === null) return null;
    const dev = this._devices.get(this._activeDeviceIndex);
    return dev ? dev.primaryType : null;
  }

  /**
   * Select which device to target. Index from listDevices().
   */
  setActiveDevice(index) {
    if (this._devices.has(index)) {
      this._activeDeviceIndex = index;
      this._emit('deviceChange');
    }
  }

  // ---- Command dispatch ----

  async execute(event) {
    if (!this.isConnected()) return;

    const dev = this._getActiveDevice();
    if (!dev) return;

    const track = event.track || 'vibe';
    const intensity = Math.max(0, Math.min(1, event.intensity || 0));
    const duration = Math.max(0, event.duration || 0);

    // Map track → Buttplug command
    const actuatorType = TRACK_TO_ACTUATOR[track] || 'Vibrate';
    const actuatorIndex = this._findActuator(dev, actuatorType);
    if (actuatorIndex === -1) return;

    if (track === 'stroke') {
      // LinearCmd — position + duration
      this._sendFire('LinearCmd', {
        DeviceIndex: dev.index,
        Vectors: [{ Index: actuatorIndex, Duration: duration, Position: intensity }],
      });
    } else if (track === 'rotate') {
      // RotateCmd — speed + clockwise
      this._sendFire('RotateCmd', {
        DeviceIndex: dev.index,
        Rotations: [{ Index: actuatorIndex, Speed: intensity, Clockwise: true }],
      });
    } else {
      // ScalarCmd — vibrate or generic
      this._sendFire('ScalarCmd', {
        DeviceIndex: dev.index,
        Scalars: [{ Index: actuatorIndex, Scalar: intensity, ActuatorType: actuatorType }],
      });
    }

    // Auto-stop after duration (if specified and > 0)
    if (duration > 0) {
      setTimeout(() => {
        if (!this.isConnected()) return;
        this._sendZero(dev.index, actuatorType, actuatorIndex);
      }, duration);
    }
  }

  async stopAll() {
    if (!this.isConnected()) return;
    this._sendFire('StopAllDevices', {});
  }

  // ---- Event listeners ----

  on(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event].add(handler);
    }
  }

  off(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event].delete(handler);
    }
  }

  // ---- Internals ----

  _emit(event, detail) {
    for (const fn of (this._listeners[event] || [])) {
      try { fn(detail); } catch {}
    }
  }

  _getActiveDevice() {
    if (this._activeDeviceIndex !== null) {
      return this._devices.get(this._activeDeviceIndex) || null;
    }
    // Auto-select first device
    if (this._devices.size > 0) {
      const first = this._devices.keys().next().value;
      this._activeDeviceIndex = first;
      return this._devices.get(first);
    }
    return null;
  }

  _findActuator(dev, type) {
    // Search DeviceMessages for matching actuator type
    if (!dev.messages) return 0; // fallback to index 0
    for (const [cmdType, features] of Object.entries(dev.messages)) {
      if (cmdType === 'ScalarCmd' && type !== 'Linear' && type !== 'Rotate') {
        const featureArr = features.FeatureCount ? Array.from({ length: features.FeatureCount }, (_, i) => i) : [0];
        return featureArr[0] !== undefined ? featureArr[0] : 0;
      }
      if (cmdType === 'LinearCmd' && type === 'Linear') return 0;
      if (cmdType === 'RotateCmd' && type === 'Rotate') return 0;
    }
    return 0;
  }

  _sendZero(deviceIndex, actuatorType, actuatorIndex) {
    if (!this.isConnected()) return;
    this._sendFire('ScalarCmd', {
      DeviceIndex: deviceIndex,
      Scalars: [{ Index: actuatorIndex, Scalar: 0, ActuatorType: actuatorType }],
    });
  }

  /** Send and wait for response (with timeout). */
  _send(type, fields) {
    return new Promise((resolve, reject) => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const id = nextId();
      const msg = [{ [type]: { Id: id, ...fields } }];

      const timer = setTimeout(() => {
        this._pendingResponses.delete(id);
        reject(new Error(`${type} timed out`));
      }, 5000);

      this._pendingResponses.set(id, { resolve, reject, timer });
      this._ws.send(JSON.stringify(msg));
    });
  }

  /** Send without waiting for response. */
  _sendFire(type, fields) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const msg = [{ [type]: { Id: nextId(), ...fields } }];
    try { this._ws.send(JSON.stringify(msg)); } catch {}
  }

  _handleMessage(msg) {
    // Each message is { TypeName: { Id, ...fields } }
    const type = Object.keys(msg)[0];
    const body = msg[type];
    const id = body && body.Id;

    // Route responses to pending promises
    if (id && this._pendingResponses.has(id)) {
      const pending = this._pendingResponses.get(id);
      this._pendingResponses.delete(id);
      clearTimeout(pending.timer);
      if (type === 'Error') {
        pending.reject(new Error(body.ErrorMessage || 'Buttplug error'));
      } else {
        pending.resolve(msg);
      }
      return;
    }

    // Handle server-initiated messages
    if (type === 'DeviceAdded') {
      this._addDevice(body);
    } else if (type === 'DeviceRemoved') {
      this._removeDevice(body.DeviceIndex);
    } else if (type === 'ScanningFinished') {
      // Normal — scanning complete, no action needed
    }
  }

  _handleDeviceList(devices) {
    this._devices.clear();
    for (const dev of devices) {
      this._addDevice(dev);
    }
  }

  _addDevice(raw) {
    const info = {
      index: raw.DeviceIndex,
      name: raw.DeviceName || `Device ${raw.DeviceIndex}`,
      messages: raw.DeviceMessages || {},
      primaryType: this._detectPrimaryType(raw.DeviceMessages || {}),
    };
    this._devices.set(info.index, info);
    this._emit('deviceChange');
  }

  _removeDevice(index) {
    this._devices.delete(index);
    if (this._activeDeviceIndex === index) {
      this._activeDeviceIndex = this._devices.size > 0
        ? this._devices.keys().next().value
        : null;
    }
    this._emit('deviceChange');
  }

  _detectPrimaryType(messages) {
    if (messages.RotateCmd) return 'rotate';
    if (messages.LinearCmd) return 'stroke';
    return 'vibe';
  }

  _cleanup() {
    this._connected = false;
    this._devices.clear();
    this._activeDeviceIndex = null;
    for (const [, pending] of this._pendingResponses) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this._pendingResponses.clear();
    if (this._ws) {
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
  }
}

// ---- Self-register on module load ----

const buttplugInstance = new ButtplugBackend();
registerBackend(buttplugInstance);

export { buttplugInstance };
