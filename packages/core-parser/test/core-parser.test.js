import assert from 'node:assert/strict';
import { collectLevels, endpointKey, normalizeCapture } from '../src/index.js';

const body = {
  symbol: 'MES',
  levels: [
    { name: 'OVNHP', price: '7537.00', color: [41, 98, 255] },
    { label: 'DD Upper', value: 7579.75, color: '#29b6f6' },
    { label: 'Not a level', value: 123 }
  ]
};

const parsed = normalizeCapture({
  endpoint: '/platform/api/v1/ddbands/MES',
  status: 200,
  capturedAt: '2026-06-19T14:29:59.500Z',
  body
});

assert.equal(parsed.endpoint.key, '/platform/api/v1/ddbands/MES');
assert.equal(Object.hasOwn(parsed.endpoint, 'url'), false);
assert.equal(parsed.symbols.MES.length, 2);
assert.equal(parsed.symbols.MES[0].name, 'OVNHP');
assert.equal(parsed.symbols.MES[0].color, '#2962FF');
assert.equal(parsed.symbols.MES[0].metadata.endpointKey, '/platform/api/v1/ddbands/MES');
assert.equal(parsed.symbols.MES[1].kind, 'dd-band');

const nested = collectLevels({ data: { rows: [{ pivotName: 'QQQ Open', pivotPrice: 30812.5 }] } }, {
  symbolHint: 'MNQ',
  capturedAt: '2026-06-19T14:29:59.500Z'
});
assert.equal(nested.length, 1);
assert.equal(nested[0].symbol, 'MNQ');
assert.equal(nested[0].kind, 'open-close');

const tupleRows = collectLevels({
  rows: [
    ['OVNHP', '7,537.00', 41, 98, 255],
    ['DD Upper', '7,579.75', 'dd-band', '#29b6f6'],
    ['Not a level', 123]
  ]
}, {
  symbolHint: 'ES',
  endpointKey: '/tuple/MES',
  capturedAt: '2026-06-19T14:29:59.500Z'
});
assert.equal(tupleRows.length, 2);
assert.equal(tupleRows[0].symbol, 'MES');
assert.equal(tupleRows[0].price, 7537);
assert.equal(tupleRows[0].color, '#2962FF');
assert.equal(tupleRows[0].metadata.endpointKey, '/tuple/MES');
assert.equal(tupleRows[1].kind, 'dd-band');
assert.equal(tupleRows[1].color, '#29B6F6');

const colorObject = collectLevels({
  levels: [{ label: 'Support Zone', value: '5,111.25', color: { red: 76, green: 175, blue: 80 } }]
}, { symbolHint: 'MES' });
assert.equal(colorObject.length, 1);
assert.equal(colorObject[0].price, 5111.25);
assert.equal(colorObject[0].color, '#4CAF50');

const keyedMap = collectLevels({
  levelsByName: {
    OVNMHP: { target: '30,125.50', kind: 'mhp', rgb: { r: 255, g: 152, b: 0 } },
    'DD Lower': '29,900.25',
    notes: 'not a level'
  }
}, {
  symbolHint: 'NQ',
  capturedAt: '2026-06-19T14:29:59.500Z'
});
assert.equal(keyedMap.length, 2);
assert.equal(keyedMap[0].symbol, 'MNQ');
assert.equal(keyedMap[0].name, 'OVNMHP');
assert.equal(keyedMap[0].price, 30125.5);
assert.equal(keyedMap[0].kind, 'mhp');
assert.equal(keyedMap[0].color, '#FF9800');
assert.equal(keyedMap[1].name, 'DD Lower');
assert.equal(keyedMap[1].kind, 'dd-band');

const multiSymbol = normalizeCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-06-19T14:31:00.000Z',
  body: {
    levels: {
      MES: {
        chartLines: [
          { name: 'OVNHP', price: 7537 },
          { name: 'BZT1', price: 7580 },
          { name: 'BZB1', price: 7560 }
        ],
        bearZones: [
          { index: 1, top: 7615, bottom: 7602 }
        ]
      },
      MNQ: {
        referenceLines: [
          { name: 'QQQ Open', price: 30125.5 },
          { name: 'BrZT2', price: 30450 },
          { name: 'BrZB2', price: 30412 }
        ],
        bullZones: [
          { index: 3, top: 30040, bottom: 30010 }
        ]
      }
    }
  }
});
assert.equal(multiSymbol.endpoint.key, '/platform/api/v1/chart/display');
assert.equal(multiSymbol.endpoint.ok, true);
assert.equal(multiSymbol.symbols.MES.length, 5);
assert.equal(multiSymbol.symbols.MNQ.length, 5);
assert.equal(multiSymbol.symbols.MES.find((level) => level.name === 'BZT1').kind, 'zone-bull');
assert.equal(multiSymbol.symbols.MES.find((level) => level.name === 'BrZT1').kind, 'zone-bear');
assert.equal(multiSymbol.symbols.MNQ.find((level) => level.name === 'BrZT2').kind, 'zone-bear');
assert.equal(multiSymbol.symbols.MNQ.find((level) => level.name === 'BZT3').kind, 'zone-bull');

const cqgEndpointSymbol = normalizeCapture({
  endpoint: '/platform/api/v1/chart/F.US.EPU26',
  status: 200,
  capturedAt: '2026-06-19T14:31:30.000Z',
  body: {
    instrument: 'F.US.EPU26',
    levels: [
      { name: 'OVNHP', price: 7557.75 }
    ]
  }
});
assert.equal(cqgEndpointSymbol.symbols.MES.length, 1);
assert.equal(cqgEndpointSymbol.symbols.MES[0].symbol, 'MES');

const cqgRolloverSymbol = normalizeCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-12-14T14:31:30.000Z',
  body: {
    charts: {
      'F.US.EPZ26': {
        levels: [{ name: 'OVNHP', price: 7557.75 }]
      },
      'F.US.ENQH27': {
        levels: [{ name: 'OVNMHP', price: 30625.75 }]
      }
    }
  }
});
assert.equal(cqgRolloverSymbol.symbols.MES.length, 1);
assert.equal(cqgRolloverSymbol.symbols.MNQ.length, 1);
assert.equal(cqgRolloverSymbol.symbols.MES[0].symbol, 'MES');
assert.equal(cqgRolloverSymbol.symbols.MNQ[0].symbol, 'MNQ');

const cqgMultiSymbol = normalizeCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-06-19T14:31:45.000Z',
  body: {
    charts: {
      'F.US.EPU26': {
        levels: [{ name: 'DD Upper', price: 7588.25 }],
        bullZones: [{ index: 2, top: 7590, bottom: 7575 }]
      },
      'F.US.ENQU26': {
        levels: [{ name: 'QQQ Open', price: 30625.75 }],
        bearZones: [{ index: 2, top: 30667.5, bottom: 30638 }]
      }
    }
  }
});
assert.equal(cqgMultiSymbol.symbols.MES.length, 3);
assert.equal(cqgMultiSymbol.symbols.MNQ.length, 3);
assert.equal(cqgMultiSymbol.symbols.MES.find((level) => level.name === 'BZT2').kind, 'zone-bull');
assert.equal(cqgMultiSymbol.symbols.MNQ.find((level) => level.name === 'BrZT2').kind, 'zone-bear');

const quoteLikeRows = normalizeCapture({
  endpoint: '/api/v1/tview/history?symbol=SPY',
  status: 200,
  capturedAt: '2026-06-19T14:31:50.000Z',
  body: {
    symbol: 'SPY',
    rows: [
      { hp: 741, close: 740.96 },
      { name: 'hp', price: 742.5 },
      { name: 'close', price: 740.62 },
      { name: 'PrevDayClose', price: 740.96, symbol: 'SPY' }
    ]
  }
});
assert.equal(quoteLikeRows.endpoint.ok, false);
assert.equal(quoteLikeRows.symbols.MES, undefined);

const mixedWatchlistAndFutures = normalizeCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-06-19T14:31:55.000Z',
  body: {
    watchlist: [
      { symbol: 'SPY', name: 'PrevDayClose', price: 740.96 },
      { symbol: 'QQQ', name: 'LastOpen', price: 747.76 },
      { symbol: 'AAPL', hp: 290.5, close: 290.62 }
    ],
    charts: {
      'F.US.EPU26': {
        levels: [
          { name: 'OVNMHP', price: 7545 },
          { name: 'man_HP', price: 7565 }
        ]
      }
    }
  }
});
assert.equal(mixedWatchlistAndFutures.symbols.MES.length, 2);
assert.equal(mixedWatchlistAndFutures.symbols.MES[0].price, 7545);
assert.equal(mixedWatchlistAndFutures.symbols.MNQ, undefined);

const unsupportedSymbolPanels = normalizeCapture({
  endpoint: '/platform/api/v1/chart/F.US.EPU26',
  status: 200,
  capturedAt: '2026-06-19T14:31:56.000Z',
  body: {
    panels: {
      SPY: {
        rows: [
          { name: 'hp', price: 741 },
          { name: 'close', price: 740.96 },
          { name: 'PrevDayClose', price: 722.51 },
          { name: 'LastOpen', price: 737.1 }
        ]
      },
      QQQ: {
        rows: [
          { name: 'hp', price: 742.5 },
          { name: 'close', price: 742.84 }
        ]
      },
      'F.US.EPU26': {
        levels: [
          { name: 'man_HP', price: 732.5 }
        ]
      }
    }
  }
});
assert.equal(unsupportedSymbolPanels.symbols.MES.length, 1);
assert.equal(unsupportedSymbolPanels.symbols.MES[0].price, 732.5);
assert.equal(unsupportedSymbolPanels.symbols.MES.some((level) => level.price === 722.51), false);
assert.equal(unsupportedSymbolPanels.symbols.SPY, undefined);
assert.equal(unsupportedSymbolPanels.symbols.QQQ, undefined);

const manyZones = collectLevels({
  MES: {
    bullZones: Array.from({ length: 250 }, (_item, index) => ({
      index: index + 1,
      top: 7600 + index,
      bottom: 7590 + index
    }))
  }
});
assert.equal(manyZones.length, 500);
assert.equal(manyZones[0].kind, 'zone-bull');
assert.equal(manyZones.at(-1).name, 'BZB250');

const emptyCapture = normalizeCapture({
  endpoint: '/platform/api/v1/chart/display',
  status: 200,
  capturedAt: '2026-06-19T14:32:00.000Z',
  body: { ok: true, rows: [{ name: 'Not display data', value: 123 }] }
});
assert.equal(emptyCapture.endpoint.ok, false);
assert.equal(emptyCapture.warnings.includes('No display levels were recognized in this capture.'), true);

assert.equal(
  endpointKey({ url: 'https://example.test/platform/api/users/1234567890/feeds/abcdef1234567890/ddbands/MES?private=value' }),
  '/platform/api/users/:id/feeds/:id/ddbands/MES'
);

console.log('core parser tests passed');
