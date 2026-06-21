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
  return {
    info: { id, name },
    object: {
      _study: {
        metaInfo: () => ({
          plots: [{ id: 'plot_0' }],
          styles: { plot_0: { title: plotTitle } }
        }),
        data: () => ({
          each: (callback) => callback(0, [0, value])
        })
      }
    }
  };
}

const charts = [
  makeChart('F.US.EPU26', [
    makeShape('es-hp', 'horizontal_line', [{ price: 7565 }], { text: 'OVNHP', linecolor: '#2962ff' }),
    makeShape('es-open', 'horizontal_line', [{ price: 7559 }], { text: 'SPY Open : 7,559 Liquidity Map', linecolor: '#e0e0e0' }),
    makeShape('es-yellow', 'horizontal_line', [{ price: 7598 }], { linecolor: '#ffeb3b' }),
    makeShape('es-red', 'horizontal_line', [{ price: 7520 }], { linecolor: 'rgb(242, 54, 69)' }),
    makeShape('es-bull-zone', 'rectangle', [{ price: 7580 }, { price: 7560 }], { text: 'Bull Zone', backgroundColor: '#4caf50' })
  ]),
  makeChart('F.US.ENQU26', [
    makeShape('nq-cat', 'horizontal_line', [{ price: 31232.74 }], { text: 'CAT', linecolor: '#7e57c2' }),
    makeShape('nq-bear-zone', 'rectangle', [{ price: 30710 }, { price: 30680 }], { text: 'Bear Zone', backgroundColor: '#f06292' })
  ], [
    makeStudy('nq-liquidity', 'Liquidity Map', 'MidGap', 30625.75)
  ]),
  makeChart('SPY', [
    makeShape('spy-close', 'horizontal_line', [{ price: 722.51 }], { text: 'PrevDayClose' })
  ])
];

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
      captureEnabled: true,
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
assert.equal(body.reader.chartCount, 3);
assert.equal(body.chartLines.length, 5);
assert.equal(body.referenceLines.length, 2);
assert.equal(body.zoneRectangles.length, 2);
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'OVNHP' && level.price === 7565));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Open' && level.price === 7559));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Yellow Line' && level.kind === 'yellow-line' && level.price === 7598));
assert.ok(body.levels.some((level) => level.symbol === 'MES' && level.name === 'Red Line' && level.kind === 'red-line' && level.price === 7520));
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.name === 'CAT' && level.kind === 'cat' && level.price === 31232.74));
assert.equal(body.levels.some((level) => /Liquidity Map|horizontal|text/i.test(level.name)), false);
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.kind === 'zone-bear'));
assert.ok(body.levels.some((level) => level.symbol === 'MNQ' && level.name === 'MidGap'));
assert.equal(body.levels.some((level) => level.symbol === 'SPY' || level.price === 722.51), false);

console.log('browser extension page reader tests passed');
