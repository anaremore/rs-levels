import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, networkStatus } from '../src/config.js';
import { loadConfigFile, validateSavedConfig } from '../src/config-file.js';
import { createService, listen } from '../src/index.js';

const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const rootPath = fileURLToPath(new URL('../../../', import.meta.url));
const defaults = loadConfig({});
assert.equal(defaults.host, '127.0.0.1');
assert.equal(defaults.port, 8765);
assert.equal(defaults.allowRemote, false);
assert.equal(defaults.remoteAccess, false);
assert.equal(defaults.staleMs, 82800000);
assert.deepEqual(defaults.warnings, []);

const saved = {
  host: 'localhost', port: 9011, allowRemote: true,
  corsOrigins: ['https://saved.example'], staleMs: 5000
};
assert.deepEqual(validateSavedConfig({}), {});
assert.deepEqual(validateSavedConfig(saved), saved);
assert.equal(loadConfig({}, {}, saved).port, 9011);
assert.equal(loadConfig({}, {}, saved).host, 'localhost');
assert.equal(loadConfig({}, {}, saved).staleMs, 5000);
assert.deepEqual(loadConfig({}, {}, saved).corsOrigins, ['https://saved.example']);
assert.equal(loadConfig({}, {}, saved).allowRemote, true);
assert.equal(loadConfig({}, {}, saved).remoteAccess, false);

const envSettings = {
  RS_LEVELS_HOST: '::1', RS_LEVELS_PORT: '9012', RS_LEVELS_ALLOW_REMOTE: 'false',
  RS_LEVELS_CORS_ORIGINS: 'https://env.example', RS_LEVELS_STALE_MS: '6000'
};
const envWins = loadConfig(envSettings, {}, saved);
assert.equal(envWins.host, '::1');
assert.equal(envWins.port, 9012);
assert.equal(envWins.allowRemote, false);
assert.deepEqual(envWins.corsOrigins, ['https://env.example']);
assert.equal(envWins.staleMs, 6000);
const overrideWins = loadConfig(envSettings, {
  host: '127.0.0.1', port: '9013', allowRemote: true,
  corsOrigins: ['https://override.example'], staleMs: '7000'
}, saved);
assert.equal(overrideWins.host, '127.0.0.1');
assert.equal(overrideWins.port, 9013);
assert.equal(overrideWins.allowRemote, true);
assert.deepEqual(overrideWins.corsOrigins, ['https://override.example']);
assert.equal(overrideWins.staleMs, 7000);
assert.equal(loadConfig({ RS_LEVELS_PORT: '0' }, {}, saved).port, 0);
assert.equal(loadConfig(envSettings, { port: 0 }, saved).port, 0);
const nullishOverrides = loadConfig(envSettings, {
  port: null, staleMs: undefined, allowRemote: null, corsOrigins: undefined
}, saved);
assert.equal(nullishOverrides.port, 9012);
assert.equal(nullishOverrides.staleMs, 6000);
assert.equal(nullishOverrides.allowRemote, false);
assert.deepEqual(nullishOverrides.corsOrigins, ['https://env.example']);

const blankEnv = loadConfig({
  RS_LEVELS_HOST: '', RS_LEVELS_PORT: '', RS_LEVELS_ALLOW_REMOTE: '',
  RS_LEVELS_CORS_ORIGINS: '', RS_LEVELS_STALE_MS: ''
}, {}, saved);
assert.equal(blankEnv.host, defaults.host);
assert.equal(blankEnv.port, defaults.port);
assert.equal(blankEnv.allowRemote, false);
assert.equal(blankEnv.staleMs, defaults.staleMs);
assert.deepEqual(blankEnv.corsOrigins, defaults.corsOrigins);
assert.deepEqual(loadConfig({}, { corsOrigins: [] }, saved).corsOrigins, defaults.corsOrigins);
assert.deepEqual(loadConfig({}, {}, { corsOrigins: [] }).corsOrigins, defaults.corsOrigins);
assert.deepEqual(loadConfig({ RS_LEVELS_CORS_ORIGINS: 'https://one.example, https://two.example' }).corsOrigins,
  ['https://one.example', 'https://two.example']);
for (const truthy of [true, '1', 'true', 'yes', 'TRUE']) {
  assert.equal(loadConfig({}, { allowRemote: truthy }).allowRemote, true);
}
for (const falsy of [false, '0', 'false', 'no']) {
  assert.equal(loadConfig({}, { allowRemote: falsy }, { allowRemote: true }).allowRemote, false);
}
for (const [envKey, configKey, invalidValue] of [
  ['RS_LEVELS_PORT', 'port', '70000'],
  ['RS_LEVELS_PORT', 'port', 'not-a-port'],
  ['RS_LEVELS_STALE_MS', 'staleMs', '12'],
  ['RS_LEVELS_ALLOW_REMOTE', 'allowRemote', 'not-a-boolean']
]) {
  const result = loadConfig({ [envKey]: invalidValue }, {}, saved);
  assert.equal(result[configKey], defaults[configKey]);
  assert.ok(result.warnings.some((warning) => new RegExp(configKey, 'i').test(warning)), `${configKey} fallback should warn`);
  assert.ok(result.warnings.every((warning) => !warning.includes(invalidValue)), 'Warnings must not echo invalid values');
}

for (const host of ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::', 'service.example', '192.168.1.12']) {
  assert.equal(validateSavedConfig({ host }).host, host);
}
for (const port of [1, 65535]) assert.equal(validateSavedConfig({ port }).port, port);
for (const staleMs of [1000, 86400000]) assert.equal(validateSavedConfig({ staleMs }).staleMs, staleMs);
const validOrigins = [
  ...defaults.corsOrigins, 'https://dashboard.example', 'http://192.168.1.12:9000',
  'http://[::1]:8765', 'chrome-extension://abcdefghijklmnop', 'moz-extension://test-extension'
];
assert.deepEqual(validateSavedConfig({ corsOrigins: validOrigins }).corsOrigins, validOrigins);
assert.deepEqual(validateSavedConfig({ corsOrigins: ['HTTPS://Dashboard.Example:443'] }).corsOrigins,
  ['https://dashboard.example']);

for (const [key, invalidValues] of [
  ['host', [null, true, 123, '', ' ', ' localhost', 'localhost ', 'https://localhost', 'localhost:8765',
    '[::1]', 'localhost/path', 'local_host', '-localhost', 'localhost-', 'localhost\n', '999.999.999.999']],
  ['port', [null, true, '8765', 0, -1, 65536, 1.5]],
  ['allowRemote', [null, 1, 'true', 'false', [], {}]],
  ['staleMs', [null, true, '1000', 999, 86400001, 1000.5]],
  ['corsOrigins', [null, 'https://example.com', {}, [null], [1], [''], ['*'], ['https://*'],
    ['https://example.com/*'], ['https://example.com/path'], ['https://user:credential@example.com'],
    ['https://@example.com'], ['https://:@example.com'], ['https://example.com:'],
    ['chrome-extension://@id'], ['chrome-extension://id:'], ['chrome-extension://.'],
    ['https://example.com?private=value'], ['https://example.com#fragment'], ['ftp://example.com'],
    ['https://example.com:*'], ['https://example.com\\path'], ['chrome-extension://id/path'], ['moz-extension://*/*']]]
]) {
  for (const value of invalidValues) {
    assert.throws(() => validateSavedConfig({ [key]: value }), new RegExp(key, 'i'), `${key} must reject ${JSON.stringify(value)}`);
  }
}
for (const root of [null, [], true, 42, 'configuration']) {
  assert.throws(() => validateSavedConfig(root), /object/i);
}
assert.throws(() => validateSavedConfig({ apiKey: 'private-test-marker' }), /apiKey/i);
assert.throws(() => validateSavedConfig(JSON.parse('{"__proto__":{"host":"0.0.0.0"}}')), /unknown|__proto__/i);
assert.throws(() => loadConfig({ RS_LEVELS_PORT: '9012' }, { port: 9013 }, { port: 'invalid-saved-marker' }), /port/i);
assert.throws(() => createService({ env: {}, config: { port: 0 }, savedConfig: { apiKey: 'private-test-marker' } }), /apiKey/i);
const serviceConfig = createService({ env: { RS_LEVELS_PORT: '9012' }, config: { port: 0 }, savedConfig: saved });
assert.equal(serviceConfig.config.host, 'localhost');
assert.equal(serviceConfig.config.port, 0);
assert.equal(serviceConfig.config.staleMs, 5000);

for (const host of ['127.0.0.1', 'localhost', '::1']) {
  const config = loadConfig({}, {}, { host });
  assert.equal(config.host, host);
  assert.equal(config.remoteAccess, false);
  assert.deepEqual(config.warnings, []);
}
for (const host of ['0.0.0.0', '::', '192.168.1.12', 'service.example']) {
  for (const allowRemote of [undefined, false, true]) {
    const config = loadConfig({}, {}, { host, ...(allowRemote === undefined ? {} : { allowRemote }) });
    assert.equal(config.host, allowRemote === true ? host : '127.0.0.1');
    assert.equal(config.requestedHost, host);
    assert.equal(config.remoteAccess, allowRemote === true);
    assert.ok(config.warnings.length > 0);
    if (allowRemote === true) assert.match(config.warnings.join(' '), /trusted private network/i);
  }
  for (const [env, overrides] of [
    [{ RS_LEVELS_ALLOW_REMOTE: 'false' }, {}],
    [{ RS_LEVELS_ALLOW_REMOTE: 'true' }, { allowRemote: false }]
  ]) {
    const config = loadConfig(env, overrides, { host, allowRemote: true });
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.remoteAccess, false);
  }
}
for (const [env, overrides] of [
  [{ RS_LEVELS_HOST: ' ' }, { allowRemote: true }],
  [{}, { host: ' ', allowRemote: true }],
  [{ RS_LEVELS_HOST: '', RS_LEVELS_ALLOW_REMOTE: 'true' }, {}]
]) {
  const config = loadConfig(env, overrides, { host: '0.0.0.0', allowRemote: true });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.remoteAccess, false);
}
assert.equal(loadConfig({}, {}, { allowRemote: true }).host, '127.0.0.1');
const corsOnly = loadConfig({}, {}, { corsOrigins: ['https://dashboard.example'] });
assert.equal(corsOnly.host, '127.0.0.1');
assert.equal(corsOnly.remoteAccess, false);
assert.equal(Object.hasOwn(networkStatus(corsOnly), 'configPath'), false);

const fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'rs-levels-config-test-'));
const ownedChildren = new Set();
try {
  const configPath = path.join(fixtureDir, 'saved settings.json');
  await writeFile(configPath, '\uFEFF' + JSON.stringify(saved));
  assert.deepEqual(await loadConfigFile(configPath), saved);
  await assert.rejects(async () => loadConfigFile(path.join(fixtureDir, 'missing.json')), /config|file|read/i);
  await assert.rejects(async () => loadConfigFile(fixtureDir), /config|file|read/i);

  for (const contents of [
    '{ "port": 8765, "private-test-marker"',
    JSON.stringify({ port: 'private-test-marker' }),
    JSON.stringify({ apiKey: 'private-test-marker' })
  ]) {
    await writeFile(configPath, contents);
    await assert.rejects(async () => loadConfigFile(configPath), (error) => {
      assert.doesNotMatch(error.message, /private-test-marker/);
      return true;
    });
    const failure = runCli(['--config', configPath]);
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /config|port|apiKey/i);
    assert.doesNotMatch(failure.stdout + failure.stderr, /private-test-marker|Ready\.|API: http|SyntaxError|at file:/);
  }
  for (const args of [
    ['--config'], ['--config='], ['--config', '--versionless'],
    ['--config', configPath, '--config=' + configPath], ['--unexpected'],
    ['--config', path.join(fixtureDir, 'missing.json')], ['--config', fixtureDir]
  ]) {
    const failure = runCli(args);
    assert.notEqual(failure.status, 0, `Expected CLI failure: ${args.join(' ')}`);
    assert.doesNotMatch(failure.stdout + failure.stderr, /Ready\.|API: http|at file:/);
  }
  for (const flag of ['--help', '-h', '--version', '-v']) {
    const info = runCli(['--config', path.join(fixtureDir, 'missing.json'), flag]);
    assert.equal(info.status, 0);
    assert.doesNotMatch(info.stdout + info.stderr, /ENOENT|Could not read|Cannot read/i);
  }
  assert.match(runCli(['--help']).stdout, /--config/);

  await writeFile(configPath, JSON.stringify({ port: 9011, staleMs: 4000, corsOrigins: ['https://saved.example'] }));
  const contentBeforeStarts = await readFile(configPath, 'utf8');
  for (const args of [['--config', configPath], ['--config=' + configPath]]) {
    const child = await startCli(args);
    try {
      const health = await getHealth(child.url);
      assert.equal(health.network.host, '127.0.0.1');
      assert.equal(health.network.remoteAccess, false);
      assert.deepEqual(health.network.corsOrigins, ['https://saved.example']);
      assert.equal(health.network.port, 0, 'Environment port 0 must override the saved port');
      assert.doesNotMatch(JSON.stringify(health), /saved settings\.json|rs-levels-config-test-/);
      const allowed = await fetch(child.url + '/health', { headers: { Origin: 'https://saved.example' }, signal: AbortSignal.timeout(3000) });
      assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://saved.example');
      const defaultReplaced = await fetch(child.url + '/health', { headers: { Origin: 'chrome-extension://abcdefghijklmnop' }, signal: AbortSignal.timeout(3000) });
      assert.equal(defaultReplaced.headers.get('access-control-allow-origin'), null);
    } finally {
      await stopChild(child.process);
    }
  }
  assert.equal(await readFile(configPath, 'utf8'), contentBeforeStarts, 'Startup must not rewrite saved settings');

  const portProbe = createServer();
  await new Promise((resolve, reject) => {
    portProbe.once('error', reject);
    portProbe.listen(0, '127.0.0.1', resolve);
  });
  const savedPort = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  await writeFile(configPath, JSON.stringify({ host: '127.0.0.1', port: savedPort, corsOrigins: ['https://saved.example'] }));
  for (let restart = 0; restart < 2; restart += 1) {
    const fileOnly = await startCli(['--config', configPath], { env: { RS_LEVELS_HOST: undefined, RS_LEVELS_PORT: undefined } });
    try {
      assert.equal(fileOnly.url, `http://127.0.0.1:${savedPort}`);
      const health = await getHealth(fileOnly.url);
      assert.equal(health.network.port, savedPort);
      assert.deepEqual(health.network.corsOrigins, ['https://saved.example']);
    } finally {
      await stopChild(fileOnly.process);
    }
  }

  const running = await startCli(['--config', configPath]);
  try {
    await writeFile(configPath, JSON.stringify({ corsOrigins: ['https://edited.example'] }));
    assert.deepEqual((await getHealth(running.url)).network.corsOrigins, ['https://saved.example']);
  } finally {
    await stopChild(running.process);
  }
  const restarted = await startCli(['--config', configPath]);
  try {
    assert.deepEqual((await getHealth(restarted.url)).network.corsOrigins, ['https://edited.example']);
  } finally {
    await stopChild(restarted.process);
  }
  const legacy = await startCli([]);
  try {
    const health = await getHealth(legacy.url);
    assert.equal(health.network.host, defaults.host);
    assert.equal(health.network.remoteAccess, false);
    assert.deepEqual(health.network.corsOrigins, defaults.corsOrigins);
    for (const origin of ['http://localhost:5173', 'chrome-extension://abcdefghijklmnop', 'null']) {
      const response = await fetch(legacy.url + '/health', { headers: { Origin: origin }, signal: AbortSignal.timeout(3000) });
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
    const response = await fetch(legacy.url + '/health', { headers: { Origin: 'https://unlisted.example' }, signal: AbortSignal.timeout(3000) });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    await stopChild(legacy.process);
  }

  const relative = await startCli(['--config', path.basename(configPath)], { cwd: fixtureDir });
  try {
    assert.deepEqual((await getHealth(relative.url)).network.corsOrigins, ['https://edited.example']);
  } finally {
    await stopChild(relative.process);
  }

  await writeFile(configPath, JSON.stringify({ host: '0.0.0.0' }));
  const guarded = await startCli(['--config', configPath], { env: { RS_LEVELS_HOST: undefined } });
  try {
    const health = await getHealth(guarded.url);
    assert.equal(health.network.host, '127.0.0.1');
    assert.equal(health.network.requestedHost, '0.0.0.0');
    assert.equal(health.network.remoteAccess, false);
    assert.ok(health.network.warnings.length > 0);
  } finally {
    await stopChild(guarded.process);
  }

  await writeFile(configPath, JSON.stringify({ port: 'invalid-port-marker' }));
  for (const [command, args] of wrapperCommands(configPath)) {
    const failure = runCommand(command, args);
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /port/i, 'Launch wrappers must forward a config path containing spaces');
    assert.doesNotMatch(failure.stdout + failure.stderr, /invalid-port-marker/);
  }

  const occupied = createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  try {
    const failure = runCli([], { RS_LEVELS_PORT: String(occupied.address().port) });
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /already in use|occupied|EADDRINUSE/i);
    assert.doesNotMatch(failure.stderr, /at file:/);
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }

  const customService = createService({ env: {}, config: { port: 0 }, savedConfig: { corsOrigins: [] } });
  const address = await listen(customService);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`, { headers: { Origin: 'null' }, signal: AbortSignal.timeout(3000) });
    assert.equal(response.headers.get('access-control-allow-origin'), 'null');
  } finally {
    await new Promise((resolve) => customService.server.close(resolve));
  }
  console.log('saved service configuration tests passed');
} finally {
  for (const child of ownedChildren) await stopChild(child);
  const resolvedDir = path.resolve(fixtureDir);
  assert.equal(path.dirname(resolvedDir), path.resolve(os.tmpdir()), 'Cleanup must stay in the temp directory');
  assert.match(path.basename(resolvedDir), /^rs-levels-config-test-/);
  await rm(resolvedDir, { recursive: true, force: true });
}

function cleanEnvironment(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('RS_LEVELS_')) delete env[key];
  Object.assign(env, { RS_LEVELS_HOST: '127.0.0.1', RS_LEVELS_PORT: '0' }, overrides);
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return env;
}

function runCli(args, envOverrides = {}) {
  return runCommand(process.execPath, [cliPath, ...args], envOverrides);
}

function runCommand(command, args, envOverrides = {}) {
  try {
    return { status: 0, stdout: execFileSync(command, args, {
      encoding: 'utf8', env: cleanEnvironment(envOverrides), timeout: 7000,
      windowsHide: true, windowsVerbatimArguments: command === 'cmd.exe', stdio: 'pipe'
    }), stderr: '' };
  } catch (error) {
    if (error.code === 'ETIMEDOUT') throw error;
    return { status: error.status, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') };
  }
}

function wrapperCommands(configPath) {
  if (process.platform === 'win32') {
    const cmdPath = path.join(rootPath, 'scripts', 'start-local-service.cmd');
    const psPath = path.join(rootPath, 'scripts', 'start-local-service.ps1');
    return [
      ['cmd.exe', ['/d', '/s', '/c', `""${cmdPath}" --config "${configPath}""`]],
      ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath, '--config', configPath]]
    ];
  }
  return [['sh', [path.join(rootPath, 'scripts', 'start-local-service.sh'), '--config', configPath]]];
}

async function startCli(args, options = {}) {
  const child = spawn(process.execPath, [cliPath, ...args], { env: cleanEnvironment(options.env), cwd: options.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  ownedChildren.add(child);
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Service startup timed out: ${output}`)), 7000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Service exited before ready (${code}): ${output}`)); });
      function collect(chunk) {
        output += chunk.toString();
        const match = output.match(/API: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      }
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
    });
    await getHealth(url);
    return { process: child, url };
  } catch (error) {
    await stopChild(child);
    throw error;
  }
}

async function stopChild(child) {
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Service did not stop within five seconds')); }, 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      child.kill('SIGTERM');
    });
  }
  ownedChildren.delete(child);
}

async function getHealth(url) {
  const response = await fetch(url + '/health', { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  return response.json();
}
