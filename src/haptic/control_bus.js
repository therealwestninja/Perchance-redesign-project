// haptic/control_bus.js
//
// Unified event bus for the haptic + narration subsystem (§3).
//
// Every abnormal event — stream error, WebSocket disconnect, idle
// timeout, user pause, duration-cap exceeded — routes through this
// bus. Subscribers (scheduler, backend, UI chip) all react to the
// same signal with no direct coupling between them.
//
// States: 'idle' → 'active' → 'paused' → 'active' | 'idle'
//                 → 'error'  → 'active' | 'idle'

const VALID_STATES = ['idle', 'active', 'paused', 'error'];
const EVENTS = ['stateChange', 'stop', 'pause', 'resume', 'error'];

let _state = 'idle';
const _listeners = {};
for (const e of EVENTS) _listeners[e] = new Set();

/**
 * Subscribe to a control bus event.
 * @param {'stateChange'|'stop'|'pause'|'resume'|'error'} event
 * @param {Function} handler
 * @returns {Function} unsubscribe
 */
export function onBusEvent(event, handler) {
  if (!_listeners[event]) return () => {};
  _listeners[event].add(handler);
  return () => _listeners[event].delete(handler);
}

function _emit(event, detail) {
  for (const fn of _listeners[event]) {
    try { fn(detail); } catch (e) {
      console.warn('[haptic:bus]', event, 'handler error:', e && e.message);
    }
  }
}

function _setState(next, reason) {
  if (!VALID_STATES.includes(next)) return;
  const prev = _state;
  if (prev === next) return;
  _state = next;
  _emit('stateChange', { prev, next, reason });
}

/**
 * Current bus state.
 */
export function getBusState() {
  return _state;
}

/**
 * Transition to active. Called when scheduler starts dispatching.
 */
export function busActivate(reason) {
  _setState('active', reason || 'dispatch-start');
}

/**
 * Pause — ramp to zero, scheduler halts, resumable.
 * Triggered by: user pause button, idle timeout, safeword.
 */
export function busPause(reason) {
  _setState('paused', reason || 'user-pause');
  _emit('pause', { reason: reason || 'user-pause' });
}

/**
 * Resume from pause.
 */
export function busResume(reason) {
  _setState('active', reason || 'user-resume');
  _emit('resume', { reason: reason || 'user-resume' });
}

/**
 * Full stop — back to idle. Scheduler flushes queue.
 * Triggered by: stream end, user explicit stop, disconnect.
 */
export function busStop(reason) {
  _setState('idle', reason || 'stop');
  _emit('stop', { reason: reason || 'stop' });
}

/**
 * Error state — like pause but with error context.
 * Triggered by: WebSocket disconnect, backend error.
 */
export function busError(reason, error) {
  _setState('error', reason || 'backend-error');
  _emit('error', { reason: reason || 'backend-error', error });
}

/**
 * Reset bus to idle without emitting stop (for init/teardown).
 */
export function busReset() {
  _state = 'idle';
}
