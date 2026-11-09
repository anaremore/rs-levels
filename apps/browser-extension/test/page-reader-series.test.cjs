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

// The columns a post carries, back as { t, values } points.
function points(columns) {
  return columns.rows.map((row) => ({
    t: new Date(row[0] * 1000).toISOString(),
    values: Object.fromEntries(columns.fields.map((field, index) => [field, row[index + 1]]).filter(([, value]) => value !== null))
  }));
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
  return { posts, reader, series, lastDiagnostic, context };
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
      // The bar now forming, a minute ahead (within the clock allowance): never data.
      [NOW_S + MIN_S, 1.5, 2.5, 3.75, 0]
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
  // A second NQ chart at 5 minutes would overwrite the minute values: never read.
  const nqFive = chart('F.US.ENQZ26', '5', [
    study('res-nq-5', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 99, 99, 99, 0]])
  ]);
  const charts = [nq, qqqDaily, es, nqDaily, nqFive];
  const page = load({ chartsCount: () => charts.length, chart: (index) => charts[index] });
  await settle();

  assert.equal(qqqDaily.calls.length, 0, 'a daily chart is never read');
  assert.equal(nqDaily.calls.length, 0, 'not even on a futures symbol');
  assert.equal(nqFive.calls.length, 0, 'nor a 5-minute chart');
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
  for (const body of bodies) {
    const columns = Object.values(body.series)[0];
    assert.ok(Array.isArray(columns.fields) && Array.isArray(columns.rows), 'columns, not named values');
  }
  const nqPoints = points(bodies.find((body) => body.series.MNQ).series.MNQ);
  assert.deepEqual(nqPoints, [
    { t: new Date((NOW_S - 2 * MIN_S) * 1000).toISOString(), values: { 'res.hg': 1.25, 'res.mhp': 2.5, 'res.hp': 3.75, 'arb.speed': -0.5 } },
    { t: new Date((NOW_S - MIN_S) * 1000).toISOString(), values: { 'res.hg': 1.5, 'res.mhp': 2.5, 'res.hp': 3.75, 'arb.speed': 0.75 } }
  ], 'no row after now, no all-null row, no zero line, no other study');
  const esPoints = points(bodies.find((body) => body.series.MES).series.MES);
  assert.deepEqual(esPoints[0].values, { 'res.hg': 9, 'res.mhp': 8, 'res.hp': 7, 'arb.speed': 0.25 });
  assert.equal(page.lastDiagnostic().seriesLastReason, 'series-published');
  assert.equal(page.lastDiagnostic().seriesClockSymbol, '', 'no chart clock is off');
  assert.ok(!/^series-/.test(page.lastDiagnostic().lastReason), 'the level reader keeps its own reason');

  // The next minute reads only the recent past.
  await page.reader.pollSeries();
  const recent = nq.calls.slice(2);
  assert.equal(recent.length, 2);
  for (const options of recent) assert.ok(options.from >= NOW_S - 20 * MIN_S && options.from <= NOW_S, 'from is the recent past');

  for (const row of charts) assert.deepEqual(row.mutations, [], 'nothing on the page is changed');
})()
  // An SP500 study on the NQ chart is not NQ's: never read.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0]]),
      study('arb-sp', 'SP500 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 5, 0]])
    ]);
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.deepEqual(nq.calls.map((options) => options.includedStudies[0]), ['res-nq']);
    const columns = JSON.parse(page.series()[0].capture.body).series.MNQ;
    assert.ok(!columns.fields.includes('arb.speed'));
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-partial', 'NQ100 Arb is missing');
    // The missing Arb never makes Resilience re-send everything.
    await page.reader.pollSeries();
    assert.ok(Number.isFinite(nq.calls[1].from), 'the next read is recent only');
  })
  // Studies still empty just after load: the full read is tried again next minute.
  .then(async () => {
    const rows = [];
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], rows),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [])
    ]);
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    rows.push([NOW_S - MIN_S, 1, 2, 3, 0]);
    await page.reader.pollSeries();
    assert.deepEqual(nq.calls.map((options) => options.from), [undefined, undefined, undefined, undefined], 'both reads full');
  })
  // A chart whose clock runs 3 days and 1 hour ahead (the page logs `putToCacheNewBar: time
  // violation`): its past rows are the studies' zero placeholders. Nothing from it is stored;
  // the other chart's are; the reason, symbol and skew say why; its full read stays due.
  .then(async () => {
    const skewS = (3 * 24 + 1) * 60 * MIN_S;
    const zeros = (from, to) => {
      const rows = [];
      for (let t = from; t <= to; t += MIN_S) rows.push([t, 0, 0, 0, 0]);
      return rows;
    };
    const resNq = study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], zeros(NOW_S - 30 * MIN_S, NOW_S + skewS));
    const arbNq = study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S + skewS, 0.5, 0]]);
    const nq = chart('F.US.ENQZ26', '1', [resNq, arbNq]);
    const es = chart('F.US.EPZ26', '1', [
      study('res-es', 'SP500 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 9, 8, 7, 0]]),
      study('arb-es', 'SP500 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.25, 0]])
    ]);
    const charts = [nq, es];
    const page = load({ chartsCount: () => charts.length, chart: (index) => charts[index] });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesLastReason, 'series-chart-clock');
    assert.equal(stats.seriesClockSymbol, 'NQ');
    assert.ok(Math.abs(stats.seriesClockSkewS - skewS) <= 2, `skew ${stats.seriesClockSkewS}`);
    const bodies = page.series().map((post) => JSON.parse(post.capture.body));
    assert.ok(bodies.every((body) => !body.series.MNQ), 'nothing stored from the NQ chart');
    assert.ok(bodies.some((body) => body.series.MES), 'the ES chart is still read');
    // Still off a minute later: the full read is tried again, still nothing stored.
    await page.reader.pollSeries();
    assert.ok(nq.calls.slice(2).every((options) => options.from === undefined), 'its full read stays due');
    assert.ok(page.series().every((post) => !JSON.parse(post.capture.body).series.MNQ));
    assert.equal(page.lastDiagnostic().seriesWidget, true, 'from the frame with the charts');
    // The widget goes away in this frame: it no longer reports the old skew.
    const widget = page.context.tvWidget;
    delete page.context.tvWidget;
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-waiting');
    assert.equal(page.lastDiagnostic().seriesWidget, false);
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '');
    page.context.tvWidget = widget;
    // The page is reloaded and the clock is right: the warning clears, the day backfills.
    resNq.rows = [[NOW_S - 2 * MIN_S, 1.25, 2.5, 3.75, 0], [NOW_S - MIN_S, 1.5, 2.5, 3.75, 0]];
    arbNq.rows = [[NOW_S - MIN_S, 0.75, 0]];
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '');
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-published');
    const recovered = page.series().map((post) => JSON.parse(post.capture.body)).find((body) => body.series.MNQ);
    assert.ok(recovered, 'NQ is stored again');
    // Both charts off: both named.
    const both = [nq, chart('F.US.EPZ26', '1', [
      study('res-es', 'SP500 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S + skewS, 0, 0, 0, 0]]),
      study('arb-es', 'SP500 Arb', ['Speed', '0'], [[NOW_S + skewS, 0, 0]])
    ])];
    resNq.rows = [[NOW_S + 3 * MIN_S, 0, 0, 0, 0]];
    const twice = load({ chartsCount: () => both.length, chart: (index) => both[index] });
    await settle();
    assert.equal(twice.lastDiagnostic().seriesClockSymbol, 'NQ, ES');
    assert.equal(twice.series().length, 0);
    // A bar 2 minutes ahead is still within the allowance: not a clock fault.
    const near = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [
        [NOW_S - MIN_S, 1, 2, 3, 0],
        [NOW_S + 2 * MIN_S - 5, 1, 2, 3, 0]
      ]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ]);
    const ok = load({ chartsCount: () => 1, chart: () => near });
    await settle();
    assert.equal(ok.lastDiagnostic().seriesLastReason, 'series-published');
    assert.equal(ok.lastDiagnostic().seriesClockSymbol, '');
  })
  // One study's export fails while the other returns only past placeholders: nothing from that
  // chart this read (the failed one may have shown the clock fault).
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 0, 0, 0, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0, 0]])
    ]);
    const exportData = nq.exportData;
    nq.exportData = async (options) => {
      if (options.includedStudies[0] === 'arb-nq') throw new Error('timed out');
      return exportData(options);
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.series().length, 0, 'nothing stored from a chart with a failed export');
    assert.equal(page.lastDiagnostic().seriesErrorCount, 1);
  })
  // One study's rows show the broken clock while the other's export fails: still the warning,
  // still nothing stored.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [
        [NOW_S - MIN_S, 0, 0, 0, 0],
        [NOW_S + 3600, 0, 0, 0, 0]
      ]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0, 0]])
    ]);
    const exportData = nq.exportData;
    nq.exportData = async (options) => {
      if (options.includedStudies[0] === 'arb-nq') throw new Error('timed out');
      return exportData(options);
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-chart-clock');
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ');
    assert.equal(page.series().length, 0);
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ', 'no flicker on the next read');
  })
  // The study that showed the fault fails on the next read (or both do): the warning holds,
  // nothing is stored; a read where every study answers with no skew clears it.
  .then(async () => {
    const res = study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [
      [NOW_S - MIN_S, 0, 0, 0, 0],
      [NOW_S + 3600, 0, 0, 0, 0]
    ]);
    const arb = study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0, 0]]);
    const nq = chart('F.US.ENQZ26', '1', [res, arb]);
    const exportData = nq.exportData;
    let failing = [];
    nq.exportData = async (options) => {
      if (failing.includes(options.includedStudies[0])) throw new Error('timed out');
      return exportData(options);
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ');
    failing = ['res-nq'];
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ', 'the skewed study failed: still warned');
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-chart-clock');
    failing = ['res-nq', 'arb-nq'];
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ', 'both failed: still warned');
    assert.equal(page.series().length, 0, 'nothing stored throughout');
    failing = [];
    res.rows = [[NOW_S - MIN_S, 1, 2, 3, 0]];
    arb.rows = [[NOW_S - MIN_S, 0.5, 0]];
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '', 'cleared once every study answers right');
    assert.ok(page.series().length > 0, 'and NQ is stored again');
  })
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
