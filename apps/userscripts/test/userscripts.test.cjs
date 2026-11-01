const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function loadUserscript(name) {
  const source = readFileSync(join(__dirname, '..', name), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(source, { module, console });
  return { source, exports: module.exports };
}

const restore = loadUserscript('rocket-scooter-restore.user.js');
const riLabel = loadUserscript('rocket-scooter-ri-label.user.js');

for (const { source } of [restore, riLabel]) {
  assert.match(source, /^\/\/ ==UserScript==/);
  assert.match(source, /@match\s+https:\/\/rocket\.place\/pro-plus\*/);
  assert.match(source, /@grant\s+unsafeWindow/);
}

const suffix = (date) => restore.exports.currentContractSuffix(new Date(date));
assert.equal(new Date(restore.exports.thirdFridayUtc(2026, 11)).toISOString().slice(0, 10), '2026-12-18');
assert.equal(new Date(restore.exports.quarterlyRollDateUtc(2026, 11)).toISOString().slice(0, 10), '2026-12-14');
assert.throws(() => restore.exports.quarterlyRollDateUtc(2026, 10));
assert.equal(suffix('2026-03-15T23:59:59Z'), 'H26');
assert.equal(suffix('2026-03-16T00:00:00Z'), 'M26');
assert.equal(suffix('2026-11-01T12:00:00Z'), 'Z26');
assert.equal(suffix('2026-12-13T23:59:59Z'), 'Z26');
assert.equal(suffix('2026-12-14T00:00:00Z'), 'H27');
assert.equal(suffix('2027-01-15T12:00:00Z'), 'H27');

function fakeCell(text) {
  return { textContent: `  ${text}  ` };
}

function fakeRiskTable(rows, headers = ['Contract', 'Month', 'Ticker', 'Product Name', 'Prev Session Close', 'RI', 'YL']) {
  const table = {
    querySelectorAll: (selector) => {
      if (selector === 'th') return headers.map(fakeCell);
      if (selector === 'tbody tr') return rows.map((row) => ({ children: row.map(fakeCell) }));
      return [];
    }
  };
  return { querySelector: (selector) => (selector === '.risk-interval-table table' ? table : null) };
}

const esRow = ['ES', 'Z26', 'F.US.EPZ26', 'E-MINI S&P 500 FUTURES', '7710', '72.00', '570.50'];
const nqRow = ['NQ', 'Z26', 'F.US.ENQZ26', 'E-MINI NASDAQ 100 FUTURES', '29218.25', '292.50', '2317.75'];
const blankRow = ['CL', 'X26', 'F.US.CLEX26', 'CRUDE OIL', '60.1', '-', '1.2'];

const intervals = riLabel.exports.riskIntervalsByTicker(fakeRiskTable([esRow, nqRow, blankRow]));
assert.equal(intervals.size, 2);
assert.equal(intervals.get('F.US.EPZ26'), '72.00');
assert.equal(intervals.get('F.US.ENQZ26'), '292.50');
assert.equal(riLabel.exports.riskIntervalsByTicker({ querySelector: () => null }).size, 0);
assert.equal(riLabel.exports.riskIntervalsByTicker(fakeRiskTable([esRow], ['Contract', 'Ticker'])).size, 0);

function fakeLegend(symbol) {
  const mainRow = { className: 'main' };
  const studies = { className: 'studies' };
  const legend = {
    children: [mainRow, studies],
    symbol,
    querySelector(selector) {
      if (selector === '[data-name="legend-source-title"]') return { textContent: this.symbol };
      return this.children.find((child) => `.${child.className}` === selector) || null;
    },
    insertBefore(node, before) {
      node.remove = () => { this.children.splice(this.children.indexOf(node), 1); };
      this.children.splice(this.children.indexOf(before), 0, node);
    }
  };
  return legend;
}

function fakePage(legends, table) {
  const chartDocument = {
    createElement: () => ({ style: {} }),
    querySelectorAll: () => legends
  };
  return {
    document: {
      querySelector: (selector) => (selector.startsWith('iframe') ? { contentDocument: chartDocument } : table.querySelector(selector))
    }
  };
}

const labelOf = (legend) => legend.children.find((child) => child.className === 'rs-ri-label');
const esLegend = fakeLegend('F.US.EPZ26');
const nqLegend = fakeLegend('F.US.ENQZ26');
const qqqLegend = fakeLegend('QQQ');
const page = fakePage([esLegend, nqLegend, qqqLegend], fakeRiskTable([esRow, nqRow]));

riLabel.exports.refreshLabels(page);
assert.equal(labelOf(esLegend).textContent, 'RI 72.00');
assert.equal(labelOf(nqLegend).textContent, 'RI 292.50');
assert.equal(labelOf(qqqLegend), undefined);
assert.equal(esLegend.children[1], labelOf(esLegend), 'label sits directly below the main legend row');

riLabel.exports.refreshLabels(page);
assert.equal(esLegend.children.length, 3, 'refreshing reuses the existing label');

esLegend.symbol = 'F.US.ENQZ26';
riLabel.exports.refreshLabels(page);
assert.equal(labelOf(esLegend).textContent, 'RI 292.50', 'label follows a symbol change');

esLegend.symbol = 'SPY';
riLabel.exports.refreshLabels(page);
assert.equal(labelOf(esLegend), undefined, 'label is removed when the new symbol has no RI');

assert.doesNotThrow(() => riLabel.exports.refreshLabels({ document: { querySelector: () => null } }));

console.log('userscript tests passed');
