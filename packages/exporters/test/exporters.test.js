import assert from 'node:assert/strict';
import {
  createTradingViewBundlePayloadExport,
  createTradingViewPayloadExport
} from '../src/index.js';

const row = {
  symbol: 'ES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  stats: {
    dd: 0.66,
    resilience: 73.82,
    monthlyResilience: 49.87,
    weeklyResilience: -29.29,
    mapCode: 'BLD'
  },
  levels: [
    { name: 'OVNHP', price: 7537, kind: 'hp', color: '#2962FF' },
    { name: 'DD Upper; bad|chars', price: 7579.75, kind: 'dd-band', color: '#29B6F6' },
    { name: 'BZT1', price: 7588, kind: 'zone-bull', color: '#4CAF50' },
    { name: 'BrZT1', price: 7612, kind: 'zone-bear', color: '#F06292' },
    { name: 'Yellow Line', price: 7598, kind: 'yellow-line', color: '#FFEB3B' },
    { name: 'Red Line', price: 7520, kind: 'red-line', color: '#F23645' },
    { name: 'CAT', price: 7820, kind: 'cat', color: '#7E57C2' },
    { name: 'text SPY Open : 7,559 Liquidity Map', price: 7559, kind: 'open-close', color: '#E0E0E0' }
  ]
};

const payload = createTradingViewPayloadExport(row, { generatedAt: '2026-06-19T14:30:00.000Z' });
assert.match(payload, /^RSLEVELS\|2\|2026-06-19T14:30:00\.000Z\|ES\|2026-06-19T14:29:59\.500Z\|/);
assert.match(payload, /DD Upper bad chars,7579\.75,dd-band/);
assert.match(payload, /BZT1,7588,zone-bull/);
assert.match(payload, /BrZT1,7612,zone-bear/);
assert.match(payload, /Yellow Line,7598,yellow-line/);
assert.match(payload, /Red Line,7520,red-line/);
assert.match(payload, /CAT,7820,cat/);
assert.match(payload, /Open,7559,open-close/);
assert.match(payload, /DD,0\.66,stat/);
assert.match(payload, /Res,73\.82,stat/);
assert.match(payload, /MRes,49\.87,stat/);
assert.match(payload, /WRes,-29\.29,stat/);
assert.match(payload, /Map BLD,0,stat/);
assert.doesNotMatch(payload, /compactPayload|notes|tradingview-json|tradingview-bundle-json/);

const genericManualLinePayload = createTradingViewPayloadExport({
  symbol: 'NQ',
  capturedAt: '2026-06-21T18:00:00.000Z',
  levels: [
    { name: 'Red Line', price: 30182, kind: 'unknown' },
    { name: 'Yellow Line', price: 30979, kind: 'reference' },
    { name: 'CAT', price: 31232.74, kind: 'open-close' }
  ]
}, { generatedAt: '2026-06-21T18:00:01.000Z' });
assert.match(genericManualLinePayload, /Red Line,30182,red-line/);
assert.match(genericManualLinePayload, /Yellow Line,30979,yellow-line/);
assert.match(genericManualLinePayload, /CAT,31232\.74,cat/);

const manyLevels = {
  symbol: 'MES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: Array.from({ length: 120 }, (_item, index) => ({
    name: `BZT${index + 1}`,
    price: 7500 + index,
    kind: 'zone-bull'
  }))
};
assert.equal(createTradingViewPayloadExport(manyLevels).split(';').length, 120);
assert.equal(createTradingViewPayloadExport(manyLevels, { maxLevels: 10 }).split(';').length, 10);

const bundleSnapshot = {
  generatedAt: '2026-06-19T14:31:00.000Z',
  symbols: {
    MNQ: {
      symbol: 'MNQ',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'BrZT1', price: 30450, kind: 'zone-bear', color: '#F06292' }]
    },
    MES: row,
    SPY: {
      symbol: 'SPY',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'PrevDayClose', price: 740.96, kind: 'open-close' }]
    },
    QQQ: {
      symbol: 'QQQ',
      capturedAt: '2026-06-19T14:30:30.000Z',
      levels: [{ name: 'LastOpen', price: 747.76, kind: 'open-close' }]
    }
  }
};
const bundlePayload = createTradingViewBundlePayloadExport(bundleSnapshot, { generatedAt: '2026-06-19T14:31:05.000Z' });
assert.match(bundlePayload, /^RSLEVELS\|2\|2026-06-19T14:31:05\.000Z\|ES\|2026-06-19T14:29:59\.500Z\|/);
assert.match(bundlePayload, /\|NQ\|2026-06-19T14:30:30\.000Z\|BrZT1,30450,zone-bear/);
assert.match(bundlePayload, /Map BLD,0,stat/);
assert.doesNotMatch(bundlePayload, /\|SPY\|/);
assert.doesNotMatch(bundlePayload, /\|QQQ\|/);
assert.doesNotMatch(bundlePayload, /compactPayload|notes|tradingview-json|tradingview-bundle-json/);

console.log('exporter tests passed');
