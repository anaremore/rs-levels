import assert from 'node:assert/strict';
import { createService, listen } from '../src/index.js';
import { createLevelStore } from '../src/store.js';
import { diagnostics } from '../src/http.js';

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

  const docsPage = await getText(`${baseUrl}/docs`);
  assert.match(docsPage, /RS Levels API Docs/);
  assert.match(docsPage, /OpenAPI YAML spec/);

  const openapiYaml = await getText(`${baseUrl}/openapi.yaml`);
  assert.match(openapiYaml, /openapi: 3\.1\.0/);
  assert.match(openapiYaml, /\/capture\/api:/);

  const swaggerYaml = await getText(`${baseUrl}/swagger.yaml`);
  assert.equal(swaggerYaml, openapiYaml);
  const health = await getJson(`${baseUrl}/health`);
  assert.equal(health.ok, true);
  assert.equal(health.network.remoteAccess, false);
  assert.equal(health.levelCount, 0);

  const waitingDiagnostics = await getJson(`${baseUrl}/diagnostics`);
  assert.equal(waitingDiagnostics.ok, true);
  assert.equal(waitingDiagnostics.source.connected, false);
  assert.equal(waitingDiagnostics.levelCount, 0);
  assert.ok(waitingDiagnostics.checks.some((check) => check.id === 'source' && check.status === 'waiting'));
  assert.ok(health.network.corsOrigins.includes('http://127.0.0.1:*'));

  const loopbackCors = await fetch(`${baseUrl}/health`, { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(loopbackCors.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

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
  assert.equal(captureDiagnostics.source.endpointCount, 1);
  assert.equal(captureDiagnostics.source.endpoints[0].key, '/platform/api/v1/ddbands/MES');
  assert.equal(Object.hasOwn(captureDiagnostics.source.endpoints[0], 'url'), false);
  assert.ok(captureDiagnostics.checks.some((check) => check.id === 'levels' && check.status === 'ok'));

  const levels = await getJson(`${baseUrl}/levels/MES`);
  assert.equal(levels.symbol, 'MES');
  assert.equal(levels.levels[1].kind, 'dd-band');

  const aliasLevels = await getJson(`${baseUrl}/levels/ES`);
  assert.equal(aliasLevels.symbol, 'MES');

  const text = await getText(`${baseUrl}/levels/MES?format=sierra`);
  assert.match(text, /OVNHP,7537\.00,41,98,255/);

  const tradingViewPayload = await getText(`${baseUrl}/tradingview/ES`);
  assert.equal(tradingViewPayload, `RSLEVELS|1|MES|${capturedAt}|OVNHP,7537.00,hp;DD Upper,7579.75,dd-band`);

  const tradingViewJson = await getJson(`${baseUrl}/tradingview/MES?format=json`);
  assert.equal(tradingViewJson.exportFormat, 'tradingview-json');
  assert.equal(tradingViewJson.levels.length, 2);
  const ddbands = await getJson(`${baseUrl}/ddbands`);
  assert.equal(ddbands.levels.length, 1);

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
