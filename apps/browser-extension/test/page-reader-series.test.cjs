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

// The main series (candles) export: `type: 'time'` then OHLC with `sourceType: 'series'`, as
// Float64Array rows. `candles.times`: the candles' times; without it, every study row's time is a
// candle (the chart's clock is what its studies show). `candles.through`: the export's time column
// runs on to here with NaN candles (a study or shape drawn ahead does that).
const CANDLE_SCHEMA = [{ type: 'time' }, ...['open', 'high', 'low', 'close'].map((plotTitle) => ({ type: 'value', sourceType: 'series', plotTitle, sourceTitle: 'Main' }))];

function chart(symbol, resolution, studies, candles = {}) {
  const calls = [];
  const candleCalls = [];
  const mutations = [];
  const byId = new Map(studies.map((row) => [row.info.id, row]));
  const candleRows = () => {
    const times = candles.times || Array.from(new Set(studies.flatMap((row) => row.rows.map((data) => data[0]))));
    const rows = times.map((t) => Float64Array.from([t, 100, 101, 99, 100.5]));
    const last = Math.max(0, ...times);
    for (let t = last + 60; Number.isFinite(candles.through) && t <= candles.through; t += 60) {
      rows.push(Float64Array.from([t, NaN, NaN, NaN, NaN]));
    }
    return rows;
  };
  return {
    calls,
    candleCalls,
    mutations,
    symbol: () => symbol,
    resolution: () => resolution,
    getAllStudies: () => studies.map((row) => row.info),
    getAllShapes: () => [],
    exportData: async (options) => {
      const from = Number.isFinite(options.from) ? options.from : -Infinity;
      if (options.includeSeries && options.includedStudies.length === 0) {
        candleCalls.push(options);
        return { schema: candles.schema || CANDLE_SCHEMA, data: candleRows().filter((data) => data[0] >= from) };
      }
      calls.push(options);
      const row = byId.get(options.includedStudies[0]);
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

// Values from the reader's context, as plain data (its arrays are another realm's).
function plain(value) {
  return JSON.parse(JSON.stringify(value));
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
  // The clock: one candle read per chart, the main series only, the recent past only.
  assert.equal(nq.candleCalls.length, 1);
  assert.equal(nq.candleCalls[0].includeSeries, true);
  assert.deepEqual(Array.from(nq.candleCalls[0].includedStudies), []);
  assert.ok(nq.candleCalls[0].from >= NOW_S - 65 * MIN_S && nq.candleCalls[0].from <= NOW_S - 55 * MIN_S, 'the last hour');

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
    // The candles are ahead: its studies are not read at all.
    assert.equal(nq.calls.length, 0, 'no study read from a chart whose candles are ahead');
    // Still off a minute later: still nothing stored.
    await page.reader.pollSeries();
    assert.equal(nq.calls.length, 0);
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
    assert.ok(nq.calls.length === 2 && nq.calls.every((options) => options.from === undefined), 'its full read stayed due');
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
    assert.equal(stats.seriesErrorCount, 3, 'its candles and both studies');
    assert.equal(page.series().length, 0);
    assert.ok(page.posts.some((post) => post.type === 'diagnostic'));
  })
  // The fast path: the last two bars, only what changed, only from a chart the minute read judged
  // right, as `rs_series_live` to its own endpoint.
  .then(async () => {
    const rows = [
      [NOW_S - 3 * MIN_S, 1, 2, 3, 0],
      [NOW_S - MIN_S, 1.25, 2.5, 3.75, 0],
      // The forming bar.
      [NOW_S, 1.5, 2.5, 3.75, 0]
    ];
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], rows),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S, 0.5, 0]])
    ]);
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    const live = () => page.posts.filter((post) => post.type === 'capture' && post.capture.endpoint === '/page-reader/series-live');
    const before = nq.calls.length;
    await page.reader.pollSeriesLive();
    const recent = nq.calls.slice(before);
    assert.equal(recent.length, 2);
    for (const options of recent) assert.ok(options.from >= NOW_S - 2 * MIN_S - 5 && options.from <= NOW_S - 2 * MIN_S + 5, 'the last two bars');
    assert.equal(live().length, 1);
    const body = JSON.parse(live()[0].capture.body);
    assert.equal(body.type, 'rs_series_live');
    assert.deepEqual(points(body.series.MNQ).map((point) => point.values), [
      { 'res.hg': 1.25, 'res.mhp': 2.5, 'res.hp': 3.75 },
      { 'arb.speed': 0.5, 'res.hg': 1.5, 'res.mhp': 2.5, 'res.hp': 3.75 }
    ]);
    // Nothing changed: nothing posted.
    await page.reader.pollSeriesLive();
    assert.equal(live().length, 1);
    // One value moves on the forming bar: only it is posted.
    rows[2][1] = 1.75;
    await page.reader.pollSeriesLive();
    assert.equal(live().length, 2);
    assert.deepEqual(points(JSON.parse(live()[1].capture.body).series.MNQ), [
      { t: new Date(NOW_S * 1000).toISOString(), values: { 'res.hg': 1.75 } }
    ]);
    assert.equal(page.series().length, 1, 'the minute read posted once, on load; the fast path never as rs_series');
    // The chart's clock goes wrong: the fast path posts nothing, and stays out.
    rows.push([NOW_S + 10 * MIN_S, 9, 9, 9, 0]);
    rows[2][1] = 2;
    await page.reader.pollSeriesLive();
    assert.equal(live().length, 2, 'a chart whose clock is off never posts');
    assert.equal(page.lastDiagnostic().seriesClockSymbol, 'NQ', 'said at once');
    rows.pop();
    await page.reader.pollSeriesLive();
    assert.equal(live().length, 2, 'until a minute read judges it right again');
    await page.reader.pollSeries();
    await page.reader.pollSeriesLive();
    assert.equal(live().length, 3);
  })
  // A chart the minute read never judged (its export failed) is never read by the fast path.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG'], [[NOW_S, 1]]),
      study('arb-nq', 'NQ100 Arb', ['Speed'], [[NOW_S, 1]])
    ]);
    const exportData = nq.exportData;
    nq.exportData = async () => {
      throw new Error('not ready');
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    nq.exportData = exportData;
    await page.reader.pollSeriesLive();
    assert.equal(page.posts.filter((post) => post.type === 'capture' && post.capture.endpoint === '/page-reader/series-live').length, 0);
  })
  // The NQ minute chart with a study drawn 26 bars ahead (its export's time column runs past the
  // last candle) while its candles end now: the clock is right, rows up to now are stored, the
  // rows ahead are dropped, and the fast path publishes too.
  .then(async () => {
    const ahead = 26 * MIN_S;
    const resRows = [];
    for (let t = NOW_S - 3 * MIN_S; t <= NOW_S + ahead; t += MIN_S) resRows.push([t, 1, 2, 3, 0]);
    resRows[1][1] = 1.25;
    const candleTimes = [];
    for (let t = NOW_S - 30 * MIN_S; t <= NOW_S; t += MIN_S) candleTimes.push(t);
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], resRows),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0], [NOW_S, 0.75, 0]])
    ], { times: candleTimes, through: NOW_S + ahead });
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesLastReason, 'series-published', 'no series-chart-clock');
    assert.equal(stats.seriesClockSymbol, '');
    assert.equal(stats.seriesClockSkewS, 0);
    const stored = points(JSON.parse(page.series()[0].capture.body).series.MNQ);
    assert.deepEqual(stored.map((point) => point.t), [-3, -2, -1, 0].map((m) => new Date((NOW_S + m * MIN_S) * 1000).toISOString()), 'rows up to now, none ahead');
    assert.equal(stored[1].values['res.hg'], 1.25);
    // The fast path: the same candles, the same study ahead, still publishes.
    await page.reader.pollSeriesLive();
    const live = page.posts.filter((post) => post.type === 'capture' && post.capture.endpoint === '/page-reader/series-live');
    assert.equal(live.length, 1, 'the fast path publishes');
    const livePoints = points(JSON.parse(live[0].capture.body).series.MNQ);
    assert.ok(livePoints.every((point) => Date.parse(point.t) <= NOW_S * 1000 + 5000), 'none ahead');
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '');
    assert.equal(nq.candleCalls.length, 2, 'one candle read per read');
    assert.deepEqual(nq.mutations, []);
  })
  // Candles that really are 5 minutes ahead while the studies end now: still the clock fault,
  // the skew in the diagnostics, nothing stored, no study read; the fast path stays out.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ], { times: [NOW_S - MIN_S, NOW_S, NOW_S + 5 * MIN_S] });
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesLastReason, 'series-chart-clock');
    assert.equal(stats.seriesClockSymbol, 'NQ');
    assert.ok(Math.abs(stats.seriesClockSkewS - 5 * MIN_S) <= 2, `skew ${stats.seriesClockSkewS}`);
    assert.equal(page.series().length, 0);
    assert.equal(nq.calls.length, 0);
    await page.reader.pollSeriesLive();
    assert.equal(page.posts.filter((post) => post.type === 'capture' && /series/.test(post.capture.endpoint)).length, 0, 'the fast path posts nothing');
  })
  // An export with no main-series columns (an older chart API): the studies' newest row judges
  // the clock as before.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0], [NOW_S + 3600, 0, 0, 0, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ], { schema: [{ type: 'time' }] });
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-chart-clock');
    assert.equal(page.series().length, 0);
  })
  // The candle read fails: no clock fault is claimed, nothing is stored this read, and the next
  // read that answers stores the chart.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0], [NOW_S + 3600, 0, 0, 0, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ], { times: [NOW_S - MIN_S] });
    const exportData = nq.exportData;
    let candlesFail = true;
    nq.exportData = async (options) => {
      if (candlesFail && options.includeSeries) throw new Error('timed out');
      return exportData(options);
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '', 'a failed candle read is no clock fault');
    assert.equal(page.lastDiagnostic().seriesErrorCount, 1);
    assert.equal(page.series().length, 0, 'nothing stored without a judged clock');
    candlesFail = false;
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-published');
    assert.equal(page.series().length, 1);
  })
  // Once the candles say the clock is right, a study that fails never keeps the old warning:
  // the fault clears at once (nothing stored that read), and the next full answer stores.
  .then(async () => {
    let ahead = true;
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - MIN_S, 1, 2, 3, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ], { times: [NOW_S - MIN_S] });
    const exportData = nq.exportData;
    let arbFails = false;
    nq.exportData = async (options) => {
      if (options.includeSeries && ahead) {
        const out = await exportData(options);
        return { schema: out.schema, data: [Float64Array.from([NOW_S + 600, 1, 1, 1, 1])] };
      }
      if (arbFails && (options.includedStudies || []).includes('arb-nq')) throw new Error('timed out');
      return exportData(options);
    };
    const page = load({ chartsCount: () => 1, chart: () => nq });
    await settle();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-chart-clock', 'candles ahead: fault');
    ahead = false;
    arbFails = true;
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesClockSymbol, '', 'candles right: the warning clears though a study failed');
    assert.equal(page.series().length, 0, 'nothing stored the read a study failed');
    arbFails = false;
    await page.reader.pollSeries();
    assert.equal(page.lastDiagnostic().seriesLastReason, 'series-published');
  })
  // 0.4.9: the owner's NQ chart was judged ~25 minutes ahead every read, the offset moving with
  // the clock. Each export shape that can give that is reproduced here.
  .then(async () => {
    const studies = () => [
      study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], [[NOW_S - 2 * MIN_S, 1, 2, 3, 0], [NOW_S - MIN_S, 1.5, 2.5, 3.5, 0]]),
      study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
    ];
    // The candle export answered by `rows` (plain rows, sent as Float64Array) under `schema`.
    const withCandles = (schema, rows) => {
      const nq = chart('F.US.ENQZ26', '1', studies());
      const exportData = nq.exportData;
      nq.exportData = async (options) => {
        if (options.includeSeries) {
          nq.candleCalls.push(options);
          return { schema, data: rows.filter((row) => row[0] >= options.from).map((row) => Float64Array.from(row)) };
        }
        return exportData(options);
      };
      return nq;
    };
    const real = [];
    for (let m = -10; m <= 0; m += 1) real.push([NOW_S + m * MIN_S, 100 + m, 101 + m, 99 + m, 100.5 + m]);
    const lastClose = real[real.length - 1][4];
    const ahead = (row) => {
      const out = [];
      for (let m = 1; m <= 25; m += 1) out.push(row(NOW_S + m * MIN_S));
      return out;
    };
    const volumeSchema = [...CANDLE_SCHEMA, { type: 'value', sourceType: 'series', plotTitle: 'volume', sourceTitle: 'Main' }];
    const cases = [
      // Whitespace with the last close carried forward (O=H=L=C), no volume column.
      ['carried close', CANDLE_SCHEMA, [...real, ...ahead((t) => [t, lastClose, lastClose, lastClose, lastClose])]],
      // Whitespace with prices but no trade: volume 0 or NaN where the feed gives volume.
      ['no volume', volumeSchema, [...real.map((row) => [...row, 12]), ...ahead((t) => [t, 100, 101, 99, 100.5, t % 120 ? 0 : NaN])]]
    ];
    for (const [name, schema, rows] of cases) {
      const nq = withCandles(schema, rows);
      const page = load({ chartsCount: () => 1, chart: () => nq, activeChartIndex: () => 0 });
      await settle();
      const stats = page.lastDiagnostic();
      assert.equal(stats.seriesLastReason, 'series-published', `${name}: recorded`);
      assert.equal(stats.seriesClockSymbol, '', `${name}: no clock fault`);
      const [entry] = stats.seriesClockCharts;
      assert.equal(entry.source, 'candles');
      assert.equal(entry.active, true);
      assert.equal(entry.candleS, NOW_S, `${name}: the clock is the last real candle`);
      assert.equal(entry.skewS, 0);
      assert.equal(entry.ahead, 25);
      assert.equal(entry.skipped, 25);
      assert.equal(entry.tail.length, 5, 'the last five rows');
      assert.equal(entry.tail[4][0], NOW_S + 25 * MIN_S, 'the tail shows the rows ahead');
    }
    // Real trades ahead are still the fault: volume above zero, or prices that move.
    const realAhead = [
      ['volume', volumeSchema, [...real.map((row) => [...row, 12]), ...ahead((t) => [t, 100, 101, 99, 100.5, 3])]],
      ['moving prices', CANDLE_SCHEMA, [...real, ...ahead((t) => [t, 100, 101 + (t % 7), 99, 100.5])]]
    ];
    for (const [name, schema, rows] of realAhead) {
      const nq = withCandles(schema, rows);
      const page = load({ chartsCount: () => 1, chart: () => nq });
      await settle();
      const stats = page.lastDiagnostic();
      assert.equal(stats.seriesLastReason, 'series-chart-clock', `${name}: real candles ahead are a fault`);
      assert.ok(Math.abs(stats.seriesClockSkewS - 25 * MIN_S) <= 2, `${name}: skew ${stats.seriesClockSkewS}`);
      assert.equal(stats.seriesClockCharts[0].candleS, NOW_S + 25 * MIN_S);
      assert.equal(page.series().length, 0);
    }
    // A feed whose volume column is always empty is judged by its prices (never by nothing).
    {
      const rows = [...real.map((row) => [...row, NaN]), ...ahead((t) => [t, 100, 101 + (t % 7), 99, 100.5, NaN])];
      const nq = withCandles(volumeSchema, rows);
      const page = load({ chartsCount: () => 1, chart: () => nq });
      await settle();
      assert.equal(page.lastDiagnostic().seriesLastReason, 'series-chart-clock', 'empty volume: prices judge');
    }
    // A column tagged `series` that a study on the chart owns, or a second series source (an
    // overlay), runs 25 minutes ahead: never the chart's clock.
    {
      const schema = [
        ...CANDLE_SCHEMA,
        { type: 'value', sourceType: 'series', sourceId: 'res-nq', plotTitle: 'close', sourceTitle: 'Liquidity' },
        { type: 'value', sourceType: 'series', sourceId: 'overlay-1', plotTitle: 'close', sourceTitle: 'Overlay' }
      ];
      const rows = [
        ...real.map((row) => [...row, 1, 2]),
        ...ahead((t) => [t, NaN, NaN, NaN, NaN, 5 + (t % 3), 7 + (t % 5)])
      ];
      const nq = withCandles(schema, rows);
      const page = load({ chartsCount: () => 1, chart: () => nq });
      await settle();
      const stats = page.lastDiagnostic();
      assert.equal(stats.seriesLastReason, 'series-published', 'other sources ahead: recorded');
      assert.equal(stats.seriesClockCharts[0].candleS, NOW_S);
      assert.deepEqual(plain(stats.seriesClockCharts[0].columns).map((column) => [column.type, column.id, column.title]), [
        ['series', '', 'open'], ['series', '', 'high'], ['series', '', 'low'], ['series', '', 'close'],
        ['series', 'res-nq', 'close'], ['series', 'overlay-1', 'close']
      ]);
    }
    // No candle columns (0.4.8's fallback, the same check as before it): study rows ahead that
    // are only a time (whitespace) are no bar; study rows ahead with values still are (tested above).
    {
      const resRows = [[NOW_S - MIN_S, 1, 2, 3, 0]];
      for (let m = 1; m <= 26; m += 1) resRows.push([NOW_S + m * MIN_S, null, null, null, null]);
      const nq = chart('F.US.ENQZ26', '1', [
        study('res-nq', 'NQ100 Resilience', ['HG', 'MHP', 'HP', '0'], resRows),
        study('arb-nq', 'NQ100 Arb', ['Speed', '0'], [[NOW_S - MIN_S, 0.5, 0]])
      ], { schema: [{ type: 'time' }] });
      const page = load({ chartsCount: () => 1, chart: () => nq });
      await settle();
      const stats = page.lastDiagnostic();
      assert.equal(stats.seriesLastReason, 'series-published', 'time-only study rows ahead: recorded');
      assert.equal(stats.seriesClockCharts[0].source, 'studies');
      assert.equal(stats.seriesClockCharts[0].studyS, NOW_S - MIN_S);
      assert.equal(stats.seriesClockCharts[0].skewS, -MIN_S);
    }
  })
  // Diagnostics: each minute futures chart's index, symbol, resolution and whether it's active;
  // a widget that hands the same chart object for every index reads it once.
  .then(async () => {
    const nq = chart('F.US.ENQZ26', '1', [
      study('res-nq', 'NQ100 Resilience', ['HG'], [[NOW_S - MIN_S, 1]]),
      study('arb-nq', 'NQ100 Arb', ['Speed'], [[NOW_S - MIN_S, 1]])
    ]);
    const es = chart('F.US.EPZ26', '1', [
      study('res-es', 'SP500 Resilience', ['HG'], [[NOW_S - MIN_S, 1]]),
      study('arb-es', 'SP500 Arb', ['Speed'], [[NOW_S - MIN_S, 1]])
    ]);
    const qqq = chart('QQQ', '1D', []);
    const charts = [qqq, es, nq];
    const page = load({ chartsCount: () => charts.length, chart: (index) => charts[index], activeChartIndex: () => 2 });
    await settle();
    const stats = page.lastDiagnostic();
    assert.equal(stats.seriesClockNowS, NOW_S);
    assert.deepEqual(plain(stats.seriesClockCharts).map((row) => [row.index, row.chart, row.resolution, row.active, row.source]), [
      [1, 'F.US.EPZ26', '1', false, 'candles'],
      [2, 'F.US.ENQZ26', '1', true, 'candles']
    ]);
    assert.equal(stats.seriesClockCharts[1].candleS, NOW_S - MIN_S);
    assert.deepEqual(Array.from(stats.seriesClockCharts[1].tail[0]), [NOW_S - MIN_S, 100, 101, 99, 100.5]);
    // Without `activeChartIndex`, the active chart is the one `activeChart()` returns.
    const byObject = load({ chartsCount: () => 2, chart: (index) => [es, nq][index], activeChart: () => es });
    await settle();
    assert.deepEqual(plain(byObject.lastDiagnostic().seriesClockCharts).map((row) => row.active), [true, false]);
    // Every index the same chart: read once.
    const before = nq.candleCalls.length;
    const same = load({ chartsCount: () => 4, chart: () => nq });
    await settle();
    assert.equal(nq.candleCalls.length - before, 1, 'one chart object, one read');
    assert.equal(same.lastDiagnostic().seriesClockCharts.length, 1);
  })
  .then(() => console.log('browser extension page reader series tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
