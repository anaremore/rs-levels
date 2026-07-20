(() => {
  'use strict';

  const FIELD_LABEL = 'RS Levels Payload';
  const BRIDGE_VERSION = 2;
  const BRIDGE_KEY = '__RS_LEVELS_TRADINGVIEW_BRIDGE_VERSIONED__';
  const LEGACY_BRIDGE_KEY = '__RS_LEVELS_TRADINGVIEW_BRIDGE__';
  const API_KEY = 'RS_LEVELS_TRADINGVIEW_AUTOFILL';
  const HANDOFF_TYPE = 'rs-levels.tradingview-arm-v2';
  const MAX_PAYLOAD_LENGTH = 40960;
  const MAX_HANDOFF_MS = 5 * 60 * 1000;
  const DEFAULT_WAIT_MS = 45 * 1000;
  const SEMANTIC_LABEL_SELECTOR = 'label, [role="label"], [class*="label"], [class*="title"], [data-name*="label"], [data-name*="title"]';
  const FALLBACK_LABEL_SELECTOR = 'span, div';
  const DIALOG_SELECTOR = '[role="dialog"], dialog, [aria-modal="true"], [data-name*="dialog"]';

  const api = Object.freeze({
    FIELD_LABEL,
    BRIDGE_VERSION,
    DIALOG_SELECTOR,
    createBridge,
    normalizeText,
    isVisible,
    findPayloadControl,
    inspectPayloadControl,
    findPayloadControlInDialog,
    findVisuallyAssociatedControl,
    isSameSettingRow,
    readAccessibleName,
    setControlValue,
    validateHandoff
  });

  globalThis[API_KEY] = api;

  if (
    typeof document !== 'object' ||
    typeof chrome !== 'object' ||
    !chrome.runtime ||
    !chrome.runtime.onMessage
  ) {
    return;
  }

  const legacyBridge = globalThis[LEGACY_BRIDGE_KEY];
  if (legacyBridge && typeof legacyBridge.stop === 'function') {
    try {
      legacyBridge.stop();
    } catch (_error) {}
    globalThis[LEGACY_BRIDGE_KEY] = undefined;
  }

  const existingBridge = globalThis[BRIDGE_KEY];
  if (existingBridge && typeof existingBridge.dispose === 'function') {
    try {
      existingBridge.dispose();
    } catch (_error) {}
  }

  const bridge = createBridge(document);
  const messageListener = (message, _sender, sendResponse) => {
    if (!message || message.type !== HANDOFF_TYPE) return false;
    bridge.arm(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({
        ok: false,
        error: error && error.message ? error.message : 'TradingView autofill failed.'
      }));
    return true;
  };
  bridge.dispose = () => {
    try {
      bridge.stop();
    } catch (_error) {}
    try {
      if (chrome.runtime.onMessage.removeListener) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    } catch (_error) {}
    if (globalThis[BRIDGE_KEY] === bridge) {
      delete globalThis[BRIDGE_KEY];
    }
  };
  chrome.runtime.onMessage.addListener(messageListener);
  globalThis[BRIDGE_KEY] = bridge;

  function createBridge(doc) {
    let pending = null;
    let observer = null;
    let timeoutId = null;
    let scheduledId = null;
    let retryId = null;
    let filling = false;
    let toast = null;
    let toastTimer = null;
    let lastDiagnostic = null;
    let labelCandidates = new Set();

    async function arm(message) {
      stopPending();
      pending = validateHandoff(message);
      labelCandidates = new Set();
      collectExactLabelCandidates(doc, labelCandidates);
      showToast(
        'RS Levels waiting',
        'Open the RS Levels indicator settings. Waiting for the payload field for 45 seconds.',
        'waiting',
        8000
      );

      const root = doc.body || doc.documentElement;
      const canObserve = root && typeof MutationObserver === 'function';
      if (canObserve) {
        observer = new MutationObserver(scheduleAttempt);
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          attributeFilter: [
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
          ]
        });
      }

      const immediate = await attemptFill();
      if (immediate) return immediate;
      if (!canObserve) {
        stopPending();
        throw new Error('TradingView settings are not ready. Use Copy payload instead.');
      }

      showToast(
        'RS Levels waiting',
        diagnosticHint(lastDiagnostic && lastDiagnostic.reason),
        'waiting',
        8000
      );
      scheduleRetryPoll();

      const waitMs = Math.max(1, Math.min(pending.expiresAt - Date.now(), DEFAULT_WAIT_MS));
      timeoutId = setTimeout(() => {
        if (!pending) return;
        stopPending();
        showToast(
          'RS Levels timed out',
          diagnosticHint(lastDiagnostic && lastDiagnostic.reason) + ' Send to TradingView again.',
          'error',
          7000
        );
      }, waitMs);

      return {
        ok: true,
        state: 'waiting',
        requestId: pending.requestId,
        diagnostic: lastDiagnostic
      };
    }

    function scheduleAttempt(records = []) {
      if (!pending) return;
      updateLabelCandidates(records);
      if (scheduledId != null) return;
      scheduledId = setTimeout(() => {
        scheduledId = null;
        attemptFill().catch(() => {});
      }, 100);
    }

    function scheduleRetryPoll() {
      if (!pending || retryId != null) return;
      retryId = setTimeout(() => {
        retryId = null;
        attemptFill()
          .catch(() => {})
          .finally(() => {
            if (pending) scheduleRetryPoll();
          });
      }, 500);
    }

    async function attemptFill() {
      if (!pending || filling || Date.now() > pending.expiresAt) return null;
      const inspection = inspectPayloadControl(doc, labelCandidates);
      lastDiagnostic = inspection.diagnostic;
      const control = inspection.control;
      if (!control) return null;

      filling = true;
      const current = pending;
      try {
        if (!setControlValue(control, current.payload)) {
          throw new Error('TradingView did not accept the RS Levels payload.');
        }
        await afterPaint(control);
        if (control.value !== current.payload) {
          throw new Error('TradingView restored the previous value. Use Copy payload instead.');
        }

        const age = payloadAgeText(current.generatedAt);
        stopPending();
        showToast(
          'RS Levels loaded',
          'Loaded ' + current.scopeLabel + (age ? ' · ' + age : '') + '. Review the input and click OK.',
          'ok',
          7000
        );
        return {
          ok: true,
          state: 'filled',
          requestId: current.requestId,
          diagnostic: lastDiagnostic
        };
      } catch (error) {
        stopPending();
        showToast(
          'RS Levels could not fill',
          error && error.message ? error.message : 'Use Copy payload instead.',
          'error',
          9000
        );
        throw error;
      } finally {
        filling = false;
      }
    }

    function stopPending() {
      pending = null;
      if (observer) observer.disconnect();
      observer = null;
      if (timeoutId != null) clearTimeout(timeoutId);
      timeoutId = null;
      if (scheduledId != null) clearTimeout(scheduledId);
      scheduledId = null;
      if (retryId != null) clearTimeout(retryId);
      retryId = null;
      labelCandidates.clear();
    }

    function showToast(title, body, mode, durationMs) {
      if (!toast || !toast.host.isConnected) {
        toast = createToast(doc);
      }
      if (!toast) return;
      toast.title.textContent = title;
      toast.body.textContent = body;
      toast.card.dataset.mode = mode;
      toast.host.style.opacity = '1';
      if (toastTimer != null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        if (toast && toast.host) toast.host.style.opacity = '0';
      }, durationMs);
    }

    function updateLabelCandidates(records) {
      for (const record of Array.from(records || [])) {
        if (!record) continue;
        if (record.type === 'characterData') {
          collectTextLabelCandidate(record.target, labelCandidates);
          continue;
        }
        if (record.type === 'childList') {
          for (const node of Array.from(record.addedNodes || [])) {
            collectExactLabelCandidates(node, labelCandidates);
          }
          collectElementLabelCandidates(record.target, labelCandidates);
        }
      }
    }

    return { version: BRIDGE_VERSION, arm, stop: stopPending };
  }

  function validateHandoff(message) {
    const payload = String(message && message.payload || '').trim();
    if (
      !payload.startsWith('RSLEVELS|2|') ||
      payload.length > MAX_PAYLOAD_LENGTH ||
      payload.split('|').length < 6
    ) {
      throw new Error('The RS Levels payload is invalid or too large for TradingView.');
    }

    const requestId = String(message.requestId || '').trim();
    if (!requestId || requestId.length > 128) {
      throw new Error('The TradingView handoff request is invalid.');
    }

    const expiresAt = Number(message.expiresAt);
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(expiresAt) || remaining <= 0 || remaining > MAX_HANDOFF_MS) {
      throw new Error('The TradingView handoff expired. Send the levels again.');
    }

    return {
      requestId,
      payload,
      expiresAt,
      generatedAt: String(message.generatedAt || ''),
      scopeLabel: safeScopeLabel(message.scopeLabel)
    };
  }

  function findPayloadControl(root, labelCandidates) {
    return analyzePayloadControl(root, labelCandidates).control;
  }

  function findPayloadControls(root, labelCandidates) {
    return analyzePayloadControl(root, labelCandidates).matches;
  }

  function inspectPayloadControl(root, labelCandidates) {
    const analysis = analyzePayloadControl(root, labelCandidates);
    return {
      control: analysis.control,
      diagnostic: analysis.diagnostic
    };
  }

  function analyzePayloadControl(root, labelCandidates) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return emptyPayloadAnalysis();
    }

    const visible = createVisibilityChecker();
    const rawControls = safeQueryAll(root, 'input, textarea');
    const eligibleControls = rawControls
      .filter(isSupportedTextControl)
      .filter(visible);
    const visibleDialogs = uniqueElements([
      ...(nodeMatchesSelector(root, DIALOG_SELECTOR) && visible(root) ? [root] : []),
      ...safeQueryAll(root, DIALOG_SELECTOR).filter(visible)
    ]);
    const exactVisualLabels = findExactVisualLabels(root, labelCandidates, visible);
    const accessibleNames = new Map(eligibleControls.map((control) => [
      control,
      normalizeText(readAccessibleName(control, root))
    ]));
    const accessibleMatches = eligibleControls.filter((control) => {
      return accessibleNames.get(control) === FIELD_LABEL;
    });
    const controlScopes = new Map(eligibleControls.map((control) => [
      control,
      innermostContainingDialog(control, visibleDialogs)
    ]));
    const deepestLabels = exactVisualLabels.filter((label) => !exactVisualLabels.some((other) => {
      return other !== label && scopeContains(label, other);
    }));
    const visualMatches = uniqueElements(deepestLabels.flatMap((label) => {
      const labelScope = innermostContainingDialog(label, visibleDialogs);
      const geometryScope = labelScope || root;
      return eligibleControls.filter((control) => {
        if (controlScopes.get(control) !== labelScope) return false;
        const accessibleName = accessibleNames.get(control);
        return (!accessibleName || accessibleName === FIELD_LABEL) &&
          isSameSettingRow(label, control, geometryScope);
      });
    }));
    const matches = uniqueElements([...accessibleMatches, ...visualMatches]);

    let reason = 'geometry-mismatch';
    if (matches.length === 1) reason = 'matched';
    else if (matches.length > 1) reason = 'ambiguous-match';
    else if (rawControls.length === 0) reason = 'no-controls';
    else if (eligibleControls.length === 0) reason = 'no-eligible-controls';
    else if (exactVisualLabels.length === 0 && accessibleMatches.length === 0) {
      reason = 'exact-label-not-found';
    }

    return {
      control: matches.length === 1 ? matches[0] : null,
      matches,
      visualMatches,
      diagnostic: {
        version: 1,
        outcome: matches.length === 1 ? 'matched' : 'waiting',
        reason,
        counts: {
          visibleDialogs: boundedCount(visibleDialogs),
          rawControls: boundedCount(rawControls),
          eligibleControls: boundedCount(eligibleControls),
          accessibleMatches: boundedCount(accessibleMatches),
          exactVisualLabels: boundedCount(exactVisualLabels),
          uniqueMatches: boundedCount(matches)
        }
      }
    };
  }

  function emptyPayloadAnalysis() {
    return {
      control: null,
      matches: [],
      visualMatches: [],
      diagnostic: {
        version: 1,
        outcome: 'waiting',
        reason: 'no-controls',
        counts: {
          visibleDialogs: 0,
          rawControls: 0,
          eligibleControls: 0,
          accessibleMatches: 0,
          exactVisualLabels: 0,
          uniqueMatches: 0
        }
      }
    };
  }

  function findPayloadControlInDialog(dialog, labelCandidates) {
    return analyzePayloadControl(dialog, labelCandidates).control;
  }

  function findPayloadControlsInDialog(dialog, labelCandidates) {
    return analyzePayloadControl(dialog, labelCandidates).matches;
  }

  function findVisuallyAssociatedControl(dialog, labelCandidates) {
    const matches = findVisuallyAssociatedControls(dialog, labelCandidates);
    return matches.length === 1 ? matches[0] : null;
  }

  function findVisuallyAssociatedControls(dialog, labelCandidates) {
    return analyzePayloadControl(dialog, labelCandidates).visualMatches;
  }

  function findExactVisualLabels(root, labelCandidates, visible) {
    let candidates;
    if (labelCandidates instanceof Set) {
      candidates = Array.from(labelCandidates);
    } else {
      const discovered = new Set();
      collectExactLabelCandidates(root, discovered);
      candidates = Array.from(discovered);
    }

    return uniqueElements(candidates
      .filter((node) => scopeContains(root, node))
      .filter(hasExactLabelText)
      .filter(visible));
  }

  function collectExactLabelCandidates(scope, target) {
    if (!scope || !(target instanceof Set)) return;

    if (Number(scope.nodeType) === 3) {
      collectTextLabelCandidate(scope, target);
      return;
    }

    const walkerRoot = Number(scope.nodeType) === 9
      ? scope.documentElement || scope
      : scope;
    const semanticNodes = uniqueElements([
      ...(nodeMatchesSelector(walkerRoot, SEMANTIC_LABEL_SELECTOR) ? [walkerRoot] : []),
      ...safeQueryAll(walkerRoot, SEMANTIC_LABEL_SELECTOR)
    ]);
    for (const node of semanticNodes) {
      if (hasExactLabelText(node)) target.add(node);
    }

    const doc = Number(scope.nodeType) === 9 ? scope : scope.ownerDocument;
    if (doc && typeof doc.createTreeWalker === 'function' && walkerRoot) {
      try {
        const showText = doc.defaultView && doc.defaultView.NodeFilter
          ? doc.defaultView.NodeFilter.SHOW_TEXT
          : 4;
        const walker = doc.createTreeWalker(walkerRoot, showText);
        let textNode = walker.nextNode();
        while (textNode) {
          collectTextLabelCandidate(textNode, target);
          textNode = walker.nextNode();
        }
        return;
      } catch (_error) {}
    }

    const fallbackNodes = uniqueElements([
      ...(nodeMatchesSelector(walkerRoot, FALLBACK_LABEL_SELECTOR) ? [walkerRoot] : []),
      ...safeQueryAll(walkerRoot, FALLBACK_LABEL_SELECTOR)
    ]);
    for (const node of fallbackNodes) {
      if (hasExactLabelText(node)) target.add(node);
    }
  }

  function collectTextLabelCandidate(textNode, target) {
    const fragment = normalizeText(textNode && (textNode.nodeValue || textNode.textContent));
    if (!fragment || (!FIELD_LABEL.includes(fragment) && !fragment.includes(FIELD_LABEL))) return;
    collectElementLabelCandidates(textNode && textNode.parentElement, target);
  }

  function collectElementLabelCandidates(start, target) {
    let candidate = Number(start && start.nodeType) === 3 ? start.parentElement : start;
    for (let depth = 0; candidate && depth < 12; depth += 1) {
      const text = readBoundedNodeText(candidate);
      if (text === FIELD_LABEL) target.add(candidate);
      if (text == null) break;
      if (text && !FIELD_LABEL.includes(text) && !text.includes(FIELD_LABEL)) break;
      candidate = candidate.parentElement || shadowHost(candidate);
    }
  }

  function hasExactLabelText(node) {
    return readBoundedNodeText(node) === FIELD_LABEL;
  }

  function readBoundedNodeText(node) {
    if (!node) return '';
    if (!node.childNodes || typeof node.childNodes.length !== 'number') {
      const fallback = String(node.textContent || '');
      return fallback.length > FIELD_LABEL.length * 6 ? null : normalizeText(fallback);
    }

    const stack = [node];
    let raw = '';
    let visited = 0;
    while (stack.length) {
      const current = stack.pop();
      visited += 1;
      if (visited > 128) return null;
      if (Number(current && current.nodeType) === 3) {
        raw += String(current.nodeValue || '');
        if (raw.length > FIELD_LABEL.length * 6) return null;
        continue;
      }
      const children = current && current.childNodes;
      if (!children || typeof children.length !== 'number') continue;
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
    return normalizeText(raw);
  }

  function innermostContainingDialog(node, dialogs) {
    const containing = dialogs.filter((dialog) => scopeContains(dialog, node));
    return containing.reduce((smallest, dialog) => {
      if (!smallest || scopeContains(smallest, dialog)) return dialog;
      return smallest;
    }, null);
  }

  function scopeContains(scope, node) {
    if (!scope || !node) return false;
    if (scope === node) return true;
    try {
      if (typeof scope.contains === 'function' && scope.contains(node)) return true;
    } catch (_error) {}
    if (Number(scope.nodeType) === 9 && node.ownerDocument === scope) return true;

    let current = node.parentElement;
    const visited = new Set();
    while (current && !visited.has(current)) {
      if (current === scope) return true;
      visited.add(current);
      current = current.parentElement || shadowHost(current);
    }
    return false;
  }

  function nodeMatchesSelector(node, selector) {
    if (!node || typeof node.matches !== 'function') return false;
    try {
      return node.matches(selector);
    } catch (_error) {
      return false;
    }
  }

  function isSameSettingRow(label, control, dialog) {
    if (!label || !control || label === control) return false;
    if (typeof label.contains === 'function' && label.contains(control)) return false;

    const labelRect = elementRect(label);
    const controlRect = elementRect(control);
    if (!labelRect || !controlRect) return false;

    const verticalOverlap = Math.min(labelRect.bottom, controlRect.bottom) -
      Math.max(labelRect.top, controlRect.top);
    if (verticalOverlap <= 0) return false;

    const labelCenter = (labelRect.top + labelRect.bottom) / 2;
    const controlCenter = (controlRect.top + controlRect.bottom) / 2;
    const centerTolerance = Math.max(12, Math.min(48, Math.max(labelRect.height, controlRect.height)));
    if (Math.abs(labelCenter - controlCenter) > centerTolerance) return false;

    const horizontalDistance = controlRect.left - labelRect.left;
    if (horizontalDistance < 16) return false;
    const dialogRect = elementRect(dialog);
    const maxDistance = dialogRect
      ? Math.max(120, Math.min(520, dialogRect.width * 0.9))
      : 360;
    return horizontalDistance <= maxDistance;
  }

  function elementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return null;
    try {
      const rect = element.getBoundingClientRect();
      const left = Number(rect.left);
      const top = Number(rect.top);
      const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + Number(rect.width);
      const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + Number(rect.height);
      const width = right - left;
      const height = bottom - top;
      if (![left, top, right, bottom, width, height].every(Number.isFinite)) return null;
      if (width <= 0 || height <= 0) return null;
      return { left, top, right, bottom, width, height };
    } catch (_error) {
      return null;
    }
  }

  function readAccessibleName(control, root) {
    if (!control || typeof control.getAttribute !== 'function') return '';

    const ariaLabel = control.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const labelledBy = String(control.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean);
    if (labelledBy.length && control.ownerDocument && control.ownerDocument.getElementById) {
      const text = labelledBy
        .map((id) => control.ownerDocument.getElementById(id))
        .filter(Boolean)
        .map((node) => node.textContent || '')
        .join(' ');
      if (normalizeText(text)) return text;
    }

    if (control.labels && control.labels.length) {
      const text = Array.from(control.labels).map((label) => label.textContent || '').join(' ');
      if (normalizeText(text)) return text;
    }

    if (typeof control.closest === 'function') {
      const nested = control.closest('label');
      if (nested && normalizeText(nested.textContent)) return nested.textContent;
    }

    const controlId = String(control.id || '');
    if (controlId && root && typeof root.querySelectorAll === 'function') {
      const labels = Array.from(root.querySelectorAll('label[for]'));
      const match = labels.find((label) => label.getAttribute('for') === controlId);
      if (match) return match.textContent || '';
    }

    return '';
  }

  function setControlValue(control, value) {
    if (!isSupportedTextControl(control) || typeof control.dispatchEvent !== 'function') return false;
    const view = control.ownerDocument && control.ownerDocument.defaultView || globalThis;
    const prototype = control.tagName.toLowerCase() === 'textarea'
      ? view.HTMLTextAreaElement && view.HTMLTextAreaElement.prototype
      : view.HTMLInputElement && view.HTMLInputElement.prototype;
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor || typeof descriptor.set !== 'function') return false;

    descriptor.set.call(control, value);
    control.dispatchEvent(createInputEvent(view, value));
    control.dispatchEvent(new view.Event('change', { bubbles: true }));
    return control.value === value;
  }

  function createInputEvent(view, value) {
    if (typeof view.InputEvent === 'function') {
      try {
        return new view.InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value
        });
      } catch (_error) {}
    }
    return new view.Event('input', { bubbles: true });
  }

  function afterPaint(control) {
    const view = control.ownerDocument && control.ownerDocument.defaultView || globalThis;
    return new Promise((resolve) => {
      if (typeof view.requestAnimationFrame === 'function') {
        view.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function isSupportedTextControl(control) {
    if (!control || !control.tagName || control.disabled || control.readOnly) return false;
    const tag = control.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag !== 'input') return false;
    const type = String(control.type || control.getAttribute && control.getAttribute('type') || 'text').toLowerCase();
    return type === 'text' || type === 'search' || type === '';
  }

  function createVisibilityChecker() {
    const cache = new Map();
    return (element) => isVisible(element, cache);
  }

  function isVisible(element, cache = null) {
    if (!element || element.isConnected === false) return false;
    if (cache && cache.has(element)) return cache.get(element);

    const doc = element.ownerDocument;
    const view = doc && doc.defaultView;
    let current = element;
    let result = true;
    const visited = new Set();

    while (current && !visited.has(current)) {
      visited.add(current);
      if (current.isConnected === false || blocksVisibility(current)) {
        result = false;
        break;
      }
      if (view && typeof view.getComputedStyle === 'function') {
        try {
          const style = view.getComputedStyle(current);
          const opacity = style && Number.parseFloat(style.opacity);
          if (
            style &&
            (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              style.visibility === 'collapse' ||
              opacity === 0
            )
          ) {
            result = false;
            break;
          }
        } catch (_error) {}
      }
      current = current.parentElement || shadowHost(current);
    }

    if (
      result &&
      typeof element.getClientRects === 'function' &&
      element.getClientRects().length === 0
    ) {
      result = false;
    }

    let rect = null;
    if (result && typeof element.getBoundingClientRect === 'function') {
      rect = elementRect(element);
      if (!rect) result = false;
    }
    const viewportWidth = view && Number(view.innerWidth);
    const viewportHeight = view && Number(view.innerHeight);
    if (
      rect &&
      Number.isFinite(viewportWidth) &&
      Number.isFinite(viewportHeight) &&
      viewportWidth > 0 &&
      viewportHeight > 0 &&
      (
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= viewportWidth ||
        rect.top >= viewportHeight
      )
    ) {
      result = false;
    }

    if (cache) cache.set(element, result);
    return result;
  }

  function blocksVisibility(node) {
    if (!node) return true;
    if (node.hidden === true || node.inert === true) return true;
    if (typeof node.hasAttribute === 'function') {
      try {
        if (node.hasAttribute('hidden') || node.hasAttribute('inert')) return true;
      } catch (_error) {}
    }
    if (typeof node.getAttribute === 'function') {
      try {
        if (String(node.getAttribute('aria-hidden') || '').toLowerCase() === 'true') {
          return true;
        }
      } catch (_error) {}
    }

    if (String(node.tagName || '').toUpperCase() === 'DIALOG') {
      let open = node.open === true;
      if (!open && typeof node.hasAttribute === 'function') {
        try {
          open = node.hasAttribute('open');
        } catch (_error) {}
      }
      if (!open && typeof node.getAttribute === 'function') {
        try {
          open = node.getAttribute('open') != null;
        } catch (_error) {}
      }
      if (!open) return true;
    }
    return false;
  }

  function shadowHost(node) {
    if (!node || typeof node.getRootNode !== 'function') return null;
    try {
      const root = node.getRootNode();
      return root && root.host || null;
    } catch (_error) {
      return null;
    }
  }

  function createToast(doc) {
    const parent = doc.body || doc.documentElement;
    if (!parent || typeof doc.createElement !== 'function') return null;

    const host = doc.createElement('div');
    host.id = 'rs-levels-tradingview-status';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    host.style.position = 'fixed';
    host.style.right = '20px';
    host.style.bottom = '20px';
    host.style.zIndex = '2147483647';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.transition = 'opacity 180ms ease-out';

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = [
      '<style>',
      ':host{all:initial}',
      '.card{width:min(340px,calc(100vw - 40px));box-sizing:border-box;padding:12px 14px;',
      'background:#101720;border:1px solid #334157;color:#eef6ff;',
      'font:13px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'box-shadow:0 12px 32px rgba(0,0,0,.36)}',
      '.card[data-mode="ok"]{border-color:#2baa58}',
      '.card[data-mode="error"]{border-color:#b94a4a}',
      '.title{font-weight:700;margin:0 0 4px}.body{color:#c6d6ea;margin:0}',
      '@media(prefers-reduced-motion:reduce){:host{transition:none!important}}',
      '</style>',
      '<section class="card" data-mode="waiting">',
      '<p class="title"></p><p class="body"></p>',
      '</section>'
    ].join('');

    parent.appendChild(host);
    return {
      host,
      card: shadow.querySelector('.card'),
      title: shadow.querySelector('.title'),
      body: shadow.querySelector('.body')
    };
  }

  function payloadAgeText(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return '';
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return 'captured ' + seconds + 's ago';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return 'captured ' + minutes + 'm ago';
    return 'captured at ' + new Date(time).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function safeScopeLabel(value) {
    const text = String(value || 'Selected charts').replace(/[^A-Za-z0-9 .,+/&()-]/g, '').trim();
    return text.slice(0, 80) || 'Selected charts';
  }

  function diagnosticHint(reason) {
    switch (reason) {
      case 'no-controls':
        return 'Open the RS Levels indicator settings; no text fields are visible yet.';
      case 'no-eligible-controls':
        return 'The settings field is present but is not editable yet.';
      case 'exact-label-not-found':
        return 'The RS Levels Payload label is not visible yet.';
      case 'ambiguous-match':
        return 'More than one possible payload field is visible; close duplicate settings dialogs.';
      case 'geometry-mismatch':
        return 'The payload label is visible, but its input could not be identified safely.';
      case 'matched':
        return 'The RS Levels Payload field is ready.';
      default:
        return 'Open the RS Levels indicator settings. Waiting for the payload field for 45 seconds.';
    }
  }

  function safeQueryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (_error) {
      return [];
    }
  }

  function boundedCount(values) {
    const count = Array.isArray(values) ? values.length : Number(values) || 0;
    return Math.max(0, Math.min(99, Math.floor(count)));
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function uniqueElements(values) {
    return Array.from(new Set(values));
  }
})();
