export function loadConfig(env = process.env, overrides = {}) {
  const host = stringValue(overrides.host || env.RS_LEVELS_HOST || '127.0.0.1');
  const port = numberInRange(overrides.port || env.RS_LEVELS_PORT, 1, 65535, 8765);
  const allowRemote = booleanValue(overrides.allowRemote ?? env.RS_LEVELS_ALLOW_REMOTE);
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
    warnings
  };
}

export function networkStatus(config) {
  return {
    host: config.host,
    requestedHost: config.requestedHost,
    port: config.port,
    remoteAccess: config.remoteAccess,
    warnings: config.warnings
  };
}

function numberInRange(value, min, max, fallback) {
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

