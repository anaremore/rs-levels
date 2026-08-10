import { displaySymbolFor } from '../../../packages/schemas/src/index.js';

const DEFAULT_CAPTURE_LOG_DELAY_MS = 500;

export function createCaptureReporter(options = {}) {
  const write = options.write || ((line) => console.log(line));
  const clock = options.clock || (() => new Date());
  const formatTime = options.formatTime || localTime;
  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : DEFAULT_CAPTURE_LOG_DELAY_MS;
  let timer = null;
  let latestSnapshot = null;
  let lastSummary = '';

  function report(snapshot) {
    latestSnapshot = snapshot;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
    timer.unref?.();
  }

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!latestSnapshot) return;

    const summary = captureStatusText(latestSnapshot);
    latestSnapshot = null;
    if (summary === lastSummary) return;
    lastSummary = summary;
    write(`[${formatTime(clock())}] ${summary}`);
  }

  function close() {
    if (timer) clearTimeout(timer);
    timer = null;
    latestSnapshot = null;
  }

  return { report, flush, close };
}

export function captureStatusText(snapshot = {}) {
  const rows = Object.values(snapshot.symbols || {}).filter((row) => row && typeof row === 'object');
  const symbols = Array.from(new Set(rows
    .map((row) => displaySymbolFor(row.displaySymbol || row.symbol))
    .filter(Boolean)));
  const levelCount = rows.reduce((sum, row) => sum + (Array.isArray(row.levels) ? row.levels.length : 0), 0);

  if (!levelCount) {
    const scope = symbols.length ? ` for ${countText(symbols.length, 'symbol')}${symbolList(symbols)}` : '';
    return `Capture received${scope}; no supported levels found.`;
  }

  return `Captured ${countText(levelCount, 'level')} across ${countText(symbols.length, 'symbol')}${symbolList(symbols)}.`;
}

function symbolList(symbols) {
  if (!symbols.length) return '';
  const shown = symbols.slice(0, 4);
  const remaining = symbols.length - shown.length;
  return ` (${shown.join(', ')}${remaining ? `, +${remaining} more` : ''})`;
}

function countText(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function localTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}
