import { validateSavedConfig } from './config-file.js';

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
const DEFAULT_STALE_MS = 23 * 60 * 60 * 1000;

export function loadConfig(env = process.env, overrides = {}, savedSettings = {}) {
  const saved = validateSavedConfig(savedSettings);
  const warnings = [];
  let host = stringValue(overrides.host || (env.RS_LEVELS_HOST ?? saved.host ?? '127.0.0.1'));
  if (!host) {
    host = '127.0.0.1';
    warnings.push('Empty host requested; using 127.0.0.1.');
  }
  const port = numberInRange(overrides.port ?? env.RS_LEVELS_PORT ?? saved.port, 0, 65535, 8765, 'port', warnings);
  const allowRemote = booleanValue(overrides.allowRemote ?? env.RS_LEVELS_ALLOW_REMOTE ?? saved.allowRemote, warnings);
  const corsOrigins = normalizeCorsOrigins(overrides.corsOrigins ?? env.RS_LEVELS_CORS_ORIGINS ?? saved.corsOrigins);
  const staleMs = numberInRange(overrides.staleMs ?? env.RS_LEVELS_STALE_MS ?? saved.staleMs, 1000, 24 * 60 * 60 * 1000, DEFAULT_STALE_MS, 'staleMs', warnings);
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const effectiveHost = isLoopback || allowRemote ? host : '127.0.0.1';
  if (!isLoopback && !allowRemote) {
    warnings.push('Remote bind requested without allowRemote=true or RS_LEVELS_ALLOW_REMOTE=1; using 127.0.0.1.');
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

function numberInRange(value, min, max, fallback, key, warnings) {
  if (value == null || value === '' || (typeof value === 'string' && !value.trim())) return fallback;
  const n = Number(value);
  if (Number.isInteger(n) && n >= min && n <= max) return n;
  warnings.push(`Invalid ${key}; using default ${fallback}.`);
  return fallback;
}

function booleanValue(value, warnings) {
  if (value === true || value === false) return value;
  const text = stringValue(value).toLowerCase();
  if (text && !['1', 'true', 'yes', '0', 'false', 'no'].includes(text)) {
    warnings.push('Unrecognized allowRemote value; remote access remains disabled.');
  }
  return text === '1' || text === 'true' || text === 'yes';
}

function stringValue(value) {
  return value == null ? '' : String(value).trim();
}
