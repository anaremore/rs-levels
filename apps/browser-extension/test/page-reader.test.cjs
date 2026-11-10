const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');
const posts = [];
const listeners = {};

function addEventListener(type, callback) {
  listeners[type] = listeners[type] || [];
  listeners[type].push(callback);
}

function makeShape(id, name, points, props) {
  return {
    info: { id, name },
    object: {
      getPoints: () => points,
      getProperties: () => props
    }
  };
}

function makeChart(symbol, shapes, studies = []) {
  const shapeMap = new Map(shapes.map((shape) => [shape.info.id, shape.object]));
  const studyMap = new Map(studies.map((study) => [study.info.id, study.object]));
  return {
    symbol: () => symbol,
    getAllShapes: () => shapes.map((shape) => shape.info),
    getShapeById: (id) => shapeMap.get(id),
    getAllStudies: () => studies.map((study) => study.info),
    getStudyById: (id) => studyMap.get(id)
  };
}

function makeStudy(id, name, plotTitle, value) {
  return makeStudyValues(id, name, [plotTitle], [[0, value]]);
}

function makeStudyValues(id, name, plotTitles, values) {
  return {
    info: { id, name },
    object: {
      _study: {
        metaInfo: () => ({
          plots: plotTitles.map((_title, index) => ({ id: `plot_${index}` })),
          styles: Object.fromEntries(plotTitles.map((title, index) => [`plot_${index}`, { title }]))
        }),
        data: () => ({
          each: (callback) => values.forEach((row, index) => callback(index, row))
        })
      }
    }
  };
}

function makeCell(text) {
  return { textContent: text };
}

function makeRow(cells) {
  return {
    querySelectorAll: (selector) => selector === 'th,td' || selector.includes('[role=')
      ? cells.map(makeCell)
      : []
  };
}

function makeTable(rows) {
  return {
    querySelectorAll: (selector) => selector === 'tr' ? rows : []
  };
}

const charts = [
  makeChart('F.US.EPU26', [
    makeShape('es-hp', 'horizontal_line', [{ price: 7565 }], { text: 'OVNHP', linecolor: '#2962ff' }),
    makeShape('es-hp-2', 'horizontal_line', [{ price: 7548.75 }], { text: 'OVNHP', linecolor: '#2962ff' }),
    makeShape('es-hp-duplicate', 'horizontal_line', [{ price: 7565 }], { text: 'OVNHP', linecolor: '#2962ff' }),
    makeShape('es-mhp', 'horizontal_line', [{ price: 7588.5 }], { text: 'OVNMHP', linecolor: '#ff9800' }),
    makeShape('es-mhp-2', 'horizontal_line', [{ price: 7600.25 }], { text: 'OVNMHP', linecolor: '#ff9800' }),
    makeShape('es-open', 'horizontal_line', [{ price: 7559 }], { text: 'SPY Open : 7,559 Liquidity Map', linecolor: '#e0e0e0' }),
    makeShape('es-yellow', 'horizontal_line', [{ price: 7598 }], { linecolor: '#ffeb3b' }),
    makeShape('es-yellow-2', 'horizontal_line', [{ price: 7632 }], { linecolor: '#ffeb3b' }),
    makeShape('es-yellow-3', 'horizontal_line', [{ price: 7608 }], { text: 'YL2', linecolor: '#ffeb3b' }),
    makeShape('es-red', 'horizontal_line', [{ price: 7520 }], { linecolor: 'rgb(242, 54, 69)' }),
    makeShape('es-red-2', 'horizontal_line', [{ price: 7496 }], { linecolor: 'rgb(242, 54, 69)' }),
    makeShape('es-red-3', 'horizontal_line', [{ price: 7516 }], { text: 'RL2', linecolor: 'rgb(242, 54, 69)' }),
    makeShape('es-bull-zone-label', 'horizontal_line', [{ price: 7566.4 }], { text: 'Bull Zone', linecolor: '#4caf50' }),
    makeShape('es-bull-zone', 'rectangle', [{ price: 7580 }, { price: 7560 }], { backgroundColor: '#555555' }),
    // The static HP and MHP, drawn by the page on the futures chart at its own (converted)
    // price; the label names the ETF value (synthetic).
    makeShape('es-static-hp', 'horizontal_line', [{ price: 7492.25 }], { text: 'SPY HP : 745 Liquidity Map', linecolor: '#00ffff' }),
    makeShape('es-static-mhp', 'horizontal_line', [{ price: 7502 }], { text: 'SPY MHP : 746 Liquidity Map', linecolor: '#ff9800' })
  ], [
    makeStudyValues('es-dynamic-hp', 'Dynamic HP', ['Dyn MHP', 'Dyn HP'], [
      [0, 7715.75, 7707.5]
    ])
  ]),
  makeChart('F.US.ENQU26', [
    makeShape('nq-cat', 'horizontal_line', [{ price: 31232.74 }], { text: 'CAT', linecolor: '#7e57c2' }),
    makeShape('nq-bear-zone', 'rectangle', [{ price: 30710 }, { price: 30680 }], { text: 'Bea Zone', backgroundColor: '#f06292' }),
    makeShape('nq-static-hp', 'horizontal_line', [{ price: 27843 }], { text: 'QQQ HP : 672.5 Liquidity Map', linecolor: '#00ffff' }),
    makeShape('nq-static-mhp', 'horizontal_line', [{ price: 27957.5 }], { text: 'QQQ MHP : 675 Liquidity Map', linecolor: '#ff9800' })
  ], [
    makeStudyValues('nq-dynamic-hp', 'Dynamic HP', ['Dyn MHP', 'Dyn HP'], [
      [0, 28064, 28044]
    ]),
    makeStudy('nq-liquidity', 'Liquidity Map', 'MidGap', 30625.75),
    makeStudyValues('nq-resilience', 'NQ100 Resilience', ['Res', 'MRes', 'WRes'], [
      [0, 0, 0, 0],
      [1, 73.82, 49.87, -29.29]
    ])
  ]),
  makeChart('SPY', [
    makeShape('spy-close', 'horizontal_line', [{ price: 722.51 }], { text: 'PrevDayClose' })
  ]),
  makeChart('NVDA', [
    makeShape('nvda-hp', 'horizontal_line', [{ price: 202.5 }], { text: 'HP: 202.5', linecolor: '#00ffff' }),
    makeShape('nvda-mhp', 'horizontal_line', [{ price: 205 }], { text: 'MHP: 205', linecolor: '#ff9800' })
  ])
];

const riskIntervalTable = makeTable([
  makeRow(['Contract', 'Month', 'Ticker', 'Product Name', 'Prev Session Close', 'RI', 'YL', 'DD-Band-U', 'DD-Band-L', 'Action']),
  makeRow(['MES', 'U26', 'F.US.MESU26', 'MICRO E-MINI S&P500 FUTURES', '7574.75', '68.75', '545.00', '7643.50', '7506.00', '']),
  makeRow(['MNQ', 'U26', 'F.US.MNQU26', 'MICRO E-MINI NASDAQ 100 FUTURE', '30726.5', '266.25', '2109.00', '30992.75', '30460.25', ''])
]);

const context = {
  Array,
  Date,
  JSON,
  Map,
  Math,
  Number,
  Object,
  RegExp,
  Set,
  String,
  addEventListener,
  clearInterval: () => {},
  console,
  location: { origin: 'https://rocket.place' },
  postMessage: (message, origin) => posts.push({ message, origin }),
  setInterval: () => 1,
  document: {
    querySelector: (selector) => selector === 'nav.navbar'
      ? { textContent: 'SP500: DD: 0.66 Res: 14.47 | 19.87 HP: 00.00 MHP: 00.00 NQ100: Res 73.82 | 49.87 HP: 00.00 MHP: 00.00' }
      : null,
    querySelectorAll: (selector) => selector === 'table' ? [riskIntervalTable] : []
  },
  RS_SOCK: {
    scanner: {
      MASTER_TABLE: {
        data: {
          SPY: { BBrMr: 'B', LS: 'L', UD: 'D' },
          NVDA: { symbol: 'NVDA', hp: 202.5, mhp: 205, mapCode: 'BLD' },
          QQQ: { mapCode: 'BLD' },
          MES: { Contract: 'MES', RI: 1 },
          MNQ: { Contract: 'MNQ', RI: 2 },
          NQ: { Ticker: 'F.US.ENQU26', RI: 3 }
        }
      }
    }
  },
  tvWidget: {
    chartsCount: () => charts.length,
    chart: (index) => charts[index]
  },
  window: null
};
context.window = context;
context.globalThis = context;

vm.createContext(context);
vm.runInContext(readFileSync(join(root, 'src', 'page-reader.js'), 'utf8'), context);

assert.ok(posts.some((post) => post.message.type === 'diagnostic' && post.message.stats.lastReason === 'reader-installed'));

const vmWindow = vm.runInContext('window', context);
for (const callback of listeners.message || []) {
  callback({
    source: vmWindow,
    origin: 'https://rocket.place',
    data: {
      source: 'rs-levels-content',
      type: 'settings',
      maxCaptureBytes: 1024 * 1024
    }
  });
}

const captureMessage = posts.map((post) => post.message).find((message) => message.type === 'capture');
assert.ok(captureMessage, 'page reader should publish a display capture after settings sync');
assert.equal(captureMessage.capture.endpoint, '/page-reader/display');

const body = JSON.parse(captureMessage.capture.body);
assert.equal(body.type, 'rs_snapshot');
assert.equal(body.source, 'page-reader');
assert.equal(body.reader.chartCount, 4);
assert.equal(body.reader.statCount, 4);
assert.equal(body.chartLines.length, 20);
assert.equal(body.referenceLines.length, 7); // incl. the NQ chart's Dyn MHP and Dyn HP
assert.equal(body.zoneRectangles.length, 2);
assert.equal(body.levels.filter((level) => level.symbol === 'MES' && level.name === 'OVNHP').length, 2);
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'OVNHP' && level.price === 7565));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'OVNHP' && level.price === 7548.75));
assert.equal(body.levels.filter((level) => level.symbol === 'MES' && level.name === 'OVNMHP').length, 2);
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'OVNMHP' && level.price === 7588.5));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'OVNMHP' && level.price === 7600.25));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Dyn MHP' && level.kind === 'mhp' && level.price === 7715.75));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Dyn HP' && level.kind === 'hp' && level.price === 7707.5));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Open' && level.price === 7559));
assert.equal(body.levels.filter((level) => level.symbol === 'MES' && level.name === 'Yellow Line' && level.kind === 'yellow-line').length, 3);
assert.equal(body.levels.filter((level) => level.symbol === 'MES' && level.name === 'Red Line' && level.kind === 'red-line').length, 3);
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Yellow Line' && level.price === 7598));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Yellow Line' && level.price === 7632));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Yellow Line' && level.price === 7608));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Red Line' && level.price === 7520));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Red Line' && level.price === 7496));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Red Line' && level.price === 7516));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Bull Zone' && level.kind === 'zone-bull' && level.price === 7566.4));
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.name === 'CAT' && level.kind === 'cat' && level.price === 31232.74));
assert.equal(body.levels.some((level) => /Liquidity Map|horizontal|text/i.test(level.name)), false);
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.kind === 'zone-bear'));
assert.equal(body.levels.some((level) => /Bea Zone/i.test(level.name)), false);
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.name === 'MidGap'));
assert.ok(body.levels.some((level) => level.symbol === 'SPY' && level.price === 722.51));
assert.ok(body.levels.some((level) => level.symbol === 'NVDA' && level.name === 'HP' && level.price === 202.5));
assert.ok(body.levels.some((level) => level.symbol === 'NVDA' && level.name === 'MHP' && level.price === 205));
assert.equal(body.stats.NVDA.mapCode, 'BLD');
assert.deepEqual(body.charts.map((chart) => chart.symbol), ['MES', 'MNQ', 'SPY', 'NVDA']);
assert.equal(body.stats.MES.dd, 0.66);
assert.equal(body.stats.MES.riskInterval, 68.75);
assert.equal(body.stats.MES.resilience, 14.47);
assert.equal(body.stats.MES.monthlyResilience, 19.87);
assert.equal(body.stats.MES.mapCode, 'BLD');
assert.equal(body.stats.MNQ.dd, 0.66);
assert.equal(body.stats.MNQ.riskInterval, 266.25);
assert.equal(body.stats.MNQ.resilience, 73.82);
assert.equal(body.stats.MNQ.monthlyResilience, 49.87);
assert.equal(body.stats.MNQ.weeklyResilience, -29.29);
assert.equal(body.stats.MNQ.mapCode, 'BLD');

// The static HP and MHP: read off the futures chart at its own price (never the ETF's value),
// next to Dyn HP and Dyn MHP.
for (const [symbol, hp, mhp] of [['MES', 7492.25, 7502], ['MNQ', 27843, 27957.5]]) {
  assert.ok(body.levels.some((level) => level.symbol === symbol && level.name === 'HP' && level.kind === 'hp' && level.price === hp), symbol);
  assert.ok(body.levels.some((level) => level.symbol === symbol && level.name === 'MHP' && level.kind === 'mhp' && level.price === mhp), symbol);
  assert.ok(body.levels.some((level) => level.symbol === symbol && level.name === 'Dyn HP'), symbol);
  assert.ok(body.levels.some((level) => level.symbol === symbol && level.name === 'Dyn MHP'), symbol);
  assert.equal(body.levels.some((level) => level.symbol === symbol && (level.price === 745 || level.price === 672.5)), false, 'never the ETF value');
}

// Through the service's parser, as the extension posts it: all four per index.
(async () => {
  const { normalizeCapture } = await import('../../../packages/core-parser/src/index.js');
  const parsed = normalizeCapture(captureMessage.capture);
  for (const [symbol, hp, mhp] of [['MES', 7492.25, 7502], ['MNQ', 27843, 27957.5]]) {
    const rows = parsed.symbols[symbol] || [];
    const one = (name) => rows.filter((level) => level.name === name);
    assert.equal(one('HP').length, 1, `${symbol} HP once`);
    assert.equal(one('HP')[0].price, hp);
    assert.equal(one('HP')[0].kind, 'hp');
    assert.equal(one('HP')[0].metadata.reader, 'shape-line', 'its source noted');
    assert.equal(one('MHP').length, 1, `${symbol} MHP once`);
    assert.equal(one('MHP')[0].price, mhp);
    assert.equal(one('MHP')[0].kind, 'mhp');
    assert.equal(one('Dyn HP').length, 1);
    assert.equal(one('Dyn MHP').length, 1);
  }
  console.log('browser extension page reader tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
