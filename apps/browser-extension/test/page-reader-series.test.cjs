// The page reader's study series: Resilience and Arb, read-only, as timestamped points.
// Synthetic fixtures only: the charts, studies and values are made up here.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'src', 'page-reader.js'), 'utf8');
const NOW_S = Math.floor(Date.now() / 1000);
const MIN_S = 60;

function study(id, name, plotTitles, rows) {
  return { info: { id, name }, schema: [{ plotTitle: 'time' }, ...plotTitles.map((plotTitle) => ({ plotTitle }))], rows };
}

function chart(symbol, resolution, studies) {
  const calls = [];
  const mutations = [];
  const byId = new Map(studies.map((row) => [row.info.id, row]));
  return {
    calls,
    mutations,
    symbol: () => symbol,
    resolution: () => resolution,
    getAllStudies: () => studies.map((row) => row.info),
    getAllShapes: () => [],
    exportData: async (options) => {
      calls.push(options);
      const row = byId.get(options.includedStudies[0]);
      const from = Number.isFinite(options.from) ? options.from : -Infinity;
      return { schema: row.schema, data: row.rows.filter((data) => data[0] >= from) };
    },
    // Read-only: any of these being called is a failure.
    createStudy: () => mutations.push('createStudy'),
    removeEntity: () => mutations.push('removeEntity'),
    removeAllStudies: () => mutations.push('removeAllStudies')
  };
}

function load(widget) {
  const posts = [];
  const context = {
    Array, Date, JSON, Map, Math, Number, Object, Promise, RegExp, Set, String,
    addEventListener: () => {},
    clearInterval: () => {},
    console,
    location: { origin: 'https://rocket.place' },
    postMessage: (message) => posts.push(message),
    setInterval: () => 1,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    tvWidget: widget,
    window: null
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  const reader = context.__RS_LEVELS_PAGE_READER__;
  const series = () => posts.filter((post) => post.type === 'capture' && post.capture.endpoint === '/page-reader/series');
  const lastDiagnostic = () => posts.filter((post) => post.type === 'diagnostic').pop().stats;
  return { posts, reader, series, lastDiagnostic };
}

// The reader starts its first read on load; let it finish.
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Minute futures charts are read; future rows, nulls and the zero line are not. The daily chart's
// all-zero study is never read.
(async () => {
  const nq = chart('F.US.ENQZ26', '1', [
    study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [
      [NOW_S - 3 * MIN_S, null, null, null, 0],
      [NOW_S - 2 * MIN_S, 1.25, 2.5, 3.75, 0],
      [NOW_S - MIN_S, 1.5, 2.5, 3.75, 0],
      // The chart holds the last value flat about three days ahead: never data.
      [NOW_S + MIN_S, 1.5, 2.5, 3.75, 0],
      [NOW_S + 3 * 24 * 60 * MIN_S, 1.5, 2.5, 3.75, 0]
    ]),
    study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [
      [NOW_S - 2 * MIN_S, -0.5, 0],
      [NOW_S - MIN_S, 0.75, 0]
    ]),
    study('other', 'Volume', ['Vol'], [[NOW_S - MIN_S, 100]])
  ]);
  const es = chart('F.US.EPZ26', '1', [
    study('res-es', 'SP500 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 9, 8, 7, 0]]),
    study('arb-es', 'SP500 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.25, 0]])
  ]);
  const qqqDaily = chart('QQQ', '1D', [
    study('res-qqq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 0, 0, 0, 0]])
  ]);
  const nqDaily = chart('F.US.ENQZ26', '1D', [
    study('res-nq-daily', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 0, 0, 0, 0]])
  ]);
  const charts = [nq, qqqDaily, es, nqDaily];
  const page = load({ chartsCount: () => charts.length, chart: (index) => charts[index] });
  await settle();

  assert.equal(qqqDaily.calls.length, 0, 'a daily chart is never read');
  assert.equal(nqDaily.calls.length, 0, 'not even on a futures symbol');
  assert.equal(nq.calls.length, 2, 'Resilience and Arb only');
  for (const options of nq.calls) {
    assert.equal(options.includeTime, true);
    assert.equal(options.includeSeries, false);
    assert.equal(options.from, undefined, 'the first read sends everything loaded');
  }

  const posts = page.series();
  assert.equal(posts.length, 2, 'one post per symbol');
  const bodies = posts.map((post) => JSON.parse(post.capture.body));
  for (const body of bodies) assert.equal(body.type, 'rs_series');
  const nqPoints = bodies.find((body) => body.series.MNQ).series.MNQ;
  assert.deepEqual(nqPoints, [
    { t: new Date((NOW_S - 2 * MIN_S) * 1000).toISOString(), values: { 'res.hg': 1.25, 'res.mhp': 2.5, 'res.hp': 3.75, 'arb.speed': -0.5 } },
    { t: new Date((NOW_S - MIN_S) * 1000).toISOString(), values: { 'res.hg': 1.5, 'res.mhp': 2.5, 'res.hp': 3.75, 'arb.speed': 0.75 } }
  ], 'no row after now, no all-null row, no zero line, no other study');
  const esPoints = bodies.find((body) => body.series.MES).series.MES;
  assert.deepEqual(esPoints[0].values, { 'res.hg': 9, 'res.mhp': 8, 'res.hp': 7, 'arb.speed': 0.25 });
  assert.equal(page.lastDiagnostic().seriesLastReason, 'series-published');

  // The next minute reads only the recent past.
  await page.reader.pollSeries();
  const recent = nq.calls.slice(2);
  assert.equal(recent.length, 2);
  for (const options of recent) assert.ok(options.from >= NOW_S - 20 * MIN_S && options.from <= NOW_S, 'from is the recent past');

  for (const row of charts) assert.deepEqual(row.mutations, [], 'nothing on the page is changed');
})()
  // A missing widget: counted, nothing posted, and level capture carries on.
  .then(async () => {
    const page = load(undefined);
    await settle();
    assert.equal(page.series().length, 0);
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-waiting');
  })
  // A missing study: the rest is still read; the gap is counted.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0]])
    ]);
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesLastReason, 'series-partial');
    assert.equal(stats.seriesMissingCount, 1);
    assert.equal(page.series().length, 1);
  })
  // A study that throws is counted and never breaks the reader.
  .then(async () => {
    const broken = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG'], []),
      study('arb-nq', 'NQ100 Arb', ['Speed'], [])
    ]);
    broken.exportData = async () => {
      throw new Error('not ready');
    };
    const page = load({ chartsCount: () => 1, chart: () => broken });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesErrorCount, 2);
    assert.equal(page.series().length, 0);
    assert.ok(page.posts.some((post) => post.type === 'diagnostic'));
  })
  .then(() => console.log('browser extension page reader series tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
