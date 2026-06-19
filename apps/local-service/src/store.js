import {
  SCHEMA_VERSION,
  createEmptySnapshot,
  normalizeSymbol,
  normalizeSourceState,
  normalizeSymbolSnapshot,
  validateSnapshot
} from '../../../packages/schemas/src/index.js';
import { normalizeCapture } from '../../../packages/core-parser/src/index.js';

export function createLevelStore(options = {}) {
  let snapshot = createEmptySnapshot({
    generatedAt: options.now || new Date().toISOString(),
    source: {
      state: 'waiting',
      connected: false,
      warnings: []
    }
  });
  const endpointMap = new Map();

  function getSnapshot() {
    return snapshot;
  }

  function replaceSnapshot(nextSnapshot) {
    const result = validateSnapshot(nextSnapshot);
    if (!result.ok) {
      throw new Error(result.errors.join('; '));
    }
    snapshot = nextSnapshot;
    return snapshot;
  }

  function applyCapture(capture) {
    const parsed = normalizeCapture(capture);
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
      generatedAt: new Date().toISOString(),
      capturedAt: parsed.capturedAt || snapshot.capturedAt,
      source: normalizeSourceState({
        state: 'capturing',
        connected: true,
        lastCaptureAt: parsed.capturedAt,
        ageMs: 0,
        endpoints: Array.from(endpointMap.values()).slice(-50),
        warnings: parsed.warnings
      }),
      symbols,
      warnings: parsed.warnings
    };
    return snapshot;
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
}

