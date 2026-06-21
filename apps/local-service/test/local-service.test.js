import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createService, listen } from '../src/index.js';
import { createLevelStore } from '../src/store.js';
import { diagnostics } from '../src/http.js';
import { levelsToDisplayRowsText } from '../src/display-rows.js';

const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const cliHelp = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
assert.match(cliHelp, /RS Levels local service/);
assert.match(cliHelp, /RS_LEVELS_HOST/);
assert.match(cliHelp, /trusted private networks/);
const cliVersion = execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' }).trim();
assert.equal(cliVersion, '0.0.0');

assert.equal(
  levelsToDisplayRowsText([
    { name: 'text SPY Open : 7,559 Liquidity Map horizontal_line', price: 7559, kind: 'open-close' },
    { name: 'Bull Zone Top', price: 7526, kind: 'zone-bull' },
    { name: 'Bear Zone Bottom', price: 7588, kind: 'zone-bear' }
  ]),
  'Open,7559.00,224,224,224,open-close\nBull Zone Top,7526.00,76,175,80,zone-bull\nBear Zone Bottom,7588.00,240,98,146,zone-bear\n'
);

let nowMs = Date.parse('2026-06-20T12:00:00.000Z');
const freshnessStore = createLevelStore({
  staleMs: 1000,
  clock: () => new Date(nowMs)
});
freshnessStore.applyCapture({
  endpoint: '/demo/levels/MES',
  status: 200,
  capturedAt: '2026-06-20T12:00:00.000Z',
  body: {
    symbol: 'MES',
    levels: [{ name: 'OVNHP', price: 7537 }]
  }
});
assert.equal(freshnessStore.getSnapshot().source.state, 'capturing');
assert.equal(freshnessStore.getSnapshot().source.connected, true);
assert.equal(freshnessStore.getSnapshot().source.ageMs, 0);
nowMs += 1500;
const staleSnapshot = freshnessStore.getSnapshot();
assert.equal(staleSnapshot.source.state, 'stale');
assert.equal(staleSnapshot.source.connected, false);
assert.equal(staleSnapshot.source.ageMs, 1500);
const staleDiagnostics = diagnostics(freshnessStore, {
  host: '127.0.0.1',
  requestedHost: '127.0.0.1',
  port: 8765,
  remoteAccess: false,
  corsOrigins: [],
  warnings: []
});
assert.ok(staleDiagnostics.checks.some((check) => check.id === 'source' && check.status === 'warning'));

const emptyCaptureStore = createLevelStore({
  clock: () => new Date('2026-06-20T12:01:00.000Z')
});
emptyCaptureStore.applyCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-06-20T12:01:00.000Z',
  body: { ok: true, rows: [{ name: 'Not display data', value: 123 }] }
});
const emptyCaptureSnapshot = emptyCaptureStore.getSnapshot();
assert.equal(emptyCaptureSnapshot.source.state, 'waiting');
assert.equal(emptyCaptureSnapshot.source.connected, false);
assert.equal(emptyCaptureSnapshot.source.endpoints[0].ok, false);
assert.equal(emptyCaptureStore.flatLevels().length, 0);

const endpointPruneStore = createLevelStore({
  clock: () => new Date('2026-06-20T12:02:00.000Z')
});
endpointPruneStore.applyCapture({
  endpoint: '/demo/levels/MES',
  status: 200,
  capturedAt: '2026-06-20T12:02:00.000Z',
  body: {
    symbol: 'MES',
    levels: [{ name: 'OVNHP', price: 7537 }]
  }
});
assert.equal(endpointPruneStore.flatLevels().length, 1);
endpointPruneStore.applyCapture({
  endpoint: '/demo/levels/MES',
  status: 200,
  capturedAt: '2026-06-20T12:02:01.000Z',
  body: { ok: true, rows: [{ name: 'Not display data', value: 123 }] }
});
assert.equal(endpointPruneStore.flatLevels().length, 0);
assert.equal(endpointPruneStore.getSnapshot().source.state, 'waiting');

const service = createService({
  config: { host: '127.0.0.1', port: 0 }
});
const address = await listen(service);
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const root = await getJson(`${baseUrl}/`);
  assert.ok(root.endpoints.includes('/docs'));
  assert.ok(root.endpoints.includes('/openapi.yaml'));
  assert.ok(root.endpoints.includes('/diagnostics'));
  assert.ok(root.endpoints.includes('/plugins'));
  assert.ok(root.endpoints.includes('/tradingview'));
  assert.equal(root.version, '0.0.0');
  assert.equal(root.build.source, 'source');
  assert.equal(root.build.revision, '');
  assert.equal(service.config.staleMs, 23 * 60 * 60 * 1000);

  const docsPage = await getText(`${baseUrl}/docs`);
  assert.match(docsPage, /RS Levels API Docs/);
  assert.match(docsPage, /OpenAPI YAML spec/);

  const openapiYaml = await getText(`${baseUrl}/openapi.yaml`);
  assert.match(openapiYaml, /openapi: 3\.1\.0/);
  assert.match(openapiYaml, /\/capture\/api:/);

  const swaggerYaml = await getText(`${baseUrl}/swagger.yaml`);
  assert.equal(swaggerYaml, openapiYaml);
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.ok, true, `${baseUrl}/health returned ${healthResponse.status}`);
  assert.equal(healthResponse.headers.get('cache-control'), 'no-store');
  assert.equal(healthResponse.headers.get('x-content-type-options'), 'nosniff');
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.version, '0.0.0');
  assert.equal(health.build.source, 'source');
  assert.equal(health.network.remoteAccess, false);
  assert.equal(health.levelCount, 0);

  const waitingDiagnostics = await getJson(`${baseUrl}/diagnostics`);
  assert.equal(waitingDiagnostics.ok, true);
  assert.equal(waitingDiagnostics.version, '0.0.0');
  assert.equal(waitingDiagnostics.build.source, 'source');
  assert.equal(waitingDiagnostics.source.connected, false);
  assert.equal(waitingDiagnostics.levelCount, 0);
  assert.ok(waitingDiagnostics.checks.some((check) => check.id === 'source' && check.status === 'waiting'));
  assert.ok(health.network.corsOrigins.includes('http://127.0.0.1:*'));

  const loopbackCors = await fetch(`${baseUrl}/health`, { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(loopbackCors.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

  const compactStatus = await getJson(`${baseUrl}/status`);
  assert.equal(compactStatus.version, '0.0.0');
  assert.equal(compactStatus.build.source, 'source');
  assert.equal(compactStatus.symbolCount, 0);
  assert.equal(compactStatus.levelCount, 0);
  assert.deepEqual(compactStatus.symbolSummaries, []);

  const pluginManifest = await getJson(`${baseUrl}/plugins`);
  assert.equal(pluginManifest.schemaVersion, '0.1.0');
  assert.ok(pluginManifest.plugins.some((plugin) => plugin.id === 'tradingview'));
  assert.ok(pluginManifest.plugins.every((plugin) => plugin.displayOnly === true));

  const extensionCors = await fetch(`${baseUrl}/health`, { headers: { Origin: 'chrome-extension://abcdefghijklmnop' } });
  assert.equal(extensionCors.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnop');

  const fileCors = await fetch(`${baseUrl}/health`, { headers: { Origin: 'null' } });
  assert.equal(fileCors.headers.get('access-control-allow-origin'), 'null');

  const blockedCors = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://example.com' } });
  assert.equal(blockedCors.headers.get('access-control-allow-origin'), null);

  const capturedAt = new Date().toISOString();
  const captureResponse = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/platform/api/v1/ddbands/MES',
    status: 200,
    capturedAt,
    body: JSON.stringify({
      symbol: 'MES',
      levels: [
        { name: 'OVNHP', price: 7537, color: [41, 98, 255] },
        { label: 'DD Upper', value: 7579.75, color: '#29b6f6' }
      ]
    })
  });
  assert.equal(captureResponse.ok, true);
  assert.equal(captureResponse.snapshot.symbols.MES.levels.length, 2);

  const captureDiagnostics = await getJson(`${baseUrl}/diagnostics`);
  assert.equal(captureDiagnostics.source.connected, true);
  assert.equal(captureDiagnostics.levelCount, 2);
  assert.deepEqual(captureDiagnostics.symbolSummaries.map((row) => [row.symbol, row.levelCount]), [['ES', 2]]);
  assert.equal(captureDiagnostics.source.endpointCount, 1);
  assert.equal(captureDiagnostics.source.endpoints[0].key, '/platform/api/v1/ddbands/MES');
  assert.equal(Object.hasOwn(captureDiagnostics.source.endpoints[0], 'url'), false);
  assert.ok(captureDiagnostics.checks.some((check) => check.id === 'levels' && check.status === 'ok'));

  const snapshotAfterCapture = await getJson(`${baseUrl}/snapshot`);
  assert.equal(Object.hasOwn(snapshotAfterCapture.source.endpoints[0], 'url'), false);

  const healthAfterCapture = await getJson(`${baseUrl}/health`);
  assert.equal(Object.hasOwn(healthAfterCapture.source.endpoints[0], 'url'), false);

  const levels = await getJson(`${baseUrl}/levels/MES`);
  assert.equal(levels.symbol, 'ES');
  assert.equal(levels.displaySymbol, 'ES');
  assert.equal(levels.levels[0].symbol, 'ES');
  assert.match(levels.levels[0].id, /^ES:/);
  assert.equal(levels.levels[1].kind, 'dd-band');

  const statusAfterCapture = await getJson(`${baseUrl}/status`);
  assert.equal(statusAfterCapture.symbolCount, 1);
  assert.equal(statusAfterCapture.levelCount, 2);
  assert.deepEqual(statusAfterCapture.symbols, ['ES']);
  assert.equal(statusAfterCapture.symbolSummaries[0].symbol, 'ES');
  assert.equal(statusAfterCapture.symbolSummaries[0].displaySymbol, 'ES');
  assert.equal(statusAfterCapture.symbolSummaries[0].levelCount, 2);
  assert.equal(statusAfterCapture.symbolSummaries[0].capturedAt, capturedAt);

  const aliasLevels = await getJson(`${baseUrl}/levels/ES`);
  assert.equal(aliasLevels.symbol, 'ES');

  const cqgEsLevels = await getJson(`${baseUrl}/levels/F.US.EPU26`);
  assert.equal(cqgEsLevels.symbol, 'ES');

  const text = await getText(`${baseUrl}/levels/MES?format=rows`);
  assert.match(text, /OVNHP,7537\.00,41,98,255/);
  assert.match(text, /OVNHP,7537\.00,41,98,255,hp/);
  const rowsText = await getText(`${baseUrl}/levels/ES?format=rows`);
  assert.equal(rowsText, text);

  const tradingViewResponse = await fetch(`${baseUrl}/tradingview/ES`);
  assert.equal(tradingViewResponse.ok, true, `${baseUrl}/tradingview/ES returned ${tradingViewResponse.status}`);
  assert.equal(tradingViewResponse.headers.get('cache-control'), 'no-store');
  const tradingViewJson = await tradingViewResponse.json();
  assert.equal(tradingViewJson.exportFormat, 'tradingview-json');
  assert.equal(tradingViewJson.payloadVersion, 1);
  assert.equal(tradingViewJson.symbol, 'ES');
  assert.equal(Object.hasOwn(tradingViewJson, 'compactPayload'), false);
  assert.equal(Object.hasOwn(tradingViewJson, 'notes'), false);
  assert.equal(tradingViewJson.levels.length, 2);
  assert.deepEqual(tradingViewJson.levels[0], ['OVNHP', 7537, 'hp']);
  const ddbands = await getJson(`${baseUrl}/ddbands`);
  assert.equal(ddbands.levels.length, 1);

  const replacementCapture = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/platform/api/v1/ddbands/MES',
    status: 200,
    capturedAt,
    body: {
      symbol: 'MES',
      levels: [
        { name: 'DD Lower', price: 7498.25, color: '#29b6f6' }
      ]
    }
  });
  assert.equal(replacementCapture.snapshot.symbols.MES.levels.length, 1);
  assert.equal(replacementCapture.snapshot.symbols.MES.levels[0].name, 'DD Lower');

  const combinedCapture = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/platform/api/v1/chart/display',
    status: 200,
    capturedAt,
    body: {
      levels: {
        'F.US.EPU26': {
          bullZones: [{ index: 1, top: 7580, bottom: 7560 }]
        },
        'F.US.ENQU26': {
          bearZones: [{ index: 1, top: 30450, bottom: 30412 }]
        }
      }
    }
  });
  assert.equal(combinedCapture.snapshot.symbols.MES.levels.some((level) => level.kind === 'zone-bull'), true);
  assert.equal(combinedCapture.snapshot.symbols.MNQ.levels.some((level) => level.kind === 'zone-bear'), true);

  const multiSymbolStatus = await getJson(`${baseUrl}/status`);
  assert.deepEqual(multiSymbolStatus.symbols, ['ES', 'NQ']);
  assert.equal(multiSymbolStatus.symbolSummaries.find((row) => row.symbol === 'ES').levelCount, 3);
  assert.equal(multiSymbolStatus.symbolSummaries.find((row) => row.symbol === 'NQ').levelCount, 2);

  const bundledTradingViewJson = await getJson(`${baseUrl}/tradingview`);
  assert.equal(bundledTradingViewJson.exportFormat, 'tradingview-bundle-json');
  assert.equal(bundledTradingViewJson.payloadVersion, 2);
  assert.equal(Object.hasOwn(bundledTradingViewJson, 'compactPayload'), false);
  assert.equal(Object.hasOwn(bundledTradingViewJson, 'notes'), false);
  assert.deepEqual(bundledTradingViewJson.symbols.map((row) => row.symbol), ['ES', 'NQ']);
  assert.equal(bundledTradingViewJson.symbols.find((row) => row.symbol === 'ES').levels.some((row) => row[0] === 'BZT1' && row[2] === 'zone-bull'), true);
  assert.equal(bundledTradingViewJson.symbols.find((row) => row.symbol === 'NQ').levels.some((row) => row[0] === 'BrZT1' && row[2] === 'zone-bear'), true);

  const mesRowsWithKinds = await getText(`${baseUrl}/levels/MES?format=rows`);
  assert.match(mesRowsWithKinds, /BZT1,7580\.00,76,175,80,zone-bull/);
  assert.match(mesRowsWithKinds, /BZB1,7560\.00,76,175,80,zone-bull/);

  const mnqTradingViewJson = await getJson(`${baseUrl}/tradingview/MNQ`);
  assert.equal(mnqTradingViewJson.symbol, 'NQ');
  assert.equal(mnqTradingViewJson.levels.some((row) => row[0] === 'BrZT1' && row[2] === 'zone-bear'), true);

  const cqgNqLevels = await getJson(`${baseUrl}/levels/F.US.ENQU26`);
  assert.equal(cqgNqLevels.symbol, 'NQ');

  const zones = await getJson(`${baseUrl}/zones`);
  assert.equal(zones.levels.length, 4);
  assert.equal(zones.levels.some((level) => level.kind === 'zone-bull'), true);
  assert.equal(zones.levels.some((level) => level.kind === 'zone-bear'), true);

  const remoteService = createService({
    config: { host: '0.0.0.0', port: 0, allowRemote: false }
  });
  assert.equal(remoteService.config.host, '127.0.0.1');
  assert.equal(remoteService.config.remoteAccess, false);
  assert.equal(remoteService.config.warnings.length, 1);

  const tailscaleService = createService({
    config: { host: '0.0.0.0', port: 0, allowRemote: true }
  });
  assert.equal(tailscaleService.config.host, '0.0.0.0');
  assert.equal(tailscaleService.config.remoteAccess, true);

  const customCorsService = createService({
    config: { host: '127.0.0.1', port: 0, corsOrigins: ['https://dashboard.example'] }
  });
  assert.deepEqual(customCorsService.config.corsOrigins, ['https://dashboard.example']);

  const staleConfigService = createService({
    config: { host: '127.0.0.1', port: 0, staleMs: 2500 }
  });
  assert.equal(staleConfigService.config.staleMs, 2500);

  console.log('local service tests passed');
} finally {
  await new Promise((resolve) => service.server.close(resolve));
}

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.text();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.json();
}
