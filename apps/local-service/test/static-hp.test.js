import assert from 'node:assert/strict';
import { createService, listen } from '../src/index.js';

// The static HP and MHP next to Dyn HP and Dyn MHP, end to end: a page-reader display capture
// (synthetic, shaped as the extension posts it) in, `GET /levels/ES` and `/levels/NQ` out.
const service = createService({ env: {}, config: { host: '127.0.0.1', port: 0 } });
const address = await listen(service);
const base = `http://127.0.0.1:${address.port}`;
const level = (symbol, name, kind, price, reader, extra = {}) => ({
  symbol, name, kind, price, color: '', source: 'rocketscooter-page',
  metadata: { rawSymbol: symbol === 'MES' ? 'F.US.EPZ26' : 'F.US.ENQZ26', reader, ...extra }
});
try {
  const capture = {
    endpoint: '/page-reader/display',
    method: 'PAGE_READER',
    status: 200,
    capturedAt: '2026-11-10T15:00:00.000Z',
    body: JSON.stringify({
      type: 'rs_snapshot',
      source: 'page-reader',
      levels: [
        level('MES', 'HP', 'hp', 7492.25, 'shape-line'),
        level('MES', 'MHP', 'mhp', 7502, 'shape-line'),
        level('MES', 'Dyn HP', 'hp', 7575.5, 'study-plot', { study: 'Dynamic HP' }),
        level('MES', 'Dyn MHP', 'mhp', 7580, 'study-plot', { study: 'Dynamic HP' }),
        level('MNQ', 'HP', 'hp', 27843, 'shape-line'),
        level('MNQ', 'MHP', 'mhp', 27957.5, 'shape-line'),
        level('MNQ', 'Dyn HP', 'hp', 28044, 'study-plot', { study: 'Dynamic HP' }),
        level('MNQ', 'Dyn MHP', 'mhp', 28064, 'study-plot', { study: 'Dynamic HP' })
      ]
    })
  };
  const posted = await fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capture)
  });
  assert.equal(posted.status, 200);
  for (const [symbol, want] of [
    ['ES', { HP: 7492.25, MHP: 7502, 'Dyn HP': 7575.5, 'Dyn MHP': 7580 }],
    ['NQ', { HP: 27843, MHP: 27957.5, 'Dyn HP': 28044, 'Dyn MHP': 28064 }]
  ]) {
    const body = await (await fetch(`${base}/levels/${symbol}`)).json();
    for (const [name, price] of Object.entries(want)) {
      const rows = body.levels.filter((l) => l.name === name);
      assert.equal(rows.length, 1, `${symbol} ${name}`);
      assert.equal(rows[0].price, price, `${symbol} ${name}`);
      assert.equal(rows[0].kind, name.endsWith('MHP') ? 'mhp' : 'hp');
    }
    const hp = body.levels.find((l) => l.name === 'HP');
    assert.equal(hp.metadata.reader, 'shape-line', 'where it came from');
    // The rows format (Lines, Sierra) lists all four too.
    const rows = await (await fetch(`${base}/levels/${symbol}/rows`)).text();
    for (const name of ['HP', 'MHP', 'Dyn HP', 'Dyn MHP']) {
      assert.ok(rows.split('\n').some((line) => line.startsWith(`${name},`)), `${symbol} rows ${name}:\n${rows}`);
    }
  }
} finally {
  service.server.closeAllConnections?.();
  await new Promise((resolve) => service.server.close(resolve));
}
console.log('static HP tests passed');
