import assert from 'node:assert/strict';
import {
  createTradingViewBundleJsonExport,
  createTradingViewJsonExport
} from '../src/index.js';

const row = {
  symbol: 'ES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: [
    { name: 'OVNHP', price: 7537, kind: 'hp', color: '#2962FF' },
    { name: 'DD Upper; bad|chars', price: 7579.75, kind: 'dd-band', color: '#29B6F6' },
    { name: 'BZT1', price: 7588, kind: 'zone-bull', color: '#4CAF50' },
    { name: 'BrZT1', price: 7612, kind: 'zone-bear', color: '#F06292' },
    { name: 'text SPY Open : 7,559 Liquidity Map', price: 7559, kind: 'open-close', color: '#E0E0E0' }
  ]
};

const json = createTradingViewJsonExport(row, { generatedAt: '2026-06-19T14:30:00.000Z' });
assert.equal(json.schemaVersion, '0.1.0');
assert.equal(json.exportFormat, 'tradingview-json');
assert.equal(json.payloadVersion, 1);
assert.equal(json.symbol, 'ES');
assert.equal(json.levels.length, 5);
assert.deepEqual(json.levels[1], ['DD Upper bad chars', 7579.75, 'dd-band']);
assert.deepEqual(json.levels[2], ['BZT1', 7588, 'zone-bull']);
assert.deepEqual(json.levels[3], ['BrZT1', 7612, 'zone-bear']);
assert.equal(json.levels[4][0], 'Open');
assert.equal(Object.hasOwn(json, 'compactPayload'), false);
assert.equal(Object.hasOwn(json, 'notes'), false);

const manyLevels = {
  symbol: 'MES',
  capturedAt: '2026-06-19T14:29:59.500Z',
  levels: Array.from({ length: 120 }, (_item, index) => ({
    name: `BZT${index + 1}`,
    price: 7500 + index,
    kind: 'zone-bull'
  }))
};
assert.equal(createTradingViewJsonExport(manyLevels).levels.length, 120);
assert.equal(createTradingViewJsonExport(manyLevels, { maxLevels: 10 }).levels.length, 10);

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
const bundleJson = createTradingViewBundleJsonExport(bundleSnapshot, { generatedAt: '2026-06-19T14:31:05.000Z' });
assert.equal(bundleJson.exportFormat, 'tradingview-bundle-json');
assert.equal(bundleJson.payloadVersion, 2);
assert.deepEqual(bundleJson.symbols.map((symbol) => symbol.symbol), ['ES', 'NQ']);
assert.equal(bundleJson.symbols[0].levelCount, 5);
assert.deepEqual(bundleJson.symbols[1].levels[0], ['BrZT1', 30450, 'zone-bear']);
assert.equal(bundleJson.symbols.some((symbol) => symbol.symbol === 'SPY'), false);
assert.equal(bundleJson.symbols.some((symbol) => symbol.symbol === 'QQQ'), false);
assert.equal(Object.hasOwn(bundleJson, 'compactPayload'), false);
assert.equal(Object.hasOwn(bundleJson, 'notes'), false);

console.log('exporter tests passed');
