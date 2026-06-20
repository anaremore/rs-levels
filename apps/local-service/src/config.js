const DEFAULT_CORS_ORIGINS = Object.freeze([
  'http://127.0.0.1',
  'http://127.0.0.1:*',
  'http://localhost',
  'http://localhost:*',
  'http://[::1]:*',
  'null',
  'chrome-extension://*',
  'moz-extension://*'
]);
const DEFAULT_STALE_MS = 10000;

export function loadConfig(env = process.env, overrides = {}) {
  const host = stringValue(overrides.host || env.RS_LEVELS_HOST || '127.0.0.1');
  const port = numberInRange(overrides.port ?? env.RS_LEVELS_PORT, 0, 65535, 8765);
  const allowRemote = booleanValue(overrides.allowRemote ?? env.RS_LEVELS_ALLOW_REMOTE);
  const corsOrigins = normalizeCorsOrigins(overrides.corsOrigins ?? env.RS_LEVELS_CORS_ORIGINS);
  const staleMs = numberInRange(overrides.staleMs ?? env.RS_LEVELS_STALE_MS, 1000, 24 * 60 * 60 * 1000, DEFAULT_STALE_MS);
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const effectiveHost = isLoopback || allowRemote ? host : '127.0.0.1';
  const warnings = [];
  if (!isLoopback && !allowRemote) {
    warnings.push('Remote bind requested without RS_LEVELS_ALLOW_REMOTE=1; using 127.0.0.1.');
  }
  if (!isLoopback && allowRemote) {
    warnings.push('Remote access is enabled. Use only on trusted private networks such as Tailscale.');
  }
  return {
    host: effectiveHost,
    requestedHost: host,
    port,
    allowRemote,
    remoteAccess: !isLoopback && allowRemote,
    corsOrigins,
    staleMs,
    warnings
  };
}

export function networkStatus(config) {
  return {
    host: config.host,
    requestedHost: config.requestedHost,
    port: config.port,
    remoteAccess: config.remoteAccess,
    corsOrigins: config.corsOrigins,
    warnings: config.warnings
  };
}

function normalizeCorsOrigins(value) {
  if (Array.isArray(value)) {
    const clean = value.map(stringValue).filter(Boolean);
    return clean.length ? clean : Array.from(DEFAULT_CORS_ORIGINS);
  }
  const text = stringValue(value);
  if (!text) return Array.from(DEFAULT_CORS_ORIGINS);
  return text.split(',').map(stringValue).filter(Boolean);
}

function numberInRange(value, min, max, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  const text = stringValue(value).toLowerCase();
  return text === '1' || text === 'true' || text === 'yes';
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
