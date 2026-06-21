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
    { name: 'Yellow Line', price: 7598, kind: 'yellow-line' },
    { name: 'Red Line', price: 7520, kind: 'red-line' },
    { name: 'CAT', price: 31232.74, kind: 'cat' },
    { name: 'Bull Zone Top', price: 7526, kind: 'zone-bull' },
    { name: 'Bear Zone Bottom', price: 7588, kind: 'zone-bear' }
  ]),
  'Open,7559.00,255,255,255,open-close\nYellow Line,7598.00,255,235,59,yellow-line\nRed Line,7520.00,242,54,69,red-line\nCAT,31232.74,126,87,194,cat\nBull Zone Top,7526.00,76,175,80,zone-bull\nBear Zone Bottom,7588.00,240,98,146,zone-bear\n'
);
assert.equal(levelsToDisplayRowsText([]), '\n');

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

const statsOnlyStore = createLevelStore({
  clock: () => new Date('2026-06-20T12:02:02.000Z')
});
statsOnlyStore.applyCapture({
  endpoint: '/demo/levels/MES',
  status: 200,
  capturedAt: '2026-06-20T12:02:02.000Z',
  body: {
    symbol: 'MES',
    levels: [{ name: 'OVNHP', price: 7537 }]
  }
});
statsOnlyStore.applyCapture({
  endpoint: '/page-reader/display',
  status: 200,
  capturedAt: '2026-06-20T12:02:03.000Z',
  body: {
    stats: {
      ES: { dd: 0, mapCode: 'BLD' }
    }
  }
});
assert.equal(statsOnlyStore.flatLevels().length, 1);
assert.equal(statsOnlyStore.getSnapshot().symbols.MES.stats.dd, 0);
assert.equal(statsOnlyStore.getSnapshot().symbols.MES.stats.mapCode, 'BLD');
assert.equal(statsOnlyStore.getSnapshot().source.state, 'capturing');

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

  const emptyLevelRows = await getText(`${baseUrl}/levels/MES?format=rows`);
  assert.equal(emptyLevelRows, '\n');
  const emptyStatsRows = await getText(`${baseUrl}/stats/MES?format=rows`);
  assert.equal(emptyStatsRows, '\n');
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

  service.store.replaceSnapshot({
    schemaVersion: '0.1.0',
    generatedAt: '2026-06-20T12:03:00.000Z',
    capturedAt: '2026-06-20T12:03:00.000Z',
    source: { state: 'waiting', connected: false, lastCaptureAt: '', ageMs: null, endpoints: [], warnings: [] },
    symbols: {
      MES: {
        symbol: 'MES',
        displaySymbol: 'MES',
        price: null,
        capturedAt: '2026-06-20T12:03:00.000Z',
        levels: [],
        stats: {},
        warnings: []
      }
    },
    warnings: []
  });
  const emptyTradingViewResponse = await fetch(`${baseUrl}/tradingview/ES`);
  assert.equal(emptyTradingViewResponse.status, 404);
  assert.match(await emptyTradingViewResponse.text(), /no levels found/);
  const emptyStats = await getJson(`${baseUrl}/stats`);
  assert.deepEqual(emptyStats.symbols, []);

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
  assert.match(tradingViewResponse.headers.get('content-type') || '', /text\/plain/);
  const tradingViewPayload = await tradingViewResponse.text();
  assert.match(tradingViewPayload, /^RSLEVELS\|2\|[^|]+\|ES\|/);
  assert.match(tradingViewPayload, /OVNHP,7537,hp/);
  assert.doesNotMatch(tradingViewPayload, /tradingview-json|compactPayload|notes/);
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

  const manualLineCapture = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/page-reader/display',
    status: 200,
    capturedAt,
    body: {
      source: 'page-reader',
      levels: [
        { symbol: 'F.US.EPU26', name: 'Yellow Line', price: 7598, kind: 'yellow-line', color: '#ffeb3b' },
        { symbol: 'F.US.EPU26', name: 'Red Line', price: 7520, kind: 'red-line', color: '#f23645' },
        { symbol: 'F.US.ENQU26', name: 'CAT', price: 31232.74, kind: 'cat', color: '#7e57c2' }
      ]
    }
  });
  assert.equal(manualLineCapture.snapshot.symbols.MES.levels.some((level) => level.kind === 'yellow-line'), true);
  assert.equal(manualLineCapture.snapshot.symbols.MES.levels.some((level) => level.kind === 'red-line'), true);
  assert.equal(manualLineCapture.snapshot.symbols.MNQ.levels.some((level) => level.kind === 'cat'), true);

  const statsCapture = await postJson(`${baseUrl}/capture/api`, {
    endpoint: '/page-reader/display',
    status: 200,
    capturedAt,
    body: {
      headerBar: {
        sp500: { ddRatio: 0.66, resilience: 14.47, resilience2: 19.87 },
        nq100: { resilience: 73.82, resilience2: 49.87 }
      },
      mapCodes: {
        SPY: { BBrMr: 'B', LS: 'L', UD: 'D' },
        QQQ: { mapCode: 'BLD' }
      },
      stats: {
        NQ: { resilience3: -29.29 }
      }
    }
  });
  assert.equal(statsCapture.snapshot.symbols.MES.stats.dd, 0.66);
  assert.equal(statsCapture.snapshot.symbols.MES.stats.mapCode, 'BLD');
  assert.equal(statsCapture.snapshot.symbols.MNQ.stats.dd, 0.66);
  assert.equal(statsCapture.snapshot.symbols.MNQ.stats.weeklyResilience, -29.29);
  assert.equal(statsCapture.snapshot.symbols.MES.levels.some((level) => level.kind === 'yellow-line'), true);

  const allStats = await getJson(`${baseUrl}/stats`);
  assert.deepEqual(allStats.symbols.map((row) => row.symbol), ['ES', 'NQ']);
  const esStats = await getJson(`${baseUrl}/stats/ES`);
  assert.equal(esStats.symbol, 'ES');
  assert.equal(esStats.stats.dd, 0.66);
  assert.equal(esStats.stats.resilience, 14.47);
  assert.equal(esStats.stats.monthlyResilience, 19.87);
  assert.equal(esStats.stats.mapCode, 'BLD');
  const nqStatsRows = await getText(`${baseUrl}/stats/NQ?format=rows`);
  assert.match(nqStatsRows, /DD,0\.66/);
  assert.match(nqStatsRows, /Res,73\.82/);
  assert.match(nqStatsRows, /MRes,49\.87/);
  assert.match(nqStatsRows, /WRes,-29\.29/);
  assert.match(nqStatsRows, /Map,BLD/);

  const multiSymbolStatus = await getJson(`${baseUrl}/status`);
  assert.deepEqual(multiSymbolStatus.symbols, ['ES', 'NQ']);
  assert.equal(multiSymbolStatus.symbolSummaries.find((row) => row.symbol === 'ES').levelCount, 5);
  assert.equal(multiSymbolStatus.symbolSummaries.find((row) => row.symbol === 'NQ').levelCount, 3);
  assert.equal(multiSymbolStatus.symbolSummaries.find((row) => row.symbol === 'ES').stats.mapCode, 'BLD');

  const bundledTradingViewPayload = await getText(`${baseUrl}/tradingview`);
  assert.match(bundledTradingViewPayload, /^RSLEVELS\|2\|[^|]+\|ES\|/);
  assert.match(bundledTradingViewPayload, /\|NQ\|/);
  assert.match(bundledTradingViewPayload, /BZT1,7580,zone-bull/);
  assert.match(bundledTradingViewPayload, /BrZT1,30450,zone-bear/);
  assert.match(bundledTradingViewPayload, /Yellow Line,7598,yellow-line/);
  assert.match(bundledTradingViewPayload, /Red Line,7520,red-line/);
  assert.match(bundledTradingViewPayload, /CAT,31232\.74,cat/);
  assert.match(bundledTradingViewPayload, /DD,0\.66,stat/);
  assert.match(bundledTradingViewPayload, /Res,73\.82,stat/);
  assert.match(bundledTradingViewPayload, /MRes,49\.87,stat/);
  assert.match(bundledTradingViewPayload, /WRes,-29\.29,stat/);
  assert.match(bundledTradingViewPayload, /Map BLD,0,stat/);
  assert.doesNotMatch(bundledTradingViewPayload, /tradingview-bundle-json|compactPayload|notes/);

  const mesRowsWithKinds = await getText(`${baseUrl}/levels/MES?format=rows`);
  assert.match(mesRowsWithKinds, /BZT1,7580\.00,76,175,80,zone-bull/);
  assert.match(mesRowsWithKinds, /BZB1,7560\.00,76,175,80,zone-bull/);
  assert.match(mesRowsWithKinds, /Yellow Line,7598\.00,255,235,59,yellow-line/);
  assert.match(mesRowsWithKinds, /Red Line,7520\.00,242,54,69,red-line/);

  const mnqTradingViewPayload = await getText(`${baseUrl}/tradingview/MNQ`);
  assert.match(mnqTradingViewPayload, /^RSLEVELS\|2\|[^|]+\|NQ\|/);
  assert.match(mnqTradingViewPayload, /BrZT1,30450,zone-bear/);

  const cqgNqLevels = await getJson(`${baseUrl}/levels/F.US.ENQU26`);
  assert.equal(cqgNqLevels.symbol, 'NQ');

  const zones = await getJson(`${baseUrl}/zones`);
  assert.equal(zones.levels.length, 4);
  assert.equal(zones.levels.some((level) => level.kind === 'zone-bull'), true);
  assert.equal(zones.levels.some((level) => level.kind === 'zone-bear'), true);

  const references = await getJson(`${baseUrl}/references`);
  assert.equal(references.levels.length, 3);
  assert.equal(references.levels.some((level) => level.kind === 'yellow-line'), true);
  assert.equal(references.levels.some((level) => level.kind === 'red-line'), true);
  assert.equal(references.levels.some((level) => level.kind === 'cat'), true);

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
