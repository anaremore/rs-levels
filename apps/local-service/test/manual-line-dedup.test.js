import assert from 'node:assert/strict';
import { createService, listen } from '../src/index.js';

// A manual line drawn on a RocketScooter chart reaches the service twice: as the level the page
// reader names from it (`reader: 'shape-line'`, `OVNHP`) and as its chart shape
// (`source: 'chart_shape'`, `horizontal_line OVNHP`). Every reader of the service gets it once.
// Synthetic captures shaped as the extension posts them.
const service = createService({ env: {}, config: { host: '127.0.0.1', port: 0 } });
const address = await listen(service);
const base = `http://127.0.0.1:${address.port}`;
const named = (name, kind, price) => ({
  symbol: 'MES', name, kind, price, color: '#00ffff', source: 'rocketscooter-page',
  metadata: { rawSymbol: 'F.US.EPZ26', reader: 'shape-line' }
});
const shape = (text, price, label = `horizontal_line ${text}`) => ({
  index: 'ES', chart: 'F.US.EPZ26', price, text, color: '#00ffff', source: 'chart_shape', label
});
const DOUBLE = /horizontal_line|HORIZONTAL-LINE/;

try {
  const posted = await fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/page-reader/display',
      method: 'PAGE_READER',
      status: 200,
      capturedAt: '2026-11-12T14:00:00.000Z',
      body: JSON.stringify({
        type: 'rs_snapshot',
        source: 'page-reader',
        levels: [named('OVNHP', 'hp', 7632), named('OVNMHP', 'mhp', 7597)],
        chartLines: [shape('OVNHP', 7632), shape('OVNMHP', 7597)]
      })
    })
  });
  assert.equal(posted.status, 200);

  const levels = (await (await fetch(`${base}/levels/ES`)).json()).levels;
  const byName = (name) => levels.filter((l) => l.name === name);
  assert.equal(byName('OVNHP').length, 1);
  assert.equal(byName('OVNHP')[0].id, 'ES:OVNHP:7632.00', 'the shape-line one, with the clean id');
  assert.equal(byName('OVNMHP').length, 1);
  assert.equal(levels.filter((l) => l.price === 7632).length, 1);
  assert.equal(levels.filter((l) => l.price === 7597).length, 1);

  // Every other reader: rows, the snapshot, the exports, the stream.
  for (const path of ['/levels/ES/rows', '/levels/ES?format=rows', '/snapshot', '/levels', '/tradingview/ES', '/tradingview', '/sierra/MES', '/thinkorswim/ES', '/zones']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.ok, true, `${path} returned ${res.status}`);
    const body = await res.text();
    assert.doesNotMatch(body, DOUBLE, `${path} still has the chart shape`);
  }
  const rows = await (await fetch(`${base}/levels/ES/rows`)).text();
  assert.equal(rows.split('\n').filter((r) => r.startsWith('OVNHP,')).length, 1);
  const stream = new AbortController();
  const res = await fetch(`${base}/stream`, { signal: stream.signal });
  const reader = res.body.getReader();
  const { value } = await reader.read();
  stream.abort();
  const first = new TextDecoder().decode(value);
  assert.match(first, /OVNHP/);
  assert.doesNotMatch(first, DOUBLE, 'the stream still has the chart shape');

  // A snapshot saved before the fix (both forms stored) is served once too.
  service.store.replaceSnapshot({
    ...service.store.getSnapshot(),
    symbols: {
      MES: {
        symbol: 'MES',
        displaySymbol: 'ES',
        price: null,
        capturedAt: '2026-11-12T14:00:00.000Z',
        stats: {},
        warnings: [],
        levels: [
          { ...named('OVNHP', 'hp', 7632), id: 'MES:OVNHP:7632.00' },
          { symbol: 'MES', name: 'horizontal_line OVNHP', kind: 'hp', price: 7632, id: 'MES:HORIZONTAL-LINE-OVNHP:7632.00', metadata: { source: 'chart_shape', label: 'horizontal_line OVNHP' } }
        ]
      }
    }
  });
  const saved = (await (await fetch(`${base}/levels/ES`)).json()).levels;
  assert.deepEqual(saved.map((l) => l.name), ['OVNHP']);

  // Never more than the double: a chart shape with no named twin stays, and so do different
  // names at one price.
  const keep = await fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/page-reader/keep',
      method: 'PAGE_READER',
      status: 200,
      capturedAt: '2026-11-12T14:01:00.000Z',
      body: JSON.stringify({
        type: 'rs_snapshot',
        source: 'page-reader',
        levels: [named('YHP', 'hp', 7650)],
        chartLines: [shape('OVNHP', 7650), shape('MyLine', 7660)]
      })
    })
  });
  assert.equal(keep.status, 200);
  const kept = (await (await fetch(`${base}/levels/ES`)).json()).levels;
  assert.equal(kept.filter((l) => l.price === 7650).length, 2, 'YHP and a differently named shape at 7650');
  assert.equal(kept.filter((l) => l.price === 7660).length, 1, 'a shape with no named twin');
} finally {
  service.server.closeAllConnections?.();
  await new Promise((resolve) => service.server.close(resolve));
}
