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
      // With market data loaded, the legend title is a description rather than the ticker.
      if (selector === '[data-name="legend-source-title"]') return { textContent: 'E-Mini S&P 500: December 2026' };
      return this.children.find((child) => `.${child.className}` === selector) || null;
    },
    insertBefore(node, before) {
      node.remove = () => { this.children.splice(this.children.indexOf(node), 1); };
      this.children.splice(this.children.indexOf(before), 0, node);
    }
  };
  return legend;
}

function fakePage(legends, table, widgetOverrides = {}) {
  const containers = legends.map((legend) => ({
    querySelector: (selector) => (selector === '[data-name="legend"]' ? legend : null)
  }));
  const chartDocument = {
    createElement: () => ({ style: {} }),
    querySelectorAll: (selector) => (selector === '.chart-container' ? containers : [])
  };
  return {
    tvWidget: {
      _ready: true,
      chartsCount: () => legends.length,
      chart: (index) => ({ symbol: () => legends[index].symbol }),
      ...widgetOverrides
    },
    document: {
      querySelector: (selector) => (selector.startsWith('iframe') ? { contentDocument: chartDocument } : table.querySelector(selector))
    }
  };
}

const labelOf = (legend) => legend.children.find((child) => child.className === 'rs-ri-label');
const esLegend = fakeLegend('F.US.EPZ26');
const nqLegend = fakeLegend('F.US.ENQZ26');
const qqqLegend = fakeLegend('QQQ');
const riskTable = fakeRiskTable([esRow, nqRow]);
const page = fakePage([esLegend, nqLegend, qqqLegend], riskTable);

const unreadyLegend = fakeLegend('F.US.EPZ26');
riLabel.exports.refreshLabels(fakePage([unreadyLegend], riskTable, { _ready: false }));
assert.equal(labelOf(unreadyLegend), undefined, 'no label before the chart widget is ready');

const mismatchedLegend = fakeLegend('F.US.EPZ26');
riLabel.exports.refreshLabels(fakePage([mismatchedLegend], riskTable, { chartsCount: () => 2 }));
assert.equal(labelOf(mismatchedLegend), undefined, 'no label when panes and charts cannot be paired');

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

const backupScript = loadUserscript('rocket-scooter-backup.user.js');
assert.match(backupScript.source, /@run-at\s+document-start/);

function fakeStorage(values) {
  const entries = new Map(Object.entries(values));
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => { entries.set(key, String(value)); },
    keys: () => [...entries.keys()]
  };
}

const EMAIL = 'someone@example.com';
const OTHER_EMAIL = 'other@example.com';
const backupValues = {
  email: EMAIL,
  authSession: 'must-stay-private',
  RSWatchList: JSON.stringify(['F.US.EPZ26', 'NVDA']),
  RS_Window_Layouts: JSON.stringify([{ RSWindowGUID: 'self', meta: { isRightPanelCollapsed: false } }]),
  chart_auto_save: 'true',
  'output-table-width': 'wide',
  rocket_scooter_settings: JSON.stringify({ current_theme: 'dark', 'trading.Broker': 'private-broker' }),
  rocket_scooter_chart_layouts: JSON.stringify({
    [EMAIL]: [{ id: 'a', name: 'Default', content: '{}' }],
    [OTHER_EMAIL]: [{ id: 'b', name: 'Other', content: '{}' }]
  })
};
const backup = backupScript.exports.createBackup(fakeStorage(backupValues), new Date('2026-11-01T12:00:00Z'));
const backupText = JSON.stringify(backup);

assert.equal(backup.format, 'rocket-scooter-backup');
assert.equal(backup.savedAt, '2026-11-01T12:00:00.000Z');
assert.ok(!backupText.includes(EMAIL), 'backup holds no email');
assert.ok(!backupText.includes(OTHER_EMAIL), 'backup holds no other user');
assert.ok(!backupText.includes('must-stay-private'), 'unlisted keys stay out of the backup');
assert.ok(!backupText.includes('private-broker'), 'broker settings stay out of the backup');
assert.equal(JSON.stringify(backup.items.RSWatchList), backupValues.RSWatchList, 'values are stored parsed');
assert.equal(backup.items['output-table-width'], 'wide', 'plain text stays raw');
assert.match(backupScript.exports.describeBackup(backup), /1 chart layout\(s\), 2 watchlist symbol\(s\)/);

const restored = fakeStorage({
  email: EMAIL,
  authSession: 'current-session',
  RSWatchList: JSON.stringify(['OLD']),
  RemovedRiskIntervalTickers: JSON.stringify(['KEEP']),
  rocket_scooter_settings: JSON.stringify({ current_theme: 'light', stale: 1, 'trading.Broker': 'current-broker' }),
  rocket_scooter_chart_layouts: JSON.stringify({ [OTHER_EMAIL]: [{ id: 'b' }], [EMAIL]: [{ id: 'old' }] })
});
backupScript.exports.applyBackup(restored, backupScript.exports.readBackup(backupText));

assert.equal(restored.getItem('RSWatchList'), backupValues.RSWatchList);
assert.equal(restored.getItem('RS_Window_Layouts'), backupValues.RS_Window_Layouts);
assert.equal(restored.getItem('chart_auto_save'), 'true');
assert.equal(restored.getItem('output-table-width'), 'wide');
assert.equal(restored.getItem('authSession'), 'current-session', 'unlisted keys are untouched');
assert.equal(restored.getItem('RemovedRiskIntervalTickers'), JSON.stringify(['KEEP']), 'keys missing from the file are untouched');
assert.equal(
  restored.getItem('rocket_scooter_settings'),
  JSON.stringify({ 'trading.Broker': 'current-broker', current_theme: 'dark' }),
  'settings are replaced except for the current broker state'
);
const restoredLayouts = JSON.parse(restored.getItem('rocket_scooter_chart_layouts'));
assert.equal(restoredLayouts[EMAIL][0].id, 'a', 'layouts restore under the current user');
assert.equal(restoredLayouts[OTHER_EMAIL][0].id, 'b', 'other users keep their layouts');

const movedUser = fakeStorage({ email: OTHER_EMAIL });
backupScript.exports.applyBackup(movedUser, backupScript.exports.readBackup(backupText));
assert.equal(JSON.parse(movedUser.getItem('rocket_scooter_chart_layouts'))[OTHER_EMAIL][0].id, 'a', 'a backup restores under a different login');

const hostile = fakeStorage({ email: EMAIL, authSession: 'current-session' });
backupScript.exports.applyBackup(hostile, backupScript.exports.readBackup(JSON.stringify({
  format: 'rocket-scooter-backup',
  version: 1,
  items: { authSession: 'overwritten', email: 'overwritten', RSWatchList: ['SPY'] }
})));
assert.equal(hostile.getItem('authSession'), 'current-session', 'a file cannot write unlisted keys');
assert.equal(hostile.getItem('email'), EMAIL, 'a file cannot change the signed-in user');
assert.equal(hostile.getItem('RSWatchList'), JSON.stringify(['SPY']));

assert.throws(() => backupScript.exports.readBackup('not json'), /not a Rocket Scooter backup/);
assert.throws(() => backupScript.exports.readBackup('{"format":"other","items":{}}'), /not a Rocket Scooter backup/);
assert.throws(() => backupScript.exports.readBackup('{"format":"rocket-scooter-backup","version":99,"items":{}}'), /version 99/);
assert.throws(
  () => backupScript.exports.applyBackup(fakeStorage({}), backupScript.exports.readBackup(backupText)),
  /Sign in/
);

console.log('userscript tests passed');
