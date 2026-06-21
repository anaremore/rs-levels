const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');

const dashboardHtml = read('html-dashboard/index.html');
const dashboardJs = read('html-dashboard/app.js');
const dashboardCss = read('html-dashboard/styles.css');
const nodeSnapshot = read('node-client/snapshot.mjs');
const nodeStream = read('node-client/stream.mjs');
const pythonSnapshot = read('python-client/snapshot.py');
const pythonStream = read('python-client/stream.py');
const sampleCapture = JSON.parse(read('sample-captures/mes-levels.json'));

assert.match(dashboardHtml, /<table>/);
assert.match(dashboardHtml, /app\.js/);
assert.match(dashboardCss, /summary-grid/);
assert.match(dashboardJs, /\/snapshot/);
assert.match(dashboardJs, /\/stream/);
assert.match(dashboardJs, /\/tradingview\/\$\{selectedSymbol\(\)\}/);
assert.doesNotMatch(dashboardHtml, /copy-tv/);
assert.doesNotMatch(dashboardJs, /copyTv/);
assert.match(nodeSnapshot, /RS_LEVELS_URL/);
assert.match(nodeStream, /\/stream/);
assert.match(pythonSnapshot, /urllib\.request/);
assert.match(pythonStream, /stream_events/);
assert.equal(sampleCapture.body.symbol, 'MES');
assert.equal(sampleCapture.body.levels.length, 5);
assert.ok(sampleCapture.body.levels.every((level) => Number.isFinite(Number(level.price))));

for (const source of [dashboardJs, nodeSnapshot, nodeStream, pythonSnapshot, pythonStream]) {
  assert.doesNotMatch(source, /\bstrategy\b/i);
  assert.doesNotMatch(source, new RegExp('\\b' + 'ord' + 'er' + '\\b', 'i'));
}

console.log('examples tests passed');

function read(relative) {
  return readFileSync(join(root, relative), 'utf8');
}
