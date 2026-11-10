import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService, listen } from '../src/index.js';
import { SERIES_BAR_MS, createSeriesLive } from '../src/series-live.js';
import { createHttpApp } from '../src/http.js';
import { createLevelStore } from '../src/store.js';

// Synthetic values only; every clock is manual.
const T0 = Date.parse('2026-06-20T14:00:00.000Z');
const MIN = SERIES_BAR_MS;
const iso = (ms) => new Date(ms).toISOString();

// Changes only, the forming bar marked, each bar to history once when its minute ends.
{
  const now = { ms: T0 + 20 * 1000 };
  const closed = [];
  const live = createSeriesLive({ clock: () => new Date(now.ms), onClosed: (symbol, points) => closed.push([symbol, points]) });
  const events = [];
  const stop = live.subscribe('NQ', (event) => events.push(event));
  assert.equal(live.listenerCount('MNQ'), 1, 'NQ and MNQ are one symbol');

  assert.equal(live.accept('MNQ', [{ t: iso(T0), values: { 'res.hg': 22.8, 'arb.speed': 0.5 } }]), 2);
  assert.equal(live.accept('MNQ', [{ t: iso(T0), values: { 'res.hg': 22.8, 'arb.speed': 0.5 } }]), 0, 'nothing changed');
  now.ms = T0 + 21 * 1000;
  assert.equal(live.accept('MNQ', [{ t: iso(T0), values: { 'res.hg': 22.9, 'arb.speed': 0.5 } }]), 1);
  assert.deepEqual(events, [
    { symbol: 'NQ', t: iso(T0), values: { 'res.hg': 22.8, 'arb.speed': 0.5 }, forming: true },
    { symbol: 'NQ', t: iso(T0), values: { 'res.hg': 22.9 }, forming: true }
  ]);
  assert.equal(closed.length, 0, 'a forming bar is never stored');

  // The next minute: the first bar closes with its last values and goes to history once.
  now.ms = T0 + MIN + 1000;
  live.accept('MNQ', [
    { t: iso(T0), values: { 'res.hg': 22.9, 'arb.speed': 0.5 } },
    { t: iso(T0 + MIN), values: { 'res.hg': 23, 'arb.speed': 0.4 } }
  ]);
  assert.deepEqual(closed, [['MNQ', [{ t: iso(T0), values: { 'res.hg': 22.9, 'arb.speed': 0.5 } }]]]);
  live.accept('MNQ', [{ t: iso(T0 + MIN), values: { 'res.hg': 23.1 } }]);
  assert.equal(closed.length, 1, 'once');
  assert.equal(events.at(-1).forming, true);

  // A late correction to a closed bar is stored again (history keeps the latest per minute).
  live.accept('MNQ', [{ t: iso(T0), values: { 'res.hg': 22.95 } }]);
  assert.equal(events.at(-1).forming, false);
  assert.deepEqual(closed[1][1][0].values, { 'res.hg': 22.95, 'arb.speed': 0.5 });

  // Only the names history stores.
  assert.equal(live.accept('MNQ', [{ t: iso(T0 + MIN), values: { 'Not A Field': 7, dd: 4 } }]), 0);
  // A new subscriber starts from the bars held; old bars and future ones never enter.
  live.accept('MNQ', [{ t: iso(T0 - 10 * MIN), values: { 'res.hg': 1 } }, { t: iso(now.ms + MIN), values: { 'res.hg': 2 } }]);
  assert.deepEqual(live.current('NQ').map((bar) => [bar.t, bar.forming]), [[iso(T0), false], [iso(T0 + MIN), true]]);
  now.ms = T0 + 5 * MIN;
  assert.deepEqual(live.current('NQ'), [], 'old bars are dropped');
  stop();
  assert.equal(live.listenerCount('NQ'), 0);
}

// Over HTTP: a live post streams to subscribers at once, its forming value never reaches history,
// and the closed minute does.
{
  const dataDir = mkdtempSync(join(tmpdir(), 'rs-levels-live-'));
  const now = { ms: T0 + 30 * 1000 };
  const service = createService({ env: {}, config: { host: '127.0.0.1', port: 0, dataDir }, clock: () => new Date(now.ms) });
  const address = await listen(service);
  const base = `http://127.0.0.1:${address.port}`;
  const post = (rows) => fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/page-reader/series-live',
      method: 'PAGE_READER',
      status: 200,
      capturedAt: iso(now.ms),
      body: JSON.stringify({ type: 'rs_series_live', source: 'page-reader', series: { MNQ: { fields: ['arb.speed', 'res.hg'], rows } } })
    })
  });
  const controller = new AbortController();
  const readUntil = async (reader, decoder, pattern) => {
    let text = '';
    while (!pattern.test(text)) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      text += decoder.decode(value, { stream: true });
    }
    return text;
  };
  try {
    // A stream opened before anything is posted answers at once.
    const early = new AbortController();
    const opened = await fetch(`${base}/series/ES/stream`, { signal: early.signal });
    assert.equal(opened.status, 200);
    await readUntil(opened.body.getReader(), new TextDecoder(), /: connected\n\n/);
    assert.equal(service.live.listenerCount('ES'), 1);
    early.abort();
    for (let i = 0; i < 100 && service.live.listenerCount('ES'); i += 1) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(service.live.listenerCount('ES'), 0, 'a client that leaves is let go');

    const reply = await post([[T0 / 1000, 0.5, 22.8]]);
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { ok: true }, 'a series post gets a short answer, no snapshot');
    const response = await fetch(`${base}/series/NQ/stream?fields=res.hg`, { signal: controller.signal });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    await readUntil(reader, decoder, /: connected\n\n/).then((t) => {
      text = t.slice(t.indexOf(': connected\n\n') + ': connected\n\n'.length);
    });
    const nextEvent = async () => {
      while (!text.includes('\n\n')) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        text += decoder.decode(value, { stream: true });
      }
      const end = text.indexOf('\n\n');
      const block = text.slice(0, end);
      text = text.slice(end + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    };
    assert.deepEqual(await nextEvent(), { event: 'bar', data: { symbol: 'NQ', t: iso(T0), values: { 'res.hg': 22.8 }, forming: true } }, 'the held bar first');
    assert.equal((await post([[T0 / 1000, 0.6, 22.8]])).status, 200, 'a field the stream filters out');
    assert.equal((await post([[T0 / 1000, 0.6, 22.9]])).status, 200);
    assert.deepEqual(await nextEvent(), { event: 'bar', data: { symbol: 'NQ', t: iso(T0), values: { 'res.hg': 22.9 }, forming: true } });

    const stored = async () => (await (await fetch(`${base}/history/NQ?from=${iso(T0 - MIN)}&to=${iso(now.ms)}&fields=res.hg`)).json()).points;
    assert.deepEqual(await stored(), [], 'the forming value is live only');
    now.ms = T0 + MIN + 2000;
    assert.equal((await post([[(T0 + MIN) / 1000, 0.6, 23]])).status, 200);
    assert.deepEqual((await stored()).map((point) => [point.t, point.values['res.hg']]), [[iso(T0), 22.9]], 'its last value once the minute closed');
    assert.deepEqual(await nextEvent(), { event: 'bar', data: { symbol: 'NQ', t: iso(T0 + MIN), values: { 'res.hg': 23 }, forming: true } });

    // A minute read (`rs_series`) carries the forming bar too: live only, never stored; its
    // closed bars are stored.
    const minute = await fetch(`${base}/capture/api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: '/page-reader/series',
        method: 'PAGE_READER',
        status: 200,
        capturedAt: iso(now.ms),
        body: JSON.stringify({ type: 'rs_series', series: { MNQ: { fields: ['res.hg'], rows: [[(T0 - MIN) / 1000, 21], [(T0 + MIN) / 1000, 23.5]] } } })
      })
    });
    assert.equal(minute.status, 200);
    assert.deepEqual((await stored()).map((point) => [point.t, point.values['res.hg']]), [[iso(T0 - MIN), 21], [iso(T0), 22.9]], 'the forming 14:01 bar not stored');
    assert.deepEqual(await nextEvent(), { event: 'bar', data: { symbol: 'NQ', t: iso(T0 + MIN), values: { 'res.hg': 23.5 }, forming: true } }, 'it moves live');
  } finally {
    controller.abort();
    service.server.closeAllConnections?.();
    await new Promise((resolve) => service.server.close(resolve));
    rmSync(dataDir, { recursive: true, force: true });
  }
}
// A service without the live view (an older one) answers 404 for the stream: clients fall back
// to the minute history reads.
{
  const app = createHttpApp({ store: createLevelStore({}), config: { corsOrigins: [] }, history: null, live: undefined });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/series/NQ/stream`);
    assert.equal(response.status, 404);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
}

console.log('series live tests passed');
