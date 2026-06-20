import {
  SCHEMA_VERSION,
  createEmptySnapshot,
  normalizeSymbol,
  normalizeSourceState,
  normalizeSymbolSnapshot,
  validateSnapshot
} from '../../../packages/schemas/src/index.js';
import { normalizeCapture } from '../../../packages/core-parser/src/index.js';

const DEFAULT_STALE_MS = 10000;

export function createLevelStore(options = {}) {
  const staleMs = numberInRange(options.staleMs, 1000, 24 * 60 * 60 * 1000, DEFAULT_STALE_MS);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  let snapshot = createEmptySnapshot({
    generatedAt: options.now || isoNow(clock()),
    source: {
      state: 'waiting',
      connected: false,
      warnings: []
    }
  });
  const endpointMap = new Map();
  let lastAcceptedAtMs = 0;

  function getSnapshot() {
    return withFreshness(snapshot);
  }

  function replaceSnapshot(nextSnapshot) {
    const result = validateSnapshot(nextSnapshot);
    if (!result.ok) {
      throw new Error(result.errors.join('; '));
    }
    snapshot = nextSnapshot;
    lastAcceptedAtMs = 0;
    return getSnapshot();
  }

  function applyCapture(capture) {
    const parsed = normalizeCapture(capture);
    const receivedAtDate = dateFrom(clock());
    const receivedAt = isoNow(receivedAtDate);
    lastAcceptedAtMs = receivedAtDate.getTime();
    endpointMap.set(parsed.endpoint.key, parsed.endpoint);

    const symbols = { ...snapshot.symbols };
    Object.keys(parsed.symbols).forEach((symbol) => {
      const existing = symbols[symbol] || normalizeSymbolSnapshot(symbol, {});
      const byId = new Map(existing.levels.map((level) => [level.id, level]));
      parsed.symbols[symbol].forEach((level) => byId.set(level.id, level));
      symbols[symbol] = normalizeSymbolSnapshot(symbol, {
        ...existing,
        capturedAt: parsed.capturedAt,
        levels: Array.from(byId.values())
      });
    });

    snapshot = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: receivedAt,
      capturedAt: parsed.capturedAt || snapshot.capturedAt,
      source: normalizeSourceState({
        state: 'capturing',
        connected: true,
        lastCaptureAt: parsed.capturedAt || receivedAt,
        ageMs: 0,
        endpoints: Array.from(endpointMap.values()).slice(-50),
        warnings: parsed.warnings
      }),
      symbols,
      warnings: parsed.warnings
    };
    return getSnapshot();
  }

  function flatLevels(symbol) {
    if (symbol) {
      const row = snapshot.symbols[normalizeSymbol(symbol)];
      return row ? row.levels : [];
    }
    return Object.values(snapshot.symbols).flatMap((row) => row.levels);
  }

  return {
    getSnapshot,
    replaceSnapshot,
    applyCapture,
    flatLevels
  };

  function withFreshness(baseSnapshot) {
    return {
      ...baseSnapshot,
      generatedAt: isoNow(clock()),
      source: freshSource(baseSnapshot.source)
    };
  }

  function freshSource(source) {
    const normalized = normalizeSourceState(source);
    const lastCaptureMs = Date.parse(normalized.lastCaptureAt);
    if (!normalized.lastCaptureAt || Number.isNaN(lastCaptureMs)) {
      return normalizeSourceState({
        ...normalized,
        state: normalized.state === 'error' || normalized.state === 'offline' ? normalized.state : 'waiting',
        connected: false,
        ageMs: null
      });
    }

    const nowMs = timestampMs(clock());
    const ageBaseMs = lastAcceptedAtMs || lastCaptureMs;
    const ageMs = Number.isFinite(nowMs) ? Math.max(0, nowMs - ageBaseMs) : 0;
    if (normalized.state === 'error' || normalized.state === 'offline') {
      return normalizeSourceState({
        ...normalized,
        connected: false,
        ageMs
      });
    }

    const stale = ageMs > staleMs;
    return normalizeSourceState({
      ...normalized,
      state: stale ? 'stale' : 'capturing',
      connected: !stale,
      ageMs
    });
  }
}

function isoNow(clockValue) {
  const date = dateFrom(clockValue);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function timestampMs(value) {
  return dateFrom(value).getTime();
}

function dateFrom(value) {
  return value instanceof Date ? value : new Date(value);
}

function numberInRange(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}
