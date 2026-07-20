const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');
const source = readFileSync(join(root, 'src', 'tradingview-content.js'), 'utf8');
const context = { console, setTimeout, clearTimeout };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'tradingview-content.js' });

const api = context.RS_LEVELS_TRADINGVIEW_AUTOFILL;
assert.ok(api);
assert.equal(typeof api.createBridge, 'function');
assert.equal(api.BRIDGE_VERSION, 2);
assert.equal(api.FIELD_LABEL, 'RS Levels Payload');
assert.equal(api.normalizeText('  RS   Levels\nPayload '), 'RS Levels Payload');
runInstallVersioningTest();

const payload = 'RSLEVELS|2|2026-07-20T12:00:00.000Z|ES|HP:6000|MHP:5990';
const valid = api.validateHandoff({
  requestId: 'request-1',
  payload,
  expiresAt: Date.now() + 1000,
  generatedAt: '2026-07-20T12:00:00.000Z',
  scopeLabel: 'ES <script>'
});
assert.equal(valid.payload, payload);
assert.equal(valid.scopeLabel, 'ES script');
assert.throws(() => api.validateHandoff({
  requestId: 'expired',
  payload,
  expiresAt: Date.now() - 1
}), /expired/);
assert.throws(() => api.validateHandoff({
  requestId: 'large',
  payload: 'RSLEVELS|2|' + 'x'.repeat(40960),
  expiresAt: Date.now() + 1000
}), /invalid or too large/);

const doc = fakeDocument();
const exactControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const exactDialog = fakeDialog(doc, [exactControl]);
assert.equal(api.findPayloadControl(fakeRoot([exactDialog])), exactControl);
const exactInspection = api.inspectPayloadControl(fakeRoot([exactDialog]));
assert.equal(exactInspection.control, exactControl);
assert.equal(exactInspection.diagnostic.reason, 'matched');
assert.equal(exactInspection.diagnostic.counts.uniqueMatches, 1);
const diagnosticText = JSON.stringify(exactInspection.diagnostic);
assert.doesNotMatch(diagnosticText, /RSLEVELS\|2|HP:6000|MHP:5990/);
const emptyInspection = api.inspectPayloadControl(fakeRoot([]));
assert.equal(emptyInspection.diagnostic.reason, 'no-controls');
const secondDialogControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const secondDialog = fakeDialog(doc, [secondDialogControl]);
assert.equal(api.findPayloadControl(fakeRoot([exactDialog, secondDialog])), null);


const hiddenDialogControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const hiddenDialog = fakeDialog(doc, [hiddenDialogControl]);
hiddenDialog.hidden = true;
assert.equal(api.findPayloadControl(fakeRoot([hiddenDialog])), null);

const retainedActiveControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const retainedActiveDialog = fakeDialog(doc, [retainedActiveControl]);
const retainedHiddenControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const retainedHiddenDialog = fakeDialog(doc, [retainedHiddenControl]);
retainedHiddenDialog.getAttribute = (name) => name === 'aria-hidden' ? 'true' : null;
assert.equal(
  api.findPayloadControl(fakeRoot([retainedActiveDialog, retainedHiddenDialog])),
  retainedActiveControl
);
const retainedInspection = api.inspectPayloadControl(fakeRoot([retainedHiddenDialog]));
assert.equal(retainedInspection.control, null);
assert.equal(retainedInspection.diagnostic.reason, 'no-eligible-controls');
assert.equal(retainedInspection.diagnostic.counts.visibleDialogs, 0);
assert.equal(retainedInspection.diagnostic.counts.uniqueMatches, 0);
assert.doesNotMatch(JSON.stringify(retainedInspection.diagnostic), /RSLEVELS\|2|HP:6000|MHP:5990/);

const inertControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const inertDialog = fakeDialog(doc, [inertControl]);
inertDialog.inert = true;
assert.equal(api.findPayloadControl(fakeRoot([inertDialog])), null);

const closedDialogControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const closedDialog = fakeDialog(doc, [closedDialogControl]);
closedDialog.tagName = 'DIALOG';
closedDialog.open = false;
assert.equal(api.findPayloadControl(fakeRoot([closedDialog])), null);

const opacityControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const opacityDialog = fakeDialog(doc, [opacityControl]);
opacityDialog.computedStyle = { opacity: '0' };
assert.equal(api.findPayloadControl(fakeRoot([opacityDialog])), null);

const offscreenDoc = fakeDocument();
offscreenDoc.defaultView.innerWidth = 500;
offscreenDoc.defaultView.innerHeight = 500;
const offscreenControl = fakeControl(offscreenDoc, { 'aria-label': 'RS Levels Payload' });
offscreenControl.getBoundingClientRect = () => fakeRect(700, 100, 100, 36);
assert.equal(api.findPayloadControl(fakeRoot([fakeDialog(offscreenDoc, [offscreenControl])])), null);

const duplicateA = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const duplicateB = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
assert.equal(api.findPayloadControlInDialog(fakeDialog(doc, [duplicateA, duplicateB])), null);

const unrelated = fakeControl(doc, { 'aria-label': 'Length' });
assert.equal(api.findPayloadControlInDialog(fakeDialog(doc, [unrelated])), null);

const labelledControl = fakeControl(doc, {}, 'payload-field');
const forLabel = fakeLabel(doc, 'RS Levels Payload', { for: 'payload-field' });
const labelledDialog = fakeDialog(doc, [labelledControl], [forLabel]);
assert.equal(api.findPayloadControlInDialog(labelledDialog), labelledControl);

const ariaDoc = fakeDocument();
const ariaName = fakeLabel(ariaDoc, 'RS Levels Payload');
ariaDoc.getElementById = (id) => id === 'payload-name' ? ariaName : null;
const ariaControl = fakeControl(ariaDoc, { 'aria-labelledby': 'payload-name' });
assert.equal(api.findPayloadControlInDialog(fakeDialog(ariaDoc, [ariaControl])), ariaControl);

const nestedLabel = fakeLabel(doc, 'RS Levels Payload');
const nestedControl = fakeControl(doc);
nestedControl.closest = (selector) => selector === 'label' ? nestedLabel : null;
assert.equal(api.findPayloadControlInDialog(fakeDialog(doc, [nestedControl])), nestedControl);

const visibleControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
const hiddenControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
hiddenControl.hidden = true;
assert.equal(api.findPayloadControlInDialog(fakeDialog(doc, [visibleControl, hiddenControl])), visibleControl);

const zeroAreaControl = fakeControl(doc, { 'aria-label': 'RS Levels Payload' });
zeroAreaControl.getBoundingClientRect = () => fakeRect(100, 100, 0, 0);
assert.equal(api.findPayloadControlInDialog(fakeDialog(doc, [zeroAreaControl])), null);
assert.equal(
  api.findPayloadControlInDialog(fakeDialog(doc, [visibleControl, zeroAreaControl])),
  visibleControl
);

const rowControl = fakeControl(doc);
const row = {
  parentElement: null,
  contains(node) {
    return node === rowControl || node === rowLabel;
  },
  querySelectorAll(selector) {
    return selector === 'input, textarea' ? [rowControl] : [];
  }
};
const rowLabel = fakeLabel(doc, 'RS Levels Payload', {}, 'DIV');
rowLabel.parentElement = row;
const rowDialog = fakeDialog(doc, [rowControl], [rowLabel]);
row.parentElement = rowDialog;
rowLabel.getBoundingClientRect = () => fakeRect(52, 140, 190, 36);
rowControl.getBoundingClientRect = () => fakeRect(267, 140, 100, 36);
rowDialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);
assert.equal(api.findPayloadControlInDialog(rowDialog), rowControl);

assert.equal(
  api.findPayloadControl(fakeRoot([rowDialog], { includeDialogs: false })),
  rowControl
);

const deepControl = fakeControl(doc);
const deepFixture = fakeVisualRow(doc, [deepControl]);
for (let index = 0; index < 8; index += 1) {
  const parent = deepFixture.label.parentElement;
  deepFixture.label.parentElement = {
    parentElement: parent,
    contains(node) {
      return node === deepFixture.label;
    },
    querySelectorAll() {
      return [];
    }
  };
}
assert.equal(api.findPayloadControlInDialog(deepFixture.dialog), deepControl);

const auxiliaryControl = fakeControl(doc);
const hiddenAuxiliary = fakeControl(doc);
hiddenAuxiliary.hidden = true;
const auxiliaryFixture = fakeVisualRow(doc, [auxiliaryControl, hiddenAuxiliary]);
assert.equal(api.findPayloadControlInDialog(auxiliaryFixture.dialog), auxiliaryControl);

const spanningLabelControl = fakeControl(doc);
const spanningLabelFixture = fakeVisualRow(doc, [spanningLabelControl], {
  labelRect: fakeRect(52, 140, 315, 36)
});
assert.equal(api.findPayloadControlInDialog(spanningLabelFixture.dialog), spanningLabelControl);

const visualAmbiguityControl = fakeControl(doc);
const visualAmbiguityFixture = fakeVisualRow(doc, [visualAmbiguityControl]);
const accessibleAndVisualDialog = fakeDialog(
  doc,
  [exactControl, visualAmbiguityControl],
  [visualAmbiguityFixture.label]
);
visualAmbiguityFixture.row.parentElement = accessibleAndVisualDialog;
accessibleAndVisualDialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);
assert.equal(api.findPayloadControlInDialog(accessibleAndVisualDialog), null);

const visualDuplicateA = fakeControl(doc);
const visualDuplicateB = fakeControl(doc);
const visualFixtureA = fakeVisualRow(doc, [visualDuplicateA]);
const visualFixtureB = fakeVisualRow(doc, [visualDuplicateB]);
const duplicateVisualDialog = fakeDialog(
  doc,
  [visualDuplicateA, visualDuplicateB],
  [visualFixtureA.label, visualFixtureB.label]
);
visualFixtureA.row.parentElement = duplicateVisualDialog;
visualFixtureB.row.parentElement = duplicateVisualDialog;
duplicateVisualDialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);
assert.equal(api.findPayloadControlInDialog(duplicateVisualDialog), null);
assert.equal(api.findPayloadControl(fakeRoot([duplicateVisualDialog, exactDialog])), null);
const conflictingControl = fakeControl(doc, { 'aria-label': 'Length' });
const conflictingFixture = fakeVisualRow(doc, [conflictingControl]);
assert.equal(api.findPayloadControlInDialog(conflictingFixture.dialog), null);

const ambiguousRowA = fakeControl(doc);
const ambiguousRowB = fakeControl(doc);
const ambiguousFixture = fakeVisualRow(doc, [ambiguousRowA, ambiguousRowB]);
assert.equal(api.findPayloadControlInDialog(ambiguousFixture.dialog), null);
const ambiguousInspection = api.inspectPayloadControl(ambiguousFixture.dialog);
assert.equal(ambiguousInspection.diagnostic.reason, 'ambiguous-match');

const separatedControl = fakeControl(doc);
const separatedFixture = fakeVisualRow(doc, [separatedControl], {
  controlRects: [fakeRect(267, 230, 100, 36)]
});
assert.equal(api.findPayloadControlInDialog(separatedFixture.dialog), null);
assert.equal(api.inspectPayloadControl(separatedFixture.dialog).diagnostic.reason, 'geometry-mismatch');

const approximateControl = fakeControl(doc);
const approximateFixture = fakeVisualRow(doc, [approximateControl], {
  labelText: 'RS Levels Payload (legacy)'
});
assert.equal(api.findPayloadControlInDialog(approximateFixture.dialog), null);
assert.equal(api.inspectPayloadControl(approximateFixture.dialog).diagnostic.reason, 'exact-label-not-found');

const readOnlyControl = fakeControl(doc);
readOnlyControl.readOnly = true;
const readOnlyFixture = fakeVisualRow(doc, [readOnlyControl]);
assert.equal(api.findPayloadControlInDialog(readOnlyFixture.dialog), null);
assert.equal(api.inspectPayloadControl(readOnlyFixture.dialog).diagnostic.reason, 'no-eligible-controls');

const hiddenLabelControl = fakeControl(doc);
const hiddenLabelFixture = fakeVisualRow(doc, [hiddenLabelControl]);
hiddenLabelFixture.label.hidden = true;
assert.equal(api.findPayloadControlInDialog(hiddenLabelFixture.dialog), null);

const dialogScopeControl = fakeControl(doc);
const dialogScopeLabel = fakeLabel(doc, 'RS Levels Payload');
const dialogScope = fakeDialog(doc, [dialogScopeControl], [dialogScopeLabel]);
dialogScopeLabel.parentElement = dialogScope;
dialogScopeLabel.getBoundingClientRect = () => fakeRect(52, 148, 120, 18);
dialogScopeControl.getBoundingClientRect = () => fakeRect(267, 140, 100, 36);
dialogScope.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);
assert.equal(api.findPayloadControlInDialog(dialogScope), dialogScopeControl);

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles === true;
  }
}

class FakeInputEvent extends FakeEvent {}
class FakeInput {
  constructor() {
    this._value = '';
    this.tagName = 'INPUT';
    this.type = 'text';
    this.disabled = false;
    this.events = [];
  }
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
  getAttribute() {
    return null;
  }
}

class FakeTextarea extends FakeInput {
  constructor() {
    super();
    this.tagName = 'TEXTAREA';
  }
}

Object.defineProperty(FakeInput.prototype, 'value', {
  configurable: true,
  get() { return this._value; },
  set(value) { this._value = String(value); }
});
Object.defineProperty(FakeTextarea.prototype, 'value', {
  configurable: true,
  get() { return this._value; },
  set(value) { this._value = String(value); }
});

const eventView = {
  HTMLInputElement: FakeInput,
  HTMLTextAreaElement: FakeTextarea,
  Event: FakeEvent,
  InputEvent: FakeInputEvent
};
const input = new FakeInput();
input.ownerDocument = { defaultView: eventView };
assert.equal(api.setControlValue(input, payload), true);
assert.equal(input.value, payload);
assert.deepEqual(input.events, ['input', 'change']);

const textarea = new FakeTextarea();
textarea.ownerDocument = { defaultView: eventView };
assert.equal(api.setControlValue(textarea, payload), true);
assert.equal(textarea.value, payload);
assert.deepEqual(textarea.events, ['input', 'change']);

runBridgeObserverTest()
  .then(runBridgeInertAncestorTest)
  .then(runBridgeAddedVisualLabelTest)
  .then(runBridgeOpacityTransitionTest)
  .then(runBridgeTreeWalkerDeepSplitLabelTest)
  .then(() => {
    console.log('TradingView content bridge tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

function runInstallVersioningTest() {
  const activeListeners = new Set();
  const addedListeners = [];
  let legacyStopped = 0;
  let staleDisposed = 0;
  const installContext = {
    console,
    setTimeout,
    clearTimeout,
    document: {},
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            activeListeners.add(listener);
            addedListeners.push(listener);
          },
          removeListener(listener) {
            activeListeners.delete(listener);
          }
        }
      }
    },
    __RS_LEVELS_TRADINGVIEW_BRIDGE__: {
      stop() {
        legacyStopped += 1;
      }
    },
    __RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__: {
      version: 1,
      dispose() {
        staleDisposed += 1;
        throw new Error('stale extension context');
      }
    }
  };
  installContext.globalThis = installContext;
  vm.createContext(installContext);
  vm.runInContext(source, installContext, { filename: 'tradingview-content-install.js' });

  const installed = installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__;
  assert.equal(legacyStopped, 1);
  assert.equal(staleDisposed, 1);
  assert.equal(installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE__, undefined);
  assert.equal(installed.version, 2);
  assert.equal(typeof installed.dispose, 'function');
  assert.equal(activeListeners.size, 1);
  assert.equal(addedListeners.length, 1);
  const firstListener = addedListeners[0];
  assert.equal(firstListener({ type: 'rs-levels.tradingview-arm' }, null, () => {}), false);
  assert.equal(firstListener({ type: 'rs-levels.tradingview-arm-v2' }, null, () => {}), true);

  activeListeners.clear();
  installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__ = {
    version: 2,
    dispose() {
      staleDisposed += 1;
      throw new Error('invalidated listener');
    }
  };
  vm.runInContext(source, installContext, { filename: 'tradingview-content-stale-reload.js' });
  assert.equal(staleDisposed, 2);
  assert.equal(activeListeners.size, 1);
  assert.equal(addedListeners.length, 2);

  const liveBridge = installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__;
  const liveListener = addedListeners[1];
  vm.runInContext(source, installContext, { filename: 'tradingview-content-reinstall.js' });
  assert.equal(activeListeners.size, 1);
  assert.equal(addedListeners.length, 3);
  assert.notEqual(addedListeners[2], liveListener);
  assert.notEqual(installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__, liveBridge);

  const reinstalled = installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__;
  reinstalled.dispose();
  assert.equal(activeListeners.size, 0);
  assert.equal(installContext.__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__, undefined);
}

async function runBridgeObserverTest() {
  let observed = null;
  let fallbackLabelScans = 0;

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observed = this;
    }

    observe(_root, options) {
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  context.MutationObserver = FakeMutationObserver;
  let runtimeDialog = null;
  const runtimeDoc = {
    body: {},
    defaultView: {
      ...eventView,
      getComputedStyle(element) {
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          ...(element && element.computedStyle || {})
        };
      }
    },
    getElementById() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'span, div') fallbackLabelScans += 1;
      if (selector.includes('[role="dialog"]')) {
        return [runtimeDialog];
      }
      return runtimeDialog ? runtimeDialog.querySelectorAll(selector) : [];
    }
  };
  const runtimeInput = new FakeInput();
  runtimeInput.hidden = true;
  runtimeInput.disabled = true;
  runtimeInput.ownerDocument = runtimeDoc;
  runtimeInput.getAttribute = (name) => name === 'aria-label' ? 'RS Levels Payload' : null;
  runtimeDialog = fakeDialog(runtimeDoc, [runtimeInput]);

  const bridge = api.createBridge(runtimeDoc);
  assert.equal(bridge.version, 2);
  const armPromise = bridge.arm({
    requestId: 'observer-request',
    payload,
    generatedAt: new Date().toISOString(),
    scopeLabel: 'ES',
    expiresAt: Date.now() + 2000
  });
  assert.ok(observed);
  const result = await armPromise;
  assert.equal(result.state, 'waiting');
  assert.equal(result.diagnostic.reason, 'no-eligible-controls');
  assert.equal(fallbackLabelScans, 1);
  assert.ok(observed);
  assert.equal(observed.options.attributes, true);
  assert.equal(observed.options.characterData, true);
  assert.deepEqual(Array.from(observed.options.attributeFilter), [
    'class',
    'style',
    'hidden',
    'inert',
    'open',
    'aria-hidden',
    'aria-modal',
    'disabled',
    'readonly',
    'aria-label',
    'aria-labelledby',
    'type'
  ]);

  runtimeInput.hidden = false;
  observed.callback([{ type: 'attributes', attributeName: 'hidden', target: runtimeInput }]);
  observed.callback([{ type: 'attributes', attributeName: 'class', target: runtimeDoc }]);
  await delay(130);
  assert.equal(runtimeInput.value, '');
  assert.equal(fallbackLabelScans, 1);

  runtimeInput.disabled = false;
  observed.callback([{ type: 'attributes', attributeName: 'disabled', target: runtimeInput }]);
  await delay(160);
  assert.equal(runtimeInput.value, payload);
  assert.equal(fallbackLabelScans, 1);
  assert.deepEqual(runtimeInput.events, ['input', 'change']);
  assert.equal(observed.disconnected, true);
}

async function runBridgeInertAncestorTest() {
  let observed = null;
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observed = this;
    }
    observe() {}
    disconnect() {}
  }
  context.MutationObserver = FakeMutationObserver;

  let dialog = null;
  const runtimeDoc = {
    body: {},
    defaultView: {
      ...eventView,
      getComputedStyle(element) {
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          ...(element && element.computedStyle || {})
        };
      }
    },
    getElementById() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('[role="dialog"]')) return [dialog];
      return dialog ? dialog.querySelectorAll(selector) : [];
    }
  };
  const control = new FakeInput();
  control.ownerDocument = runtimeDoc;
  control.getAttribute = (name) => name === 'aria-label' ? 'RS Levels Payload' : null;
  dialog = fakeDialog(runtimeDoc, [control]);
  dialog.inert = true;

  const bridge = api.createBridge(runtimeDoc);
  const result = await bridge.arm({
    requestId: 'inert-request',
    payload,
    generatedAt: new Date().toISOString(),
    scopeLabel: 'ES',
    expiresAt: Date.now() + 2000
  });
  assert.equal(result.state, 'waiting');
  assert.equal(result.diagnostic.reason, 'no-eligible-controls');

  dialog.inert = false;
  observed.callback([{ type: 'attributes', attributeName: 'inert', target: dialog }]);
  await delay(160);
  assert.equal(control.value, payload);
}

async function runBridgeAddedVisualLabelTest() {
  let observed = null;
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observed = this;
    }
    observe() {}
    disconnect() {}
  }
  context.MutationObserver = FakeMutationObserver;

  const labels = [];
  let dialog = null;
  const runtimeDoc = {
    nodeType: 9,
    body: {},
    defaultView: {
      ...eventView,
      getComputedStyle() {
        return { display: 'block', visibility: 'visible', opacity: '1' };
      }
    },
    getElementById() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('[role="dialog"]')) return [dialog];
      return dialog ? dialog.querySelectorAll(selector) : [];
    }
  };
  const control = new FakeInput();
  control.ownerDocument = runtimeDoc;
  control.getAttribute = () => null;
  control.getBoundingClientRect = () => fakeRect(267, 140, 100, 36);
  dialog = fakeDialog(runtimeDoc, [control], labels);
  dialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);

  const bridge = api.createBridge(runtimeDoc);
  const result = await bridge.arm({
    requestId: 'added-label-request',
    payload,
    generatedAt: new Date().toISOString(),
    scopeLabel: 'ES',
    expiresAt: Date.now() + 2000
  });
  assert.equal(result.state, 'waiting');
  assert.equal(result.diagnostic.reason, 'exact-label-not-found');

  const label = fakeLabel(runtimeDoc, 'RS Levels Payload', {}, 'DIV');
  label.parentElement = dialog;
  label.getBoundingClientRect = () => fakeRect(52, 140, 190, 36);
  labels.push(label);
  observed.callback([{
    type: 'childList',
    target: dialog,
    addedNodes: [label]
  }]);
  await delay(160);
  assert.equal(control.value, payload);
}

async function runBridgeOpacityTransitionTest() {
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  }
  context.MutationObserver = FakeMutationObserver;

  let dialog = null;
  const runtimeDoc = {
    body: {},
    defaultView: {
      ...eventView,
      getComputedStyle(element) {
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          ...(element && element.computedStyle || {})
        };
      }
    },
    getElementById() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('[role="dialog"]')) return [dialog];
      return dialog ? dialog.querySelectorAll(selector) : [];
    }
  };
  const control = new FakeInput();
  control.ownerDocument = runtimeDoc;
  control.getAttribute = (name) => name === 'aria-label' ? 'RS Levels Payload' : null;
  dialog = fakeDialog(runtimeDoc, [control]);
  dialog.computedStyle = { opacity: '0' };

  const bridge = api.createBridge(runtimeDoc);
  const result = await bridge.arm({
    requestId: 'opacity-request',
    payload,
    generatedAt: new Date().toISOString(),
    scopeLabel: 'ES',
    expiresAt: Date.now() + 2000
  });
  assert.equal(result.state, 'waiting');
  dialog.computedStyle = { opacity: '1' };
  await delay(560);
  assert.equal(control.value, payload);
}

async function runBridgeTreeWalkerDeepSplitLabelTest() {
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  context.MutationObserver = FakeMutationObserver;

  let dialog = null;
  let textNodes = [];
  const runtimeDoc = {
    nodeType: 9,
    body: {},
    documentElement: null,
    defaultView: {
      ...eventView,
      NodeFilter: { SHOW_TEXT: 4 },
      getComputedStyle() {
        return { display: 'block', visibility: 'visible', opacity: '1' };
      }
    },
    getElementById() {
      return null;
    },
    createTreeWalker() {
      let index = 0;
      return {
        nextNode() {
          return textNodes[index++] || null;
        }
      };
    },
    querySelectorAll(selector) {
      if (selector.includes('[role="dialog"]')) return [dialog];
      return dialog ? dialog.querySelectorAll(selector) : [];
    }
  };

  const control = new FakeInput();
  control.ownerDocument = runtimeDoc;
  control.getAttribute = () => null;
  control.getBoundingClientRect = () => fakeRect(267, 140, 100, 36);
  dialog = fakeDialog(runtimeDoc, [control]);
  dialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);
  runtimeDoc.documentElement = dialog;

  const commonLabel = {
    ownerDocument: runtimeDoc,
    parentElement: dialog,
    textContent: 'RS Levels Payload',
    isConnected: true,
    getClientRects() {
      return [{}];
    },
    getBoundingClientRect() {
      return fakeRect(52, 140, 190, 36);
    }
  };
  function splitBranch(fragment) {
    let parent = commonLabel;
    for (let depth = 0; depth < 8; depth += 1) {
      parent = {
        ownerDocument: runtimeDoc,
        parentElement: parent,
        textContent: fragment,
        isConnected: true
      };
    }
    return {
      nodeType: 3,
      nodeValue: fragment,
      parentElement: parent,
      ownerDocument: runtimeDoc
    };
  }
  textNodes = [splitBranch('RS Levels'), splitBranch('Payload')];

  const bridge = api.createBridge(runtimeDoc);
  const result = await bridge.arm({
    requestId: 'tree-walker-request',
    payload,
    generatedAt: new Date().toISOString(),
    scopeLabel: 'ES',
    expiresAt: Date.now() + 2000
  });
  assert.equal(result.state, 'filled');
  assert.equal(control.value, payload);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeDocument() {
  return {
    defaultView: {
      getComputedStyle(element) {
        return {
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          ...(element && element.computedStyle || {})
        };
      }
    },
    getElementById() {
      return null;
    }
  };
}

function fakeControl(ownerDocument, attributes = {}, id = '') {
  return {
    ownerDocument,
    tagName: 'INPUT',
    type: 'text',
    disabled: false,
    readOnly: false,
    hidden: false,
    isConnected: true,
    parentElement: null,
    id,
    labels: [],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
    getClientRects() {
      return [{}];
    },
    closest() {
      return null;
    }
  };
}

function fakeLabel(ownerDocument, textContent, attributes = {}, tagName = 'LABEL') {
  return {
    ownerDocument,
    textContent,
    tagName: String(tagName).toUpperCase(),
    parentElement: null,
    hidden: false,
    isConnected: true,
    children: [],
    contains() {
      return false;
    },
    matches(selector) {
      const candidates = String(selector).split(',').map((value) => value.trim());
      if (candidates.includes(String(tagName).toLowerCase())) return true;
      return candidates.includes('[role="label"]') && attributes.role === 'label';
    },
    getClientRects() {
      return [{}];
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
    querySelectorAll() {
      return [];
    }
  };
}

function fakeDialog(ownerDocument, controls, labels = [], attributes = { role: 'dialog' }) {
  const dialog = {
    ownerDocument,
    tagName: 'DIV',
    hidden: false,
    inert: false,
    isConnected: true,
    parentElement: null,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name);
    },
    matches(selector) {
      return (
        (selector.includes('[role="dialog"]') && attributes.role === 'dialog') ||
        (selector.includes('dialog') && this.tagName === 'DIALOG') ||
        (selector.includes('[aria-modal="true"]') && attributes['aria-modal'] === 'true')
      );
    },
    contains(node) {
      if (controls.includes(node) || labels.includes(node)) return true;
      let current = node && node.parentElement;
      while (current) {
        if (current === dialog) return true;
        current = current.parentElement;
      }
      return false;
    },
    getClientRects() {
      return [{}];
    },
    querySelectorAll(selector) {
      if (selector === 'input, textarea') return controls;
      if (selector === 'label[for]') return labels.filter((label) => label.getAttribute('for'));
      if (selector.includes(',')) return labels.filter((label) => label.matches(selector));
      return [];
    }
  };
  controls.forEach((control) => {
    if (!control.parentElement) control.parentElement = dialog;
  });
  labels.forEach((label) => {
    if (!label.parentElement) label.parentElement = dialog;
  });
  return dialog;
}

function fakeVisualRow(ownerDocument, controls, options = {}) {
  const label = fakeLabel(
    ownerDocument,
    options.labelText || 'RS Levels Payload',
    {},
    options.labelTag || 'DIV'
  );
  const labelCell = {
    parentElement: null,
    contains(node) {
      return node === label;
    },
    querySelectorAll() {
      return [];
    }
  };
  const row = {
    parentElement: null,
    contains(node) {
      return node === label || controls.includes(node);
    },
    querySelectorAll(selector) {
      return selector === 'input, textarea' ? controls : [];
    }
  };
  const dialog = fakeDialog(ownerDocument, controls, [label]);
  const controlRects = options.controlRects || controls.map((_, index) =>
    fakeRect(267 + (index * 110), 140, 100, 36)
  );

  label.parentElement = labelCell;
  labelCell.parentElement = row;
  row.parentElement = dialog;
  label.getBoundingClientRect = () => options.labelRect || fakeRect(52, 140, 190, 36);
  controls.forEach((control, index) => {
    control.getBoundingClientRect = () => controlRects[index];
  });
  dialog.getBoundingClientRect = () => fakeRect(0, 0, 420, 600);

  return { dialog, label, row };
}

function fakeRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

function fakeRoot(dialogs, options = {}) {
  const root = {
    contains(node) {
      return dialogs.some((dialog) => dialog === node || dialog.contains(node));
    },
    querySelectorAll(selector) {
      if (selector.includes('[role="dialog"]')) {
        return options.includeDialogs === false ? [] : dialogs;
      }
      return dialogs.flatMap((dialog) => Array.from(dialog.querySelectorAll(selector)));
    }
  };
  dialogs.forEach((dialog) => {
    if (!dialog.parentElement) dialog.parentElement = root;
  });
  return root;
}
