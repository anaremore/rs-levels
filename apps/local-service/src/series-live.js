import { displaySymbolFor, normalizeSymbol } from '../../../packages/schemas/src/index.js';

/** One study bar: a minute. */
export const SERIES_BAR_MS = 60 * 1000;
/** Bars older than this are history only: the live view keeps the forming bar and the last closed ones. */
export const SERIES_LIVE_KEEP_MS = 3 * SERIES_BAR_MS;
/** A stream sends a comment this often with nothing else to say, so a client can tell a dead connection. */
export const SERIES_KEEPALIVE_MS = 15 * 1000;
/** The names history stores (`stats-history.js`): the live view takes no other. */
const SERIES_FIELD = /^[a-z][a-z0-9]{0,15}\.[a-z0-9_]{1,40}$/;

/**
 * The study series as they move: each changed value the moment it arrives, the forming minute
 * included. Nothing here is stored: a bar is handed to `onClosed` (history) once its minute has
 * ended, with its last value, so history keeps one value per minute.
 *
 * `accept(symbol, points)` takes `[{ t, values }]` (ISO time of the bar's start, numbers by field)
 * and returns how many values changed. Subscribers get `{ symbol, t, values, forming }` per bar
 * that changed, with only its changed values.
 */
export function createSeriesLive(options = {}) {
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const onClosed = typeof options.onClosed === 'function' ? options.onClosed : null;
  // Canonical symbol -> Map(bar ms -> { values, closed })
  const bars = new Map();
  // Canonical symbol -> Set(listener)
  const listeners = new Map();

  return { accept, current, subscribe, listenerCount, settleAll, holds };

  /** Every symbol's ended bars to history now (a timer, a history read, shutdown). */
  function settleAll() {
    const now = nowMs();
    for (const [symbol, byBar] of bars) settle(symbol, byBar, now);
  }

  /** Whether the live view holds this bar (ISO time) for the symbol. */
  function holds(symbolInput, t) {
    return Boolean(bars.get(normalizeSymbol(symbolInput))?.has(Date.parse(t)));
  }

  function nowMs() {
    const value = clock();
    return (value instanceof Date ? value : new Date(value)).getTime();
  }

  function accept(symbolInput, points) {
    const symbol = normalizeSymbol(symbolInput);
    if (!symbol || !Array.isArray(points)) return 0;
    const now = nowMs();
    let byBar = bars.get(symbol);
    if (!byBar) {
      byBar = new Map();
      bars.set(symbol, byBar);
    }
    let changedCount = 0;
    const sorted = points
      .map((point) => ({ ms: Date.parse(point?.t), values: point?.values || {} }))
      // Recent bars only (a backfill is history's business), and never a bar after now.
      .filter((point) => Number.isFinite(point.ms) && point.ms <= now && point.ms > now - SERIES_LIVE_KEEP_MS)
      .sort((a, b) => a.ms - b.ms);
    for (const { ms, values } of sorted) {
      let bar = byBar.get(ms);
      if (!bar) {
        bar = { values: {}, closed: false };
        byBar.set(ms, bar);
      }
      const changed = {};
      for (const [field, value] of Object.entries(values)) {
        if (!SERIES_FIELD.test(field) || !Number.isFinite(value) || bar.values[field] === value) continue;
        bar.values[field] = value;
        changed[field] = value;
      }
      const keys = Object.keys(changed);
      if (!keys.length) continue;
      changedCount += keys.length;
      // A closed bar that changes again (a late correction) is history's again too.
      if (ms + SERIES_BAR_MS <= now) bar.closed = false;
      emit(symbol, { symbol: displaySymbolFor(symbol), t: new Date(ms).toISOString(), values: changed, forming: ms + SERIES_BAR_MS > now });
    }
    settle(symbol, byBar, now);
    return changedCount;
  }

  /** Bars whose minute has ended go to history once, with their last values; old ones are dropped. */
  function settle(symbol, byBar, now) {
    const closed = [];
    for (const [ms, bar] of byBar) {
      if (ms + SERIES_BAR_MS > now) continue;
      if (!bar.closed) {
        bar.closed = true;
        closed.push({ t: new Date(ms).toISOString(), values: { ...bar.values } });
      }
      if (ms <= now - SERIES_LIVE_KEEP_MS) byBar.delete(ms);
    }
    if (closed.length && onClosed) {
      try {
        onClosed(symbol, closed);
      } catch (_error) {
        // History never fails a live post.
      }
    }
  }

  /** The bars a new subscriber starts from, oldest first: `{ symbol, t, values, forming }`. */
  function current(symbolInput) {
    const symbol = normalizeSymbol(symbolInput);
    const byBar = bars.get(symbol);
    if (!byBar) return [];
    const now = nowMs();
    settle(symbol, byBar, now);
    return Array.from(byBar.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ms, bar]) => ({ symbol: displaySymbolFor(symbol), t: new Date(ms).toISOString(), values: { ...bar.values }, forming: ms + SERIES_BAR_MS > now }));
  }

  function subscribe(symbolInput, listener) {
    const symbol = normalizeSymbol(symbolInput);
    if (!symbol || typeof listener !== 'function') return () => {};
    let set = listeners.get(symbol);
    if (!set) {
      set = new Set();
      listeners.set(symbol, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      // Only this set: a later subscriber may have made a new one.
      if (!set.size && listeners.get(symbol) === set) listeners.delete(symbol);
    };
  }

  function listenerCount(symbolInput) {
    return listeners.get(normalizeSymbol(symbolInput))?.size || 0;
  }

  function emit(symbol, event) {
    const set = listeners.get(symbol);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (_error) {
        // One broken client never stops the others.
      }
    }
  }
}
