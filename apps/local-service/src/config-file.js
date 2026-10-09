import { readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

const KEYS = new Set(['host', 'port', 'allowRemote', 'corsOrigins', 'staleMs']);
const ORIGIN_PATTERNS = new Set([
  'null',
  'http://127.0.0.1:*',
  'http://localhost:*',
  'http://[::1]:*',
  'chrome-extension://*',
  'moz-extension://*'
]);

export function loadConfigFile(filePath) {
  const path = resolve(filePath);
  let text;
  try {
    if (!statSync(path).isFile()) throw new Error('NOT_FILE');
    text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'file not found'
      : error.code === 'EACCES' || error.code === 'EPERM' ? 'permission denied'
        : error.message === 'NOT_FILE' ? 'path must be a regular file'
          : 'file could not be read';
    throw configError(path, reason);
  }
  let saved;
  try {
    saved = JSON.parse(text);
  } catch (_error) {
    // Native JSON errors can include a snippet of private file content.
    throw configError(path, 'malformed JSON; save a JSON object as UTF-8');
  }
  return validateSavedConfig(saved, path);
}

export function validateSavedConfig(saved, context = 'saved settings') {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) {
    throw configError(context, 'expected a JSON object');
  }
  const clean = {};
  for (const key of Object.keys(saved)) {
    if (!KEYS.has(key)) {
      const name = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ? ` ${key}` : '';
      throw configError(context, `unknown key${name}; allowed keys: ${Array.from(KEYS).join(', ')}`);
    }
    const value = saved[key];
    if (key === 'host') {
      if (!validHost(value)) throw configError(context, 'host must be a bare IP address or hostname without whitespace, URL, or port');
      clean.host = value;
    } else if (key === 'port' || key === 'staleMs') {
      const min = key === 'port' ? 1 : 1000;
      const max = key === 'port' ? 65535 : 86400000;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw configError(context, `${key} must be an integer from ${min} to ${max}`);
      }
      clean[key] = value;
    } else if (key === 'allowRemote') {
      if (typeof value !== 'boolean') throw configError(context, 'allowRemote must be a JSON boolean');
      clean.allowRemote = value;
    } else {
      if (!Array.isArray(value)) throw configError(context, 'corsOrigins must be an array of origin strings');
      clean.corsOrigins = value.map((origin) => {
        const normalized = normalizeOrigin(origin);
        if (!normalized) throw configError(context, 'corsOrigins must contain exact HTTP(S)/extension origins, null, or supported loopback/extension patterns; no credentials, paths, queries, fragments, or unrestricted wildcards');
        return normalized;
      });
    }
  }
  return clean;
}

function validHost(value) {
  if (typeof value !== 'string' || !value || /\s/.test(value)) return false;
  if (isIP(value)) return true;
  const hostname = value.endsWith('.') ? value.slice(0, -1) : value;
  if (!hostname || hostname.length > 253 || /^[\d.]+$/.test(hostname)) return false;
  return hostname.split('.').every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)
  );
}

function normalizeOrigin(value) {
  if (typeof value !== 'string' || !value || /[\s\u0000-\u001f\u007f]/.test(value)) return '';
  if (ORIGIN_PATTERNS.has(value)) return value;
  if (value.includes('*') || value.includes('\\') || value.includes('@') || value.endsWith(':') || !/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+$/i.test(value)) return '';
  try {
    const url = new URL(value);
    if (!url.hostname) return '';
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    if ((url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') && !url.port && /^[a-z0-9-]+$/i.test(url.hostname)) {
      return `${url.protocol}//${url.host}`;
    }
  } catch (_error) {
    return '';
  }
  return '';
}

function configError(context, reason) {
  const safeContext = String(context).replace(/[\u0000-\u001f\u007f]/g, '?');
  return new Error(`Configuration error: ${safeContext}: ${reason}.`);
}
