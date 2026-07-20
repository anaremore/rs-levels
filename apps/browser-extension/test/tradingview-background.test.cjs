const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');
const backgroundSource = readFileSync(join(root, 'src', 'background.js'), 'utf8');
const sharedSource = readFileSync(join(root, 'src', 'shared.js'), 'utf8');

(async () => {
  const sessionStore = {};
  const first = createHarness(sessionStore);
  const freshAt = new Date(Date.now() - 1000).toISOString();
  const olderAt = new Date(Date.now() - 60000).toISOString();
  first.setTabs([
    { id: 12, windowId: 1, title: 'RocketScooter ES', url: 'https://rocket.place/chart' }
  ]);

  await first.api.rememberTradingViewSnapshot(captureAt(
    freshAt,
    [{ name: 'HP', price: 6000, kind: 'hp' }]
  ), 12);
  await first.api.rememberTradingViewSnapshot(captureAt(
    olderAt,
    [{ name: 'HP', price: 5000, kind: 'hp' }]
  ), 9);

  const current = await first.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(current.ok, true);
  assert.match(current.payload, /HP,6000,hp/);
  assert.doesNotMatch(current.payload, /HP,5000,hp/);
  assert.ok(first.logs.sessionWrites.length >= 1);
  assert.doesNotMatch(JSON.stringify(sessionStore), /\"body\"/);

  const detectedRecord = sessionStore.rsLevelsTradingViewSession;
  const detectedReceivedAt = detectedRecord.receivedAt;
  const genericCapture = captureAt(
    new Date().toISOString(),
    [{ name: 'HP', price: 6100, kind: 'hp' }]
  );
  genericCapture.endpoint = '/api/levels';
  await first.api.rememberTradingViewSnapshot(genericCapture, 99);
  assert.equal(sessionStore.rsLevelsTradingViewSession.sourceTabId, 12);
  assert.equal(sessionStore.rsLevelsTradingViewSession.receivedAt, detectedReceivedAt);
  const afterGeneric = await first.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(afterGeneric.ok, true);
  assert.match(afterGeneric.payload, /HP,6000,hp/);
  assert.doesNotMatch(afterGeneric.payload, /HP,6100,hp/);

  const restarted = createHarness(sessionStore);
  restarted.setTabs([
    { id: 12, windowId: 1, title: 'RocketScooter ES', url: 'https://rocket.place/chart' }
  ]);
  const recovered = await restarted.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(recovered.ok, true);
  assert.match(recovered.payload, /HP,6000,hp/);

  restarted.setCaptureEnabled(false);
  const paused = await restarted.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(paused.ok, false);
  assert.match(paused.error, /Capture is paused/);
  restarted.setCaptureEnabled(true);

  const staleSessionStore = JSON.parse(JSON.stringify(sessionStore));
  staleSessionStore.rsLevelsTradingViewSession.receivedAt = new Date(Date.now() - 180000).toISOString();
  const stale = createHarness(staleSessionStore);
  stale.setTabs([
    { id: 12, windowId: 1, title: 'RocketScooter ES', url: 'https://rocket.place/chart' }
  ]);
  const staleResult = await stale.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(staleResult.ok, false);
  assert.match(staleResult.error, /stale/);

  const removedSessionStore = JSON.parse(JSON.stringify(sessionStore));
  const removed = createHarness(removedSessionStore);
  removed.setTabs([
    { id: 12, windowId: 1, title: 'RocketScooter ES', url: 'https://rocket.place/chart' }
  ]);
  assert.equal(removed.tabRemovedListeners.length, 1);
  await removed.tabRemovedListeners[0](12);
  const removedResult = await removed.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(removedResult.ok, false);
  assert.match(removedResult.error, /No current detected-chart/);

  const navigatedSessionStore = JSON.parse(JSON.stringify(sessionStore));
  const navigated = createHarness(navigatedSessionStore);
  navigated.setTabs([
    { id: 12, windowId: 1, title: 'RocketScooter ES', url: 'https://rocket.place/chart' }
  ]);
  assert.equal(navigated.tabUpdatedListeners.length, 1);
  await navigated.tabUpdatedListeners[0](12, { url: 'https://example.test/' });
  const navigatedResult = await navigated.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(navigatedResult.ok, false);
  assert.match(navigatedResult.error, /No current detected-chart/);

  await restarted.api.rememberTradingViewSnapshot(captureAt(
    new Date().toISOString(),
    []
  ), 12);
  const cleared = await restarted.api.tradingViewPayloadResponse('ES', { detectedOnly: true });
  assert.equal(cleared.ok, false);
  assert.match(cleared.error, /No current detected-chart/);

  restarted.setTabs([
    { id: 30, windowId: 4, title: 'ES chart', url: 'https://www.tradingview.com/chart/es/' },
    { id: 31, windowId: 4, title: 'Settings', url: 'https://www.tradingview.com/settings/' },
    { id: 32, windowId: 5, title: 'NQ chart', url: 'https://charts.tradingview.com/chart/nq/' }
  ], [{ id: 32 }]);

  const listed = await restarted.api.listTradingViewTabs();
  assert.equal(listed.ok, true);
  assert.deepEqual(Array.from(listed.tabs, (tab) => tab.id), [30, 32]);
  assert.equal(listed.tabs[1].current, true);

  const send = await restarted.api.sendToTradingView({
    tabId: 30,
    payload: current.payload,
    scopeLabel: 'ES'
  });
  assert.equal(send.ok, true);
  assert.equal(restarted.logs.executions.length, 1);
  assert.equal(JSON.stringify(restarted.logs.executions[0].target.frameIds), '[0]');
  assert.deepEqual(Array.from(restarted.logs.executions[0].files), ['src/tradingview-content.js']);
  assert.equal(restarted.logs.executions[0].world, 'ISOLATED');
  assert.equal(restarted.logs.messages[0].message.type, 'rs-levels.tradingview-arm-v2');
  assert.equal(restarted.logs.messages[0].options.frameId, 0);
  assert.equal(restarted.logs.messages[0].message.payload, current.payload);
  assert.ok(restarted.logs.messages[0].message.expiresAt > Date.now());
  assert.equal(JSON.stringify(restarted.logs.tabUpdates[0]), '[30,{"active":true}]');
  assert.equal(JSON.stringify(restarted.logs.windowUpdates[0]), '[4,{"focused":true}]');

  restarted.setTabForGet({
    id: 40,
    windowId: 4,
    title: 'Other page',
    url: 'https://example.test/chart/'
  });
  const rejected = await restarted.api.sendToTradingView({
    tabId: 40,
    payload: current.payload,
    scopeLabel: 'ES'
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /no longer a TradingView chart/);
  assert.equal(restarted.logs.executions.length, 1);

  console.log('TradingView background handoff tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function captureAt(capturedAt, levels) {
  return {
    endpoint: '/page-reader/display',
    capturedAt,
    body: JSON.stringify({
      type: 'rs_snapshot',
      source: 'page-reader',
      symbol: 'MES',
      capturedAt,
      levels
    })
  };
}

function createHarness(sessionStore) {
  const logs = {
    sessionWrites: [],
    executions: [],
    messages: [],
    tabUpdates: [],
    windowUpdates: []
  };
  let urlTabs = [];
  let activeTabs = [];
  let tabForGet = null;
  let captureEnabled = true;
  const tabRemovedListeners = [];
  const tabUpdatedListeners = [];
  const messageListeners = [];

  const chrome = {
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        }
      }
    },
    storage: {
      local: {
        async get() { return { captureEnabled }; },
        async set() {}
      },
      session: {
        async get(key) {
          return { [key]: sessionStore[key] };
        },
        async set(record) {
          Object.assign(sessionStore, record);
          logs.sessionWrites.push(record);
        },
        async remove(key) {
          delete sessionStore[key];
        }
      }
    },
    tabs: {
      onRemoved: {
        addListener(listener) {
          tabRemovedListeners.push(listener);
        }
      },
      onUpdated: {
        addListener(listener) {
          tabUpdatedListeners.push(listener);
        }
      },
      async query(query) {
        return query && query.url ? urlTabs : activeTabs;
      },
      async get(tabId) {
        if (tabForGet) return tabForGet;
        const tab = urlTabs.find((candidate) => candidate.id === tabId);
        if (!tab) throw new Error('Tab not found');
        return tab;
      },
      async sendMessage(tabId, message, options) {
        logs.messages.push({ tabId, message, options });
        return { ok: true, state: 'waiting' };
      },
      async update(tabId, update) {
        logs.tabUpdates.push([tabId, update]);
      }
    },
    windows: {
      async update(windowId, update) {
        logs.windowUpdates.push([windowId, update]);
      }
    },
    scripting: {
      async executeScript(details) {
        logs.executions.push(details);
      }
    }
  };

  const context = {
    URL,
    chrome,
    console,
    crypto: { randomUUID: () => 'handoff-id' },
    fetch: async () => ({ ok: true }),
    setTimeout,
    clearTimeout
  };
  context.globalThis = context;
  vm.createContext(context);
  context.importScripts = (name) => {
    assert.equal(name, 'shared.js');
    vm.runInContext(sharedSource, context, { filename: 'shared.js' });
  };
  vm.runInContext(backgroundSource, context, { filename: 'background.js' });
  vm.runInContext(
    'globalThis.BACKGROUND_TEST = { rememberTradingViewSnapshot, tradingViewPayloadResponse, listTradingViewTabs, sendToTradingView };',
    context
  );

  return {
    api: context.BACKGROUND_TEST,
    logs,
    listeners: messageListeners,
    tabRemovedListeners,
    tabUpdatedListeners,
    setTabs(nextUrlTabs, nextActiveTabs = []) {
      urlTabs = nextUrlTabs;
      activeTabs = nextActiveTabs;
      tabForGet = null;
    },
    setCaptureEnabled(value) {
      captureEnabled = value === true;
    },
    setTabForGet(tab) {
      tabForGet = tab;
    }
  };
}
