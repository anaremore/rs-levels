const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');

const sharedContext = { URL };
vm.createContext(sharedContext);
vm.runInContext(readFileSync(join(root, 'src', 'shared.js'), 'utf8'), sharedContext);

const settings = sharedContext.RS_LEVELS.cleanSettings({
  serviceUrl: ' http://127.0.0.1:8765/// ',
  captureEnabled: true,
  endpointPatterns: ' level\n\nzone,ddband ',
  maxCaptureBytes: 0
});

assert.equal(settings.serviceUrl, 'http://127.0.0.1:8765');
assert.equal(JSON.stringify(settings.endpointPatterns), JSON.stringify(['level', 'zone', 'ddband']));
assert.equal(settings.maxCaptureBytes, 1024);
assert.equal(sharedContext.RS_LEVELS.defaults.settingsVersion, 4);
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('chart'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('indicator'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('hpa'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('tview/settings'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('tview/indicators'));
assert.ok(!sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('history'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('liq-map'));
assert.ok(sharedContext.RS_LEVELS.defaults.endpointPatterns.includes('dyn-hp'));
assert.equal(JSON.stringify(sharedContext.RS_LEVELS.defaults.symbols), JSON.stringify(['ES', 'NQ']));
assert.deepEqual(
  sharedContext.RS_LEVELS.migrateSettings({ settingsVersion: 1, endpointPatterns: ['level'] }).endpointPatterns,
  sharedContext.RS_LEVELS.mergeEndpointPatterns(['level'], sharedContext.RS_LEVELS.defaults.endpointPatterns)
);
assert.equal(sharedContext.RS_LEVELS.cleanSettings({ maxCaptureBytes: 99999999 }).maxCaptureBytes, 5 * 1024 * 1024);
assert.throws(() => sharedContext.RS_LEVELS.cleanServiceUrl('ftp://example.test'), /http or https/);
assert.throws(() => sharedContext.RS_LEVELS.cleanServiceUrl('not a url'), /Invalid URL/);
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.EPU26'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.EPU'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.EPZ26'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.EPH27'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('MESH27'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('ESU'), 'MES');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.ENQU26'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.ENQU'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.ENQZ26'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('F.US.ENQH27'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('MNQH27'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('NQU'), 'MNQ');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('SPY'), 'SPY');
assert.equal(sharedContext.RS_LEVELS.normalizeDisplaySymbol('QQQ'), 'QQQ');
assert.equal(sharedContext.RS_LEVELS.publicDisplaySymbol('MES'), 'ES');
assert.equal(sharedContext.RS_LEVELS.publicDisplaySymbol('F.US.EPU26'), 'ES');
assert.equal(sharedContext.RS_LEVELS.publicDisplaySymbol('MNQ'), 'NQ');
assert.equal(sharedContext.RS_LEVELS.publicDisplaySymbol('F.US.ENQU26'), 'NQ');
assert.equal(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 2, source: { connected: true, state: 'live' } }), '');
assert.equal(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({ levelCount: 2, source: { connected: true, state: 'live' } }), '');
assert.equal(sharedContext.RS_LEVELS.symbolLevelCount({
  levelCount: 3,
  symbolSummaries: [{ symbol: 'ES', levelCount: 3 }]
}, 'ES'), 3);
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 0, source: { connected: false, state: 'waiting' } }), /No captured levels/);
assert.match(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({ levelCount: 0, source: { connected: false, state: 'waiting' } }), /No captured levels/);
assert.match(sharedContext.RS_LEVELS.selectedSymbolIssue({
  levelCount: 3,
  symbolSummaries: [{ symbol: 'NQ', levelCount: 3 }]
}, 'ES'), /ES/);
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 2, source: { connected: false, state: 'stale' } }), /stale/);
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 2, source: { connected: false, state: 'waiting' } }), /not live/);
assert.match(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({ levelCount: 2, source: { connected: false, state: 'waiting' } }), /not live/);
const bundleJson = sharedContext.RS_LEVELS.cleanTradingViewJsonExport(JSON.stringify({
  exportFormat: 'tradingview-bundle-json',
  symbols: [{ symbol: 'ES', levels: [['OVNHP', 7565, 'hp']] }]
}));
assert.equal(bundleJson.symbols[0].symbol, 'ES');
const singleJson = sharedContext.RS_LEVELS.cleanTradingViewJsonExport(JSON.stringify({
  exportFormat: 'tradingview-json',
  symbol: 'NQ',
  levels: [['OVNMHP', 30475, 'mhp']]
}));
assert.equal(singleJson.symbol, 'NQ');
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewJsonExport('RS' + 'LEVELS|1|MES|2026-06-21T03:12:03.127Z|OVNHP,7565.00,hp'),
  /legacy TradingView text/
);
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewJsonExport(JSON.stringify({
    exportFormat: 'tradingview-json',
    symbol: 'ES',
    compactPayload: 'legacy',
    levels: [{ name: 'OVNHP', price: 7565, kind: 'hp' }]
  })),
  /old TradingView JSON/
);
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewJsonExport(JSON.stringify({
    exportFormat: 'tradingview-json',
    symbol: 'ES',
    levels: [{ name: 'OVNHP', price: 7565, kind: 'hp' }]
  })),
  /invalid TradingView JSON/
);

const rulesContext = { URL };
vm.createContext(rulesContext);
vm.runInContext(readFileSync(join(root, 'src', 'capture-rules.js'), 'utf8'), rulesContext);

const rules = rulesContext.RS_LEVELS_CAPTURE_RULES;
assert.equal(rules.isAllowedCaptureUrl('https://example.test/api/levels/MES', ['levels']), true);
assert.equal(rules.isAllowedCaptureUrl('https://example.test/api/profile', ['levels']), false);
assert.equal(rules.isAllowedCaptureUrl('', ['levels']), false);
assert.equal(rules.endpointFromUrl('/api/levels/MES', 'https://example.test/chart'), '/api/levels/MES');
assert.equal(rules.endpointFromUrl('not a url', ''), 'not a url');
assert.equal(rules.isTextLikeContentType('application/json; charset=utf-8'), true);
assert.equal(rules.isTextLikeContentType('application/problem+json'), true);
assert.equal(rules.isTextLikeContentType('text/plain'), true);
assert.equal(rules.isTextLikeContentType(''), true);
assert.equal(rules.isTextLikeContentType('image/png'), false);
assert.equal(rules.isTextLikeContentType('application/octet-stream'), false);

console.log('browser extension logic tests passed');
