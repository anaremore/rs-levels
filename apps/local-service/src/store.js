import {
  SCHEMA_VERSION,
  STATS_FIELDS,
  createEmptySnapshot,
  dropShapeDuplicates,
  normalizeSymbol,
  normalizeSourceState,
  normalizeStats,
  normalizeSymbolSnapshot,
  validateSnapshot
} from '../../../packages/schemas/src/index.js';
import { normalizeCapture } from '../../../packages/core-parser/src/index.js';

const DEFAULT_STALE_MS = 23 * 60 * 60 * 1000;

export function createLevelStore(options = {}) {
  const staleMs = numberInRange(options.staleMs, 1000, 24 * 60 * 60 * 1000, DEFAULT_STALE_MS);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  const onStats = typeof options.onStats === 'function' ? options.onStats : null;
  const onSeries = typeof options.onSeries === 'function' ? options.onSeries : null;
  const onLiveSeries = typeof options.onLiveSeries === 'function' ? options.onLiveSeries : null;
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
    // A snapshot kept from before manual lines were served once: each line once here too.
    const symbols = {};
    Object.entries(nextSnapshot.symbols || {}).forEach(([symbol, row]) => {
      symbols[symbol] = { ...row, levels: dropShapeDuplicates(row.levels) };
    });
    snapshot = { ...nextSnapshot, symbols };
    lastAcceptedAtMs = 0;
    return getSnapshot();
  }

  function applyCapture(capture) {
    // Study series go to history only: they carry no levels and never change the snapshot.
    const series = seriesFromCapture(capture);
    if (series) {
      notifySeries(series);
      return getSnapshot();
    }
    // The fast path's changed values: live only (history takes each bar once its minute ends).
    const live = seriesFromCapture(capture, 'rs_series_live');
    if (live) {
      notifyLiveSeries(live);
      return getSnapshot();
    }
    const parsed = normalizeCapture(capture);
    const receivedAtDate = dateFrom(clock());
    const receivedAt = isoNow(receivedAtDate);
    endpointMap.set(parsed.endpoint.key, parsed.endpoint);

    const symbols = { ...snapshot.symbols };
    const parsedLevelCount = Object.values(parsed.symbols).reduce((sum, rows) => sum + rows.length, 0);
    const parsedStatsCount = Object.keys(parsed.stats || {}).length;
    if (!parsedLevelCount && !parsedStatsCount) {
      const nextSymbols = removeEndpointLevels(symbols, parsed.endpoint.key);
      const hasLevels = Object.values(nextSymbols).some((row) => Array.isArray(row.levels) && row.levels.length);
      snapshot = {
        ...snapshot,
        generatedAt: receivedAt,
        source: normalizeSourceState({
          ...snapshot.source,
          state: hasLevels ? snapshot.source.state : 'waiting',
          connected: hasLevels ? snapshot.source.connected : false,
          lastCaptureAt: hasLevels ? snapshot.source.lastCaptureAt : '',
          ageMs: hasLevels ? snapshot.source.ageMs : null,
          endpoints: Array.from(endpointMap.values()).slice(-50),
          warnings: parsed.warnings
        }),
        symbols: nextSymbols,
        warnings: parsed.warnings
      };
      return getSnapshot();
    }

    lastAcceptedAtMs = receivedAtDate.getTime();
    Array.from(new Set([...Object.keys(parsed.symbols), ...Object.keys(parsed.stats || {})])).forEach((symbol) => {
      const existing = symbols[symbol] || normalizeSymbolSnapshot(symbol, {});
      const parsedLevels = parsed.symbols[symbol] || [];
      const existingLevels = parsedLevels.length
        ? existing.levels.filter((level) => level.metadata?.endpointKey !== parsed.endpoint.key)
        : existing.levels;
      const byId = new Map(existingLevels.map((level) => [level.id, level]));
      parsedLevels.forEach((level) => byId.set(level.id, level));
      symbols[symbol] = normalizeSymbolSnapshot(symbol, {
        ...existing,
        capturedAt: parsed.capturedAt,
        levels: Array.from(byId.values()),
        stats: parsed.stats?.[symbol] ? mergeStats(existing.stats, parsed.stats[symbol]) : existing.stats
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
    notifyStats(parsed.stats, receivedAtDate);
    return getSnapshot();
  }

  // What this capture itself reported, not the merged snapshot: a field it didn't report stays unreported.
  function notifyStats(stats = {}, at) {
    if (!onStats) return;
    Object.entries(stats).forEach(([symbol, row]) => {
      try {
        onStats(symbol, row, at);
      } catch (_error) {
        // History must never turn an accepted capture into a failed request.
      }
    });
  }

  function notifySeries(series) {
    if (!onSeries) return;
    Object.entries(series).forEach(([symbol, columns]) => {
      try {
        const points = seriesPoints(columns);
        if (points.length) onSeries(symbol, points);
      } catch (_error) {
        // As with stats: history never fails a capture.
      }
    });
  }

  function notifyLiveSeries(series) {
    if (!onLiveSeries) return;
    Object.entries(series).forEach(([symbol, columns]) => {
      try {
        const points = seriesPoints(columns);
        if (points.length) onLiveSeries(symbol, points);
      } catch (_error) {
        // A live post never fails either.
      }
    });
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

/** `{ fields: [name], rows: [[unixSeconds, value|null, ...]] }` as `[{ t, values }]`. */
function seriesPoints(columns) {
  const fields = Array.isArray(columns?.fields) ? columns.fields.map(String) : [];
  const rows = Array.isArray(columns?.rows) ? columns.rows : [];
  const points = [];
  for (const row of rows) {
    // A time a Date can hold; one bad row never costs the rest of the post.
    if (!Array.isArray(row) || !Number.isFinite(row[0]) || Math.abs(row[0]) > 8.64e12) continue;
    const values = {};
    fields.forEach((field, index) => {
      if (Number.isFinite(row[index + 1])) values[field] = row[index + 1];
    });
    if (Object.keys(values).length) points.push({ t: new Date(row[0] * 1000).toISOString(), values });
  }
  return points;
}

/** `{ SYMBOL: { fields, rows } }` from an `rs_series` (or `type`) capture body, else null. */
function seriesFromCapture(capture = {}, type = 'rs_series') {
  let body = capture && capture.body;
  if (typeof body === 'string') {
    if (!body.includes(`"${type}"`)) return null;
    try {
      body = JSON.parse(body);
    } catch (_error) {
      return null;
    }
  }
  if (!body || typeof body !== 'object' || body.type !== type) return null;
  const series = body.series;
  return series && typeof series === 'object' && !Array.isArray(series) ? series : null;
}

function mergeStats(existing = {}, next = {}) {
  const merged = normalizeStats(existing);
  const incoming = normalizeStats(next);
  STATS_FIELDS.forEach(({ key, kind }) => {
    if (kind === 'text') {
      if (incoming[key]) merged[key] = incoming[key];
    } else if (incoming[key] != null && Number.isFinite(Number(incoming[key]))) {
      merged[key] = Number(incoming[key]);
    }
  });
  return merged;
}

function removeEndpointLevels(symbols, endpointKey) {
  const key = String(endpointKey || '');
  if (!key) return symbols;
  const next = {};
  Object.entries(symbols || {}).forEach(([symbol, row]) => {
    const levels = Array.isArray(row.levels) ? row.levels.filter((level) => level.metadata?.endpointKey !== key) : [];
    if (levels.length) {
      next[symbol] = normalizeSymbolSnapshot(symbol, {
        ...row,
        levels
      });
    }
  });
  return next;
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
