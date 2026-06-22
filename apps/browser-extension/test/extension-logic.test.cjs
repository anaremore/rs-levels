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
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 0, source: { connected: false, state: 'waiting' } }), /No captured display data/);
assert.match(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({ levelCount: 0, source: { connected: false, state: 'waiting' } }), /No captured display data/);
assert.equal(sharedContext.RS_LEVELS.hasAnyDisplayData({
  levelCount: 0,
  symbolSummaries: [{ symbol: 'ES', levelCount: 0, stats: { mapCode: 'BLD' } }]
}), true);
assert.equal(sharedContext.RS_LEVELS.summaryHasDisplayData({ levelCount: 0, stats: { dd: 0 } }), true);
assert.equal(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({
  levelCount: 0,
  source: { connected: true, state: 'capturing' },
  symbolSummaries: [{ symbol: 'ES', levelCount: 0, stats: { mapCode: 'BLD' } }]
}), '');
assert.equal(sharedContext.RS_LEVELS.selectedSymbolIssue({
  levelCount: 0,
  symbolSummaries: [{ symbol: 'ES', levelCount: 0, stats: { mapCode: 'BLD' } }]
}, 'ES'), '');
assert.match(sharedContext.RS_LEVELS.selectedSymbolIssue({
  levelCount: 3,
  symbolSummaries: [{ symbol: 'NQ', levelCount: 3 }]
}, 'ES'), /ES/);
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 2, source: { connected: false, state: 'stale' } }), /stale/);
assert.match(sharedContext.RS_LEVELS.tradingViewCopyIssue({ levelCount: 2, source: { connected: false, state: 'waiting' } }), /not live/);
assert.match(sharedContext.RS_LEVELS.tradingViewBundleCopyIssue({ levelCount: 2, source: { connected: false, state: 'waiting' } }), /not live/);
const bundlePayload = sharedContext.RS_LEVELS.cleanTradingViewPayload('RSLEVELS|2|2026-06-21T03:47:05.860Z|ES|2026-06-21T03:47:02.097Z|OVNHP,7565,hp;DD,0.66,stat|NQ|2026-06-21T03:47:02.097Z|OVNMHP,30475,mhp;Map BLD,0,stat');
assert.match(bundlePayload, /^RSLEVELS\|2\|/);
const singlePayload = sharedContext.RS_LEVELS.cleanTradingViewPayload('RSLEVELS|2|2026-06-21T03:47:05.860Z|NQ|2026-06-21T03:47:02.097Z|OVNMHP,30475,mhp');
assert.match(singlePayload, /\|NQ\|/);
const localSnapshot = sharedContext.RS_LEVELS.captureToTradingViewSnapshot({
  capturedAt: '2026-06-21T03:47:05.860Z',
  body: JSON.stringify({
    symbol: 'MES',
    capturedAt: '2026-06-21T03:47:02.097Z',
    levels: [
      { name: 'text SPY Open : 7559 Liquidity Map', price: 7559, kind: 'open-close' },
      { name: 'MidGap', price: 7569, kind: 'open-close' },
      { name: 'DD', price: 7579.75, kind: 'dd-band' },
      { name: 'DD', price: 7506, kind: 'dd-band' },
      { name: 'Bull Zone', price: 7566.4, kind: 'zone-bull' },
      { name: 'Bear Zone', price: 7556.2, kind: 'zone-bear' },
      { name: 'Yellow Line', price: 7598, kind: 'yellow-line' },
      { name: 'Red Line', price: 7520, kind: 'red-line' },
      { symbol: 'F.US.ENQU26', name: 'OVNMHP', price: 30475, kind: 'mhp' },
      { symbol: 'F.US.ENQU26', name: 'CAT', price: 31232.74, kind: 'cat' },
      { symbol: 'F.US.ENQU26', name: 'horizontalLine', price: 30380, kind: 'redline', color: '#F23645' },
      { symbol: 'F.US.ENQU26', name: 'horizontal_line RedLine', price: 30182, kind: 'unknown', color: '#F23645' },
      { symbol: 'F.US.ENQU26', name: 'RL2', price: 30090, kind: 'reference', color: '#F23645' },
      { symbol: 'F.US.ENQU26', name: 'YL2', price: 30979, kind: 'unknown', color: '#FFEB3B' },
      { symbol: 'SPY', name: 'Open', price: 740, kind: 'open-close' }
    ],
    stats: {
      ES: { dd: 0.66, riskInterval: 68.75, resilience: 14.47, monthlyResilience: 19.87, mapCode: 'BLD' },
      NQ: { dd: 0.66, riskInterval: 266.25, resilience: 73.82, monthlyResilience: 49.87, weeklyResilience: -29.29, mapCode: 'BLD' }
    }
  })
});
assert.equal(JSON.stringify(localSnapshot.symbols.map((row) => row.symbol)), JSON.stringify(['ES', 'NQ']));
const localPayload = sharedContext.RS_LEVELS.tradingViewPayloadFromSnapshot(localSnapshot, 'ALL');
assert.match(localPayload, /^RSLEVELS\|2\|2026-06-21T03:47:02\.097Z\|ES\|/);
assert.match(localPayload, /Open,7559,open-close/);
assert.match(localPayload, /Half Gap,7569,open-close/);
assert.match(localPayload, /Bull Zone Top 1,7579\.75,zone-bull/);
assert.match(localPayload, /Bull Zone Bottom 1,7566\.4,zone-bull/);
assert.match(localPayload, /Bear Zone Top 1,7556\.2,zone-bear/);
assert.match(localPayload, /Bear Zone Bottom 1,7506,zone-bear/);
assert.doesNotMatch(localPayload, /Bull Zone,|Bear Zone,/);
assert.doesNotMatch(localPayload, /\bBZT\d*,|\bBZB\d*,|\bBrZT\d*,|\bBrZB\d*,/);
assert.match(localPayload, /Yellow Line,7598,yellow-line/);
assert.match(localPayload, /Red Line,7520,red-line/);
assert.match(localPayload, /DD,0\.66,stat/);
assert.match(localPayload, /RI,68\.75,stat/);
assert.match(localPayload, /Res,14\.47,stat/);
assert.match(localPayload, /MRes,19\.87,stat/);
assert.match(localPayload, /Map BLD,0,stat/);
assert.match(localPayload, /\|NQ\|2026-06-21T03:47:02\.097Z\|OVNMHP,30475,mhp/);
assert.match(localPayload, /CAT,31232\.74,cat/);
assert.match(localPayload, /Red Line,30380,red-line/);
assert.match(localPayload, /Red Line,30182,red-line/);
assert.match(localPayload, /Red Line,30090,red-line/);
assert.match(localPayload, /Yellow Line,30979,yellow-line/);
assert.match(localPayload, /RI,266\.25,stat/);
assert.match(localPayload, /WRes,-29\.29,stat/);
assert.doesNotMatch(localPayload, /MidGap|Mid Gap/);
assert.doesNotMatch(localPayload, /\|SPY\|/);
assert.match(sharedContext.RS_LEVELS.tradingViewPayloadFromSnapshot(localSnapshot, 'NQ'), /^RSLEVELS\|2\|[^|]+\|NQ\|/);

const mismatchedZoneSideSnapshot = sharedContext.RS_LEVELS.captureToTradingViewSnapshot({
  capturedAt: '2026-06-22T14:35:00.000Z',
  body: JSON.stringify({
    symbol: 'F.US.ENQU26',
    capturedAt: '2026-06-22T14:35:00.000Z',
    levels: [
      { name: 'DD', price: 30992.75, kind: 'dd-band' },
      { name: 'DD', price: 30460.25, kind: 'dd-band' },
      { name: 'Bear Zone', price: 30655.75, kind: 'zone-bull' },
      { name: 'Bull Zone', price: 30697.25, kind: 'zone-bear' },
      { name: 'BrZT4', price: 30380, kind: 'zone-bull' },
      { name: 'BZT4', price: 30992.75, kind: 'zone-bear' }
    ]
  })
});
const mismatchedZoneSidePayload = sharedContext.RS_LEVELS.tradingViewPayloadFromSnapshot(mismatchedZoneSideSnapshot, 'NQ');
assert.match(mismatchedZoneSidePayload, /Bear Zone Top 5,30655\.75,zone-bear/);
assert.match(mismatchedZoneSidePayload, /Bear Zone Bottom 5,30460\.25,zone-bear/);
assert.match(mismatchedZoneSidePayload, /Bull Zone Top 5,30992\.75,zone-bull/);
assert.match(mismatchedZoneSidePayload, /Bull Zone Bottom 5,30697\.25,zone-bull/);
assert.match(mismatchedZoneSidePayload, /Bear Zone Top 4,30380,zone-bear/);
assert.match(mismatchedZoneSidePayload, /Bull Zone Top 4,30992\.75,zone-bull/);
assert.doesNotMatch(mismatchedZoneSidePayload, /Bear Zone,|Bull Zone,/);
assert.doesNotMatch(mismatchedZoneSidePayload, /\bBZT\d*,|\bBZB\d*,|\bBrZT\d*,|\bBrZB\d*,/);

const derivedRiSnapshot = sharedContext.RS_LEVELS.captureToTradingViewSnapshot({
  capturedAt: '2026-06-21T03:48:01.000Z',
  body: JSON.stringify({
    symbol: 'MES',
    capturedAt: '2026-06-21T03:48:00.000Z',
    levels: [
      { name: 'DD', price: 7643.5, kind: 'dd-band' },
      { name: 'DD', price: 7506, kind: 'dd-band' }
    ],
    stats: {
      ES: { dd: 0.66 }
    }
  })
});
const derivedRiPayload = sharedContext.RS_LEVELS.tradingViewPayloadFromSnapshot(derivedRiSnapshot, 'ES');
assert.match(derivedRiPayload, /RI,68\.75,stat/);

const chartLineOnlySnapshot = sharedContext.RS_LEVELS.captureToTradingViewSnapshot({
  capturedAt: '2026-06-21T03:48:05.860Z',
  body: JSON.stringify({
    type: 'rs_snapshot',
    source: 'page-reader',
    capturedAt: '2026-06-21T03:48:02.097Z',
    chartLines: [
      { index: 'ES', chart: 'F.US.EPU26', price: 7598, color: '#ffeb3b' },
      { index: 'ES', chart: 'F.US.EPU26', price: 7632, color: '#ffeb3b' },
      { index: 'ES', chart: 'F.US.EPU26', text: 'RL', price: 7520, linecolor: 'rgb(242, 54, 69)' },
      { index: 'ES', chart: 'F.US.EPU26', text: 'RL2', price: 7516, linecolor: 'rgb(242, 54, 69)' },
      { index: 'ES', chart: 'F.US.EPU26', text: 'YL2', price: 7608, linecolor: '#ffeb3b' },
      { index: 'NQ', chart: 'F.US.ENQU26', name: 'horizontal_line', price: 30380, color: '#f23645' },
      { index: 'NQ', chart: 'F.US.ENQU26', text: 'CAT', price: 31232.74, color: '#7e57c2' },
      { index: 'SPY', chart: 'SPY', text: 'PrevDayClose', price: 722.51 }
    ],
    referenceLines: [
      { index: 'ES', name: 'Red Line', price: 7496, color: '#f23645' }
    ]
  })
});
const chartLineOnlyPayload = sharedContext.RS_LEVELS.tradingViewPayloadFromSnapshot(chartLineOnlySnapshot, 'ALL');
assert.match(chartLineOnlyPayload, /Yellow Line,7598,yellow-line/);
assert.match(chartLineOnlyPayload, /Yellow Line,7632,yellow-line/);
assert.match(chartLineOnlyPayload, /Red Line,7520,red-line/);
assert.match(chartLineOnlyPayload, /Red Line,7516,red-line/);
assert.match(chartLineOnlyPayload, /Yellow Line,7608,yellow-line/);
assert.match(chartLineOnlyPayload, /Red Line,7496,red-line/);
assert.match(chartLineOnlyPayload, /Red Line,30380,red-line/);
assert.match(chartLineOnlyPayload, /CAT,31232\.74,cat/);
assert.doesNotMatch(chartLineOnlyPayload, /horizontal_line/);
assert.doesNotMatch(chartLineOnlyPayload, /horizontalLine/);
assert.doesNotMatch(chartLineOnlyPayload, /\|SPY\|/);

assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewPayload('RS' + 'LEVELS|1|MES|2026-06-21T03:12:03.127Z|OVNHP,7565.00,hp'),
  /unsupported TradingView payload/
);
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewPayload('RSLEVELS|2|2026-06-21T03:47:05.860Z|SPY|2026-06-21T03:47:02.097Z|Open,7559,open-close'),
  /unsupported symbol/
);
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewPayload('RSLEVELS|2|2026-06-21T03:47:05.860Z|ES|2026-06-21T03:47:02.097Z|OVNHP,not-a-price,hp'),
  /invalid TradingView payload/
);
assert.throws(
  () => sharedContext.RS_LEVELS.cleanTradingViewPayload('RSLEVELS|2|2026-06-21T03:47:05.860Z|ES|2026-06-21T03:47:02.097Z|OVNHP 7565 hp'),
  /invalid TradingView payload/
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
