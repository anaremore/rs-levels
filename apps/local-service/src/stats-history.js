import { appendFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STATS_FIELDS, displaySymbolFor, normalizeSymbol } from '../../../packages/schemas/src/index.js';

const FILE_NAME = /^stats-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
/** A study plot read from the page, named by source and plot: `res.hg`, `arb.speed`. Numbers only. */
const SERIES_FIELD = /^[a-z][a-z0-9]{0,15}\.[a-z0-9_]{1,40}$/;
const STATS_KEYS = new Set(STATS_FIELDS.map((field) => field.key));
const DAY_MS = 24 * 60 * 60 * 1000;

/** While captures keep arriving, a line is written at least this often, even with nothing new. */
export const HISTORY_HEARTBEAT_MS = 60 * 1000;
/** Lines of a field further apart than this are a gap: what happened between them is unknown. */
export const HISTORY_GAP_MS = 5 * 60 * 1000;
export const HISTORY_DEFAULT_RANGE_MS = DAY_MS;
export const HISTORY_MAX_POINTS = 20000;
export const HISTORY_MAX_FIELDS = 32;

/**
 * Display stats over time, local and append-only: one JSON line per symbol when a value changes,
 * or per heartbeat while captures keep arriving.
 *
 * A line is { t, s, r, v }: time, canonical symbol, the fields reported since the last line, and
 * the values that changed. Fields are stored by name, so a new one needs no format change. What a
 * reader may assume is in `query`: a value holds only inside its field's coverage segment.
 *
 * Nothing here may fail a capture: `record` keeps its errors for `status`.
 */
export function createStatsHistory(options = {}) {
  const dataDir = String(options.dataDir || '');
  // The service passes checked settings; anyone else gets the same defaults and ranges.
  const retentionDays = integerIn(options.retentionDays, 1, 365, 10);
  const maxBytes = integerIn(options.maxBytes, 1, 1024 * 1024 * 1024, 64 * 1024 * 1024);
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  if (!dataDir) return disabledHistory();

  const dir = join(dataDir, 'history');
  const symbols = new Map();
  const counters = { droppedWrites: 0, skippedLines: 0, lastError: '', lastWriteAtMs: 0 };
  let totalBytes = 0;
  let oldestDay = '';
  let currentDay = '';
  // Files a crash left ending mid-line: the next append there starts a new line first.
  const partialFiles = new Set();

  restore();

  return { enabled: true, record, recordPoints, recordSeries, query, status };

  function nowMs() {
    return toMs(clock());
  }

  // Each step on its own: one unreadable file never stops the rest from loading.
  function restore() {
    try {
      mkdirSync(dir, { recursive: true });
    } catch (error) {
      counters.lastError = errorCode(error);
    }
    prune(nowMs());
    let names = [];
    try {
      names = historyFiles(dir);
    } catch (error) {
      counters.lastError = errorCode(error);
    }
    for (const name of names) {
      try {
        const text = readFileSync(join(dir, name), 'utf8');
        for (const line of parseLines(text, counters)) applyToState(line);
        // A crash can leave a partial last line: the next append must not join it.
        if (text && !text.endsWith('\n')) partialFiles.add(name);
      } catch (error) {
        counters.lastError = errorCode(error);
        // Unread, so its ending is unknown: start a new line to be safe.
        partialFiles.add(name);
      }
    }
  }

  function symbolState(symbol) {
    let state = symbols.get(symbol);
    if (!state) {
      // lastWriteMs follows the stats lines only: series points arrive on their own clock and must
      // not move the stats heartbeat.
      state = { values: {}, valueAt: {}, fieldAt: {}, lastWriteMs: 0, lastChangeMs: 0, lastSampleMs: 0, pending: new Map() };
      symbols.set(symbol, state);
    }
    return state;
  }

  function applyToState(line) {
    const state = symbolState(line.s);
    if (line.r.some((key) => STATS_KEYS.has(key))) state.lastWriteMs = Math.max(state.lastWriteMs, line.ms);
    state.lastSampleMs = Math.max(state.lastSampleMs, line.ms);
    counters.lastWriteAtMs = Math.max(counters.lastWriteAtMs, line.ms);
    for (const key of Object.keys(line.v)) {
      // Points can arrive out of time: only the latest is the value now.
      if (line.ms >= (state.valueAt[key] || 0)) {
        state.values[key] = line.v[key];
        state.valueAt[key] = line.ms;
      }
      state.lastChangeMs = Math.max(state.lastChangeMs, line.ms);
    }
    for (const key of line.r) state.fieldAt[key] = Math.max(state.fieldAt[key] || 0, line.ms);
  }

  /**
   * Timestamped points for one symbol, such as a capture's batch of history: [{ t, values }].
   * Idempotent: a value already stored for that time and field is not written again, so a batch
   * can be sent any number of times. A different value for the same time is written, and the later
   * line wins. Points past retention or in the future are skipped. Returns how many were written.
   */
  function recordPoints(symbolInput, points) {
    let written = 0;
    try {
      const symbol = normalizeSymbol(symbolInput);
      if (!symbol || !Array.isArray(points)) return 0;
      const now = nowMs();
      // Retention runs on day change here too, for a symbol that only sends batches.
      const today = dayOf(now);
      if (today !== currentDay) {
        currentDay = today;
        prune(now);
      }
      const oldest = now - retentionDays * DAY_MS;
      const clean = points
        .map((point) => ({ ms: Date.parse(point?.t), values: pointValues(point?.values) }))
        .filter((point) => point.ms >= oldest && point.ms <= now && Object.keys(point.values).length)
        .sort((a, b) => a.ms - b.ms);
      if (!clean.length) return 0;
      const stored = storedValues(symbol, new Set(clean.map((point) => dayOf(point.ms))));
      for (const { ms, values } of clean) {
        const fresh = {};
        for (const key of Object.keys(values)) {
          const id = `${ms}|${key}`;
          if (stored.get(id) !== values[key]) {
            fresh[key] = values[key];
            stored.set(id, values[key]);
          }
        }
        if (!Object.keys(fresh).length) continue;
        const line = { t: iso(ms), s: symbol, r: Object.keys(values).sort(), v: fresh };
        if (!write(line, ms, now)) break;
        applyToState({ ms, s: symbol, r: line.r, v: fresh });
        written += 1;
      }
    } catch (error) {
      counters.droppedWrites += 1;
      counters.lastError = errorCode(error);
    }
    return written;
  }

  /** Study series from the page: only `source.plot` names, never a stats field. */
  function recordSeries(symbolInput, points) {
    if (!Array.isArray(points)) return 0;
    return recordPoints(symbolInput, points.map((point) => ({
      t: point?.t,
      values: Object.fromEntries(Object.entries(point?.values || {}).filter(([key]) => SERIES_FIELD.test(key)))
    })));
  }

  /** The latest stored value of each time and field for a symbol, on the given days. */
  function storedValues(symbol, days) {
    const stored = new Map();
    const ignored = { skippedLines: 0 };
    for (const name of historyFiles(dir)) {
      if (!days.has(name.match(FILE_NAME)[1])) continue;
      for (const line of parseLines(readFileSync(join(dir, name), 'utf8'), ignored)) {
        if (line.s !== symbol) continue;
        for (const key of Object.keys(line.v)) stored.set(`${line.ms}|${key}`, line.v[key]);
      }
    }
    return stored;
  }

  function record(symbolInput, stats, atInput) {
    let state = null;
    try {
      const symbol = normalizeSymbol(symbolInput);
      const atMs = toMs(atInput ?? clock());
      const reported = reportedValues(stats);
      const keys = Object.keys(reported);
      if (!symbol || !keys.length || !Number.isFinite(atMs)) return;
      state = symbolState(symbol);
      state.lastSampleMs = Math.max(state.lastSampleMs, atMs);
      // Field -> when it was last reported, until a line is written.
      keys.forEach((key) => state.pending.set(key, atMs));

      // After a field's gap its value is written again: a value never carries across a gap.
      const values = {};
      for (const key of keys) {
        const gap = !state.fieldAt[key] || atMs - state.fieldAt[key] > HISTORY_GAP_MS;
        if (gap || state.values[key] !== reported[key]) values[key] = reported[key];
      }
      const changed = Object.keys(values).length > 0;
      if (!changed && atMs - state.lastWriteMs < HISTORY_HEARTBEAT_MS) return;

      const line = { t: new Date(atMs).toISOString(), s: symbol, r: Array.from(state.pending.keys()).sort() };
      if (changed) line.v = values;
      if (!append(line, atMs)) {
        // Lost reports are a gap: no later line may claim them, and a returning value is written.
        state.pending.clear();
        return;
      }

      for (const key of line.r) state.fieldAt[key] = atMs;
      Object.assign(state.values, values);
      for (const key of Object.keys(values)) state.valueAt[key] = atMs;
      state.lastWriteMs = atMs;
      if (changed) state.lastChangeMs = atMs;
      state.pending.clear();
      counters.lastWriteAtMs = atMs;
    } catch (error) {
      // Anything that throws here loses this sample, and the reports queued with it: a gap.
      if (state) state.pending.clear();
      counters.droppedWrites += 1;
      counters.lastError = errorCode(error);
    }
  }

  function append(line, atMs) {
    const day = dayOf(atMs);
    if (day !== currentDay) {
      currentDay = day;
      prune(atMs);
    }
    return write(line, atMs, atMs);
  }

  /** Into the file of the line's own day. `pruneAt`: the time retention and the size limit go by. */
  function write(line, atMs, pruneAt) {
    const day = dayOf(atMs);
    const name = `stats-${day}.jsonl`;
    const text = `${partialFiles.has(name) ? '\n' : ''}${JSON.stringify(line)}\n`;
    const size = Buffer.byteLength(text);
    if (totalBytes + size > maxBytes) {
      prune(pruneAt, size);
      if (totalBytes + size > maxBytes) {
        counters.droppedWrites += 1;
        counters.lastError = 'size-limit';
        return false;
      }
    }
    try {
      mkdirSync(dir, { recursive: true });
      appendFileSync(join(dir, name), text, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      counters.droppedWrites += 1;
      counters.lastError = errorCode(error);
      return false;
    }
    partialFiles.delete(name);
    totalBytes += size;
    if (!oldestDay || day < oldestDay) oldestDay = day;
    counters.lastError = '';
    return true;
  }

  /** Deletes only this store's own day files: past retention, then oldest first over the size limit. */
  /** Never throws: a file that can't be removed (held open, say) stays, and is counted. */
  function prune(atMs, incoming = 0) {
    try {
      pruneFiles(atMs, incoming);
    } catch (error) {
      counters.lastError = errorCode(error);
    }
  }

  function pruneFiles(atMs, incoming) {
    const cutoff = dayOf(atMs - retentionDays * DAY_MS);
    const today = dayOf(atMs);
    let names = historyFiles(dir);
    const sizes = new Map(names.map((name) => [name, fileSize(join(dir, name))]));
    const remove = (name) => {
      try {
        rmSync(join(dir, name), { force: true });
        sizes.delete(name);
        return true;
      } catch (error) {
        counters.lastError = errorCode(error);
        return false;
      }
    };
    for (const name of names) {
      if (name.match(FILE_NAME)[1] < cutoff) remove(name);
    }
    names = Array.from(sizes.keys());
    let total = sumValues(sizes);
    for (const name of names) {
      if (total + incoming <= maxBytes) break;
      if (name === `stats-${today}.jsonl`) break;
      const size = sizes.get(name);
      if (remove(name)) total -= size;
    }
    totalBytes = total;
    const left = Array.from(sizes.keys());
    oldestDay = left.length ? left[0].match(FILE_NAME)[1] : '';
  }

  /**
   * What is known about `symbol` in [from, to]. For each field:
   * - `segments` are the spans it was being reported. Outside them nothing is known: a gap.
   * - `points` are its values when they were written. A value holds from its point until the
   *   field's next point or the end of its segment, and no further.
   * - `opening` is the value already in force at `from`, if a segment was running then.
   * A field with none of these, including one this version has never heard of, is in `absentFields`.
   */
  async function query(symbolInput, range = {}) {
    try {
      return await runQuery(symbolInput, range);
    } catch (error) {
      // A code, never the message: a file system message carries the data directory's path.
      return { ok: false, enabled: true, error: errorCode(error) };
    }
  }

  async function runQuery(symbolInput, range) {
    const symbol = normalizeSymbol(symbolInput);
    const state = symbols.get(symbol);
    const now = nowMs();
    const toMsValue = Number.isFinite(range.toMs) ? range.toMs : now;
    const fromMsValue = Number.isFinite(range.fromMs) ? range.fromMs : toMsValue - HISTORY_DEFAULT_RANGE_MS;
    const fields = requestedFields(range.fields, state);
    // Through `to` plus one gap: the first report after `to` says whether a span ran on to `to`.
    const lines = await readLines(dir, symbol, dayOf(toMsValue + HISTORY_GAP_MS), now - retentionDays * DAY_MS);

    const segments = {};
    const opening = {};
    const pointsByTime = new Map();
    for (const field of fields) {
      let current = null;
      let held = null;
      const spans = [];
      let pastTo = false;
      for (const line of lines) {
        const hasValue = Object.hasOwn(line.v, field);
        if (!hasValue && !line.r.includes(field)) continue;
        if (line.ms > toMsValue) {
          // Unchanged values are written once a minute: the span runs on between those lines.
          if (current && line.ms - current.to <= HISTORY_GAP_MS) current.to = line.ms;
          pastTo = true;
          break;
        }
        if (!current || line.ms - current.to > HISTORY_GAP_MS) {
          current = { from: line.ms, to: line.ms };
          spans.push(current);
          held = null;
        }
        current.to = line.ms;
        if (hasValue) {
          if (line.ms >= fromMsValue) {
            const point = pointsByTime.get(line.ms) || {};
            point[field] = line.v[field];
            pointsByTime.set(line.ms, point);
          } else {
            held = { t: line.ms, value: line.v[field] };
          }
        }
        if (line.ms >= fromMsValue && held) {
          opening[field] = { t: iso(held.t), value: held.value };
          held = null;
        }
      }
      // Reported since the last line was written: the span runs on to the latest report.
      const reportedAt = state ? state.pending.get(field) : undefined;
      if (!pastTo && current && reportedAt > current.to && reportedAt - current.to <= HISTORY_GAP_MS) {
        current.to = reportedAt;
      }
      // Still running at `from` with no later line in range: its value is in force only if the
      // segment reaches `from`.
      if (held && current && current.to >= fromMsValue) opening[field] = { t: iso(held.t), value: held.value };
      segments[field] = spans
        .filter((span) => span.to >= fromMsValue && span.from <= toMsValue)
        .map((span) => ({ from: iso(Math.max(span.from, fromMsValue)), to: iso(Math.min(span.to, toMsValue)) }));
    }

    const times = Array.from(pointsByTime.keys()).sort((a, b) => a - b);
    const kept = times.slice(0, HISTORY_MAX_POINTS);
    const truncated = times.length > kept.length;
    return {
      ok: true,
      enabled: true,
      symbol: displaySymbolFor(symbol),
      from: iso(fromMsValue),
      to: iso(toMsValue),
      fields,
      absentFields: fields.filter((field) => !segments[field].length && !Object.hasOwn(opening, field)),
      gapMs: HISTORY_GAP_MS,
      segments,
      opening,
      points: kept.map((ms) => ({ t: iso(ms), values: pointsByTime.get(ms) })),
      truncated,
      nextFrom: truncated ? iso(times[kept.length]) : null
    };
  }

  function status() {
    const now = nowMs();
    const rows = Array.from(symbols.entries()).map(([symbol, state]) => {
      const fieldAges = Object.entries(state.fieldAt).map(([field, at]) => [field, now - at]);
      return {
        symbol: displaySymbolFor(symbol),
        lastSampleAt: isoOrEmpty(state.lastSampleMs),
        lastChangeAt: isoOrEmpty(state.lastChangeMs),
        ageMs: state.lastSampleMs ? Math.max(0, now - state.lastSampleMs) : null,
        fresh: Boolean(state.lastSampleMs) && now - state.lastSampleMs <= HISTORY_GAP_MS,
        freshFields: fieldAges.filter(([, age]) => age <= HISTORY_GAP_MS).map(([field]) => field).sort()
      };
    }).sort((a, b) => a.symbol.localeCompare(b.symbol));
    return {
      enabled: true,
      retentionDays,
      maxBytes,
      bytes: totalBytes,
      gapMs: HISTORY_GAP_MS,
      oldestDay,
      lastWriteAt: isoOrEmpty(counters.lastWriteAtMs),
      droppedWrites: counters.droppedWrites,
      skippedLines: counters.skippedLines,
      lastError: counters.lastError,
      symbols: rows
    };
  }
}

function disabledHistory() {
  return {
    enabled: false,
    record() {},
    recordSeries() {
      return 0;
    },
    recordPoints() {
      return 0;
    },
    async query(symbolInput) {
      return { ok: true, enabled: false, symbol: displaySymbolFor(normalizeSymbol(symbolInput)), fields: [], absentFields: [], segments: {}, opening: {}, points: [], truncated: false, nextFrom: null };
    },
    status() {
      return { enabled: false };
    }
  };
}

/**
 * The fields to return: those asked for, else every stats field plus the series fields this
 * symbol has stored. An unknown name reads as absent.
 */
function requestedFields(fields, state) {
  const asked = Array.isArray(fields) ? fields : [];
  const clean = Array.from(new Set(asked.filter((field) => FIELD_NAME.test(field)))).slice(0, HISTORY_MAX_FIELDS);
  if (clean.length) return clean;
  const series = Object.keys(state?.fieldAt || {}).filter((field) => SERIES_FIELD.test(field)).sort();
  return [...STATS_FIELDS.map((field) => field.key), ...series].slice(0, HISTORY_MAX_FIELDS);
}

/** A batch point's values: the stats fields, plus series fields with a finite number. */
function pointValues(values) {
  const reported = reportedValues(values || {});
  if (!values || typeof values !== 'object') return reported;
  for (const [key, value] of Object.entries(values)) {
    if (Object.keys(reported).length >= HISTORY_MAX_FIELDS) break;
    if (!SERIES_FIELD.test(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    reported[key] = value;
  }
  return reported;
}

/** What a capture actually reported. A field it didn't report isn't a value, and is never written. */
function reportedValues(stats = {}) {
  const reported = {};
  for (const { key, kind } of STATS_FIELDS) {
    const value = stats[key];
    if (kind === 'text') {
      if (typeof value === 'string' && value) reported[key] = value;
    } else if (value != null && value !== '' && Number.isFinite(Number(value))) {
      reported[key] = Number(value);
    }
  }
  return reported;
}

function parseLines(text, counters) {
  const out = [];
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const line = parseLine(raw);
    if (line) out.push(line);
    else counters.skippedLines += 1;
  }
  return out;
}

/** One line, or null if it is damaged. Values of any other type read as absent. */
function parseLine(raw) {
  try {
    const row = JSON.parse(raw);
    const ms = Date.parse(row.t);
    if (!Number.isFinite(ms) || typeof row.s !== 'string' || !row.s) return null;
    const values = {};
    if (row.v && typeof row.v === 'object' && !Array.isArray(row.v)) {
      for (const key of Object.keys(row.v)) {
        const value = row.v[key];
        if (FIELD_NAME.test(key) && (typeof value === 'string' || Number.isFinite(value))) values[key] = value;
      }
    }
    const reported = Array.isArray(row.r) ? row.r.filter((key) => typeof key === 'string' && FIELD_NAME.test(key)) : [];
    return { ms, s: row.s, v: values, r: reported };
  } catch (_error) {
    return null;
  }
}

async function readLines(dir, symbol, lastDay, oldestMs) {
  const lines = [];
  const counters = { skippedLines: 0 };
  for (const name of historyFiles(dir)) {
    if (name.match(FILE_NAME)[1] > lastDay) continue;
    let text;
    try {
      text = await readFile(join(dir, name), 'utf8');
    } catch (error) {
      // Gone since listing, or not a file: nothing known from it.
      if (error.code === 'ENOENT' || error.code === 'EISDIR') continue;
      throw error;
    }
    for (const line of parseLines(text, counters)) {
      if (line.s === symbol && line.ms >= oldestMs) lines.push(line);
    }
  }
  return lines.sort((a, b) => a.ms - b.ms);
}

function historyFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => FILE_NAME.test(name)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function fileSize(path) {
  try {
    return statSync(path).size;
  } catch (_error) {
    return 0;
  }
}

function sumValues(map) {
  let total = 0;
  map.forEach((value) => { total += value; });
  return total;
}

function dayOf(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function isoOrEmpty(ms) {
  return ms ? iso(ms) : '';
}

function toMs(value) {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/** Only a system code: a message could carry the private data directory's path. */
function integerIn(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function errorCode(error) {
  return String(error?.code || 'history-error');
}
