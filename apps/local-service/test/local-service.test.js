import assert from 'node:assert/strict';
import { createService, listen } from '../src/index.js';

const service = createService({
  config: { host: '127.0.0.1', port: 0 }
});
const address = await listen(service);
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const health = await getJson(`${baseUrl}/health`);
  assert.equal(health.ok, true);
  assert.equal(health.network.remoteAccess, false);
  assert.equal(health.levelCount, 0);

  const captureResponse = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/platform/api/v1/ddbands/MES',
    status: 200,
    capturedAt: '2026-06-19T14:29:59.500Z',
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

  const levels = await getJson(`${baseUrl}/levels/MES`);
  assert.equal(levels.symbol, 'MES');
  assert.equal(levels.levels[1].kind, 'dd-band');

  const aliasLevels = await getJson(`${baseUrl}/levels/ES`);
  assert.equal(aliasLevels.symbol, 'MES');

  const text = await getText(`${baseUrl}/levels/MES?format=sierra`);
  assert.match(text, /OVNHP,7537\.00,41,98,255/);

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

