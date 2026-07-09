(() => {
  const SOURCE = 'rs-levels-page';
  const CONTROL_SOURCE = 'rs-levels-content';
  const TARGET_ORIGIN = window.location.origin;
  const READER_KEY = '__RS_LEVELS_PAGE_READER__';
  const POLL_MS = 2000;

  if (globalThis[READER_KEY]) {
    globalThis[READER_KEY].publishDiagnostic('reader-reconnected');
    return;
  }

  let settings = {
    captureEnabled: false,
    maxCaptureBytes: 1024 * 1024
  };
  let timer = 0;
  let lastHash = '';
  let lastCaptureAt = 0;
  const stats = {
    observedCount: 0,
    ignoredCount: 0,
    skippedDisabledCount: 0,
    skippedTooLargeCount: 0,
    skippedNonTextCount: 0,
    skippedEmptyCount: 0,
    readErrorCount: 0,
    publishedCount: 0,
    lastReason: '',
    lastDiagnosticAt: ''
  };

  globalThis[READER_KEY] = { publishDiagnostic };

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== TARGET_ORIGIN) return;
    const data = event.data || {};
    if (data.source !== CONTROL_SOURCE || data.type !== 'settings') return;
    settings = {
      captureEnabled: data.captureEnabled === true,
      maxCaptureBytes: Number.isFinite(Number(data.maxCaptureBytes)) ? Number(data.maxCaptureBytes) : 1024 * 1024
    };
    publishDiagnostic('reader-settings-synced');
    poll();
  });

  function postToContent(message) {
    window.postMessage({ source: SOURCE, ...message }, TARGET_ORIGIN);
  }

  function publishDiagnostic(reason) {
    stats.lastReason = reason;
    stats.lastDiagnosticAt = new Date().toISOString();
    postToContent({
      type: 'diagnostic',
      stats: { ...stats }
    });
  }

  function publishSnapshot(snapshot) {
    const body = JSON.stringify(snapshot);
    if (body.length > settings.maxCaptureBytes) {
      stats.skippedTooLargeCount += 1;
      publishDiagnostic('reader-too-large');
      return;
    }
    stats.publishedCount += 1;
    lastCaptureAt = Date.now();
    publishDiagnostic('reader-published');
    postToContent({
      type: 'capture',
      capture: {
        endpoint: '/page-reader/display',
        method: 'PAGE_READER',
        status: 200,
        capturedAt: snapshot.capturedAt,
        body
      }
    });
  }

  function poll() {
    stats.observedCount += 1;
    if (!settings.captureEnabled) {
      stats.skippedDisabledCount += 1;
      publishDiagnostic('reader-disabled');
      return;
    }

    const snapshot = readDisplaySnapshot();
    const hash = stableHash(snapshot);
    if (!snapshot.levels.length && !snapshotHasStats(snapshot)) {
      stats.skippedEmptyCount += 1;
      if (hash !== lastHash) {
        lastHash = hash;
        publishSnapshot(snapshot);
        return;
      }
      publishDiagnostic(snapshot.reader.chartCount ? 'reader-empty' : 'reader-waiting');
      return;
    }

    if (hash === lastHash && Date.now() - lastCaptureAt < 15000) {
      stats.ignoredCount += 1;
      publishDiagnostic('reader-unchanged');
      return;
    }
    lastHash = hash;
    publishSnapshot(snapshot);
  }

  function readDisplaySnapshot() {
    const capturedAt = new Date().toISOString();
    const state = {
      type: 'rs_snapshot',
      source: 'page-reader',
      capturedAt,
      levels: [],
      stats: {},
      charts: [],
      chartLines: [],
      referenceLines: [],
      zoneRectangles: [],
      reader: {
        chartCount: 0,
        shapeCount: 0,
        studyCount: 0,
        levelCount: 0,
        statCount: 0,
        chartLineCount: 0,
        referenceLineCount: 0,
        zoneRectangleCount: 0
      }
    };
    const seen = {
      levels: new Set(),
      chartLines: new Set(),
      referenceLines: new Set(),
      zoneRectangles: new Set()
    };
    const detectedSymbols = new Set();
    try {
      const widget = globalThis.tvWidget;
      if (!widget) return state;
      const chartCount = chartCountFromWidget(widget);
      state.reader.chartCount = chartCount;
      for (let index = 0; index < chartCount; index += 1) {
        const chart = safeChart(widget, index);
        if (!chart) continue;
        const rawSymbol = safeString(call(chart, 'symbol'));
        const symbol = chartDisplaySymbol(rawSymbol);
        if (!symbol) continue;
        detectedSymbols.add(symbol);
        state.charts.push({ symbol, rawSymbol });
        readShapeLevels(chart, symbol, rawSymbol, state, seen);
        readStudyLevels(chart, symbol, rawSymbol, state, seen);
        readStudyStats(chart, symbol, state);
      }
      readScannerDisplayData(state, detectedSymbols, seen);
      readHeaderStats(state, detectedSymbols);
      readMapCodeStats(state, detectedSymbols);
      readRiskIntervalStats(state, detectedSymbols);
      readRiskIntervalDomStats(state, detectedSymbols);
    } catch (_err) {
      stats.readErrorCount += 1;
    }
    state.reader.levelCount = state.levels.length;
    state.reader.statCount = Object.keys(state.stats).length;
    state.reader.chartLineCount = state.chartLines.length;
    state.reader.referenceLineCount = state.referenceLines.length;
    state.reader.zoneRectangleCount = state.zoneRectangles.length;
    return state;
  }

  function readHeaderStats(state, detectedSymbols) {
    try {
      const nav = globalThis.document && document.querySelector ? document.querySelector('nav.navbar') : null;
      const text = compact(nav && nav.textContent);
      if (!text) return;
      const sp = text.match(/SP500:\s*DD:\s*([-\d.]+)\s*Res:?\s*([-\d.]+)\s*\|\s*([-\d.]+)\s*HP:\s*([-\d.]+)\s*MHP:\s*([-\d.]+)/i);
      if (sp && detectedSymbols.has('MES')) {
        addStats(state, 'MES', {
          dd: numberValue(sp[1]),
          resilience: numberValue(sp[2]),
          monthlyResilience: numberValue(sp[3])
        });
      }

      const nq = text.match(/NQ100:\s*Res:?\s*([-\d.]+)\s*\|\s*([-\d.]+)\s*HP:\s*([-\d.]+)\s*MHP:\s*([-\d.]+)/i);
      if (nq && detectedSymbols.has('MNQ')) {
        const esStats = state.stats.MES || {};
        addStats(state, 'MNQ', {
          dd: esStats.dd,
          resilience: numberValue(nq[1]),
          monthlyResilience: numberValue(nq[2])
        });
      }
    } catch (_err) {
      stats.readErrorCount += 1;
    }
  }

  function readMapCodeStats(state, detectedSymbols) {
    try {
      const table = globalThis.RS_SOCK && RS_SOCK.scanner && RS_SOCK.scanner.MASTER_TABLE && RS_SOCK.scanner.MASTER_TABLE.data;
      if (!plainObject(table)) return;
      if (detectedSymbols.has('MES')) {
        addStats(state, 'MES', { mapCode: mapCodeFromNode(table.SPY || table.SPX || table.SP500) });
      }
      if (detectedSymbols.has('MNQ')) {
        addStats(state, 'MNQ', { mapCode: mapCodeFromNode(table.QQQ || table.NDX || table.NQ100) });
      }
      detectedSymbols.forEach((symbol) => {
        if (symbol === 'MES' || symbol === 'MNQ') return;
        const row = scannerRow(table, symbol);
        if (row) addStats(state, symbol, { mapCode: mapCodeFromNode(row) });
      });
    } catch (_err) {
      stats.readErrorCount += 1;
    }
  }

  function readRiskIntervalStats(state, detectedSymbols) {
    try {
      const table = globalThis.RS_SOCK && RS_SOCK.scanner && RS_SOCK.scanner.MASTER_TABLE && RS_SOCK.scanner.MASTER_TABLE.data;
      if (!plainObject(table)) return;
      Object.entries(table).forEach(([key, row]) => {
        if (!plainObject(row)) return;
        const symbol = futuresSymbol(row.contract || row.Contract || row.symbol || row.Symbol || row.ticker || row.Ticker || key);
        if (!symbol || !detectedSymbols.has(symbol)) return;
        addStats(state, symbol, {
          riskInterval: firstFinite(row.riskInterval, row.ri, row.RI, row.risk, row.riskInt, row['Risk Interval'])
        });
      });
    } catch (_err) {
      stats.readErrorCount += 1;
    }
  }

  function readRiskIntervalDomStats(state, detectedSymbols) {
    try {
      const doc = globalThis.document;
      if (!doc || typeof doc.querySelectorAll !== 'function') return;
      readRiskIntervalTableRows(state, doc, detectedSymbols);
      readRiskIntervalRoleRows(state, doc, detectedSymbols);
    } catch (_err) {
      stats.readErrorCount += 1;
    }
  }

  function readRiskIntervalTableRows(state, doc, detectedSymbols) {
    domArray(doc.querySelectorAll('table')).forEach((table) => {
      let headers = [];
      domArray(table.querySelectorAll && table.querySelectorAll('tr')).forEach((row) => {
        const cells = cellTexts(row, 'th,td');
        if (!cells.length) return;
        if (riskIntervalHeaderRow(cells)) {
          headers = cells;
          return;
        }
        addRiskIntervalFromCells(state, cells, headers, detectedSymbols);
      });
    });
  }

  function readRiskIntervalRoleRows(state, doc, detectedSymbols) {
    let headers = [];
    domArray(doc.querySelectorAll('[role="row"]')).forEach((row) => {
      const cells = cellTexts(row, '[role="columnheader"],[role="cell"],[role="gridcell"]');
      if (!cells.length) return;
      if (riskIntervalHeaderRow(cells)) {
        headers = cells;
        return;
      }
      addRiskIntervalFromCells(state, cells, headers, detectedSymbols);
    });
  }

  function addRiskIntervalFromCells(state, cells, headers, detectedSymbols) {
    const symbol = symbolFromRiskIntervalCells(cells, headers);
    if (!symbol || !detectedSymbols.has(symbol)) return;
    const riskInterval = riskIntervalFromCells(cells, headers);
    if (riskInterval == null) return;
    addStats(state, symbol, { riskInterval });
  }

  function symbolFromRiskIntervalCells(cells, headers) {
    const preferredHeaders = ['CONTRACT', 'TICKER', 'SYMBOL', 'PRODUCTNAME'];
    for (const key of preferredHeaders) {
      const index = headerIndex(headers, key);
      if (index >= 0) {
        const symbol = futuresSymbol(cells[index]);
        if (symbol) return symbol;
      }
    }
    for (const cell of cells) {
      const symbol = futuresSymbol(cell);
      if (symbol) return symbol;
    }
    return '';
  }

  function riskIntervalFromCells(cells, headers) {
    const index = headerIndex(headers, 'RI', 'RISKINTERVAL');
    if (index >= 0) return numberValue(cells[index]);
    const labelled = compact(cells.join(' ')).match(/\b(?:RI|Risk\s*Interval)\b\s*:?\s*(-?[\d,]+(?:\.\d+)?)/i);
    if (labelled) return numberValue(labelled[1]);
    if (cells.length >= 6 && (futuresSymbol(cells[0]) || futuresSymbol(cells[2]))) {
      return numberValue(cells[5]);
    }
    return null;
  }

  function riskIntervalHeaderRow(cells) {
    return headerIndex(cells, 'RI', 'RISKINTERVAL') >= 0 &&
      ['CONTRACT', 'TICKER', 'SYMBOL', 'PRODUCTNAME'].some((key) => headerIndex(cells, key) >= 0);
  }

  function headerIndex(headers, ...keys) {
    const wanted = new Set(keys);
    return headers.findIndex((header) => wanted.has(headerKey(header)));
  }

  function headerKey(value) {
    return compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function cellTexts(row, selector) {
    if (!row || typeof row.querySelectorAll !== 'function') return [];
    const cells = domArray(row.querySelectorAll(selector)).map((cell) => compact(cell && cell.textContent));
    return cells.some(Boolean) ? cells : [];
  }

  function readStudyStats(chart, symbol, state) {
    const studies = safeArray(call(chart, 'getAllStudies'));
    for (const study of studies) {
      try {
        if (!/Resilience/i.test(safeString(study.name))) continue;
        const studyObject = chart.getStudyById ? chart.getStudyById(study.id) : null;
        const data = studyObject && studyObject._study && studyObject._study.data && studyObject._study.data();
        if (!data || typeof data.each !== 'function') continue;
        let best = null;
        data.each((_rowIndex, value) => {
          if (!Array.isArray(value) || value.length < 4) return;
          const resilience = numberValue(value[1]);
          const monthlyResilience = numberValue(value[2]);
          const weeklyResilience = numberValue(value[3]);
          if (resilience == null || monthlyResilience == null || weeklyResilience == null) return;
          if (resilience === 0 && monthlyResilience === 0 && weeklyResilience === 0) return;
          best = { resilience, monthlyResilience, weeklyResilience };
        });
        if (best) addStats(state, symbol, best);
      } catch (_err) {
        stats.readErrorCount += 1;
      }
    }
  }

  function readScannerDisplayData(state, detectedSymbols, seen) {
    try {
      const table = globalThis.RS_SOCK && RS_SOCK.scanner && RS_SOCK.scanner.MASTER_TABLE && RS_SOCK.scanner.MASTER_TABLE.data;
      if (!plainObject(table)) return;
      detectedSymbols.forEach((symbol) => {
        if (symbol === 'MES' || symbol === 'MNQ') return;
        const row = scannerRow(table, symbol);
        if (!row) return;
        [
          { name: 'MHP', kind: 'mhp', price: firstFinite(row.mhp, row.MHP, row.man_MHP, row.monthlyHp, row.monthlyHP) },
          { name: 'HP', kind: 'hp', price: firstFinite(row.hp, row.HP, row.man_HP, row.dailyHp, row.dailyHP) }
        ].forEach((level) => {
          if (!(level.price > 0)) return;
          addLevel(state.levels, seen, {
            symbol,
            ...level,
            color: '',
            source: 'rocketscooter-page',
            capturedAt: state.capturedAt,
            metadata: { rawSymbol: symbol, reader: 'scanner-table' }
          });
        });
      });
    } catch (_err) {
      stats.readErrorCount += 1;
    }
  }

  function scannerRow(table, symbol) {
    const direct = table[symbol];
    if (plainObject(direct)) return direct;
    for (const [key, row] of Object.entries(table)) {
      if (!plainObject(row)) continue;
      const rowSymbol = chartDisplaySymbol(row.symbol || row.Symbol || row.ticker || row.Ticker || key);
      if (rowSymbol === symbol) return row;
    }
    return null;
  }

  function addStats(state, symbolInput, statsInput = {}) {
    const symbol = chartDisplaySymbol(symbolInput);
    if (!symbol || !plainObject(statsInput)) return;
    const clean = {
      dd: firstFinite(statsInput.dd, statsInput.ddRatio),
      riskInterval: firstFinite(statsInput.riskInterval, statsInput.ri, statsInput.RI, statsInput.risk, statsInput.riskInt, statsInput['Risk Interval']),
      resilience: firstFinite(statsInput.resilience, statsInput.res, statsInput.dailyResilience),
      monthlyResilience: firstFinite(statsInput.monthlyResilience, statsInput.mres, statsInput.resilience2),
      weeklyResilience: firstFinite(statsInput.weeklyResilience, statsInput.wres, statsInput.resilience3),
      mapCode: normalizeMapCode(statsInput.mapCode)
    };
    if (!hasStats(clean)) return;
    const existing = state.stats[symbol] || {};
    state.stats[symbol] = {
      dd: clean.dd == null ? existing.dd : clean.dd,
      riskInterval: clean.riskInterval == null ? existing.riskInterval : clean.riskInterval,
      resilience: clean.resilience == null ? existing.resilience : clean.resilience,
      monthlyResilience: clean.monthlyResilience == null ? existing.monthlyResilience : clean.monthlyResilience,
      weeklyResilience: clean.weeklyResilience == null ? existing.weeklyResilience : clean.weeklyResilience,
      mapCode: clean.mapCode || existing.mapCode || ''
    };
  }

  function mapCodeFromNode(node) {
    if (!plainObject(node)) return '';
    const direct = normalizeMapCode(node.mapCode || node.map || node.liquidityMap || node.code);
    if (direct) return direct;
    return normalizeMapCode([
      node.BBrMr,
      node.zone,
      node.LS,
      node.hedging,
      node.UD,
      node.timePressure
    ].map(safeString).filter(Boolean).join(''));
  }

  function readShapeLevels(chart, symbol, rawSymbol, state, seen) {
    const shapes = safeArray(call(chart, 'getAllShapes'));
    state.reader.shapeCount += shapes.length;
    const zoneCounts = { bull: 0, bear: 0 };
    const index = displayIndex(symbol);

    for (const shape of shapes) {
      try {
        const object = chart.getShapeById ? chart.getShapeById(shape.id) : null;
        if (!object) continue;
        const points = safeArray(call(object, 'getPoints'));
        const prices = points
          .map((point) => numberValue(point && point.price))
          .filter((price) => price != null && price > 0);
        const props = plainObject(call(object, 'getProperties')) ? call(object, 'getProperties') : {};
        const label = shapeLabel(shape, props);
        const color = shapeColor(props);
        const side = zoneSide(label);
        const shapeName = safeString(shape && shape.name);
        const isRectangle = isZoneRectangleShape(shapeName, props);

        if (isRectangle && prices.length >= 2) {
          const top = Math.max(...prices);
          const bottom = Math.min(...prices);
          addZoneRectangle(state, seen, {
            index,
            chart: rawSymbol,
            top,
            bottom,
            name: shapeName,
            text: label,
            color,
            source: 'chart_shape',
            side
          });
          if (side) {
            zoneCounts[side] += 1;
            addLevel(state.levels, seen, {
              symbol,
              name: side === 'bear' ? `BrZT${zoneCounts[side]}` : `BZT${zoneCounts[side]}`,
              price: top,
              kind: side === 'bear' ? 'zone-bear' : 'zone-bull',
              color,
              source: 'rocketscooter-page',
              capturedAt: state.capturedAt,
              metadata: { rawSymbol, reader: 'shape-zone-top' }
            });
            addLevel(state.levels, seen, {
              symbol,
              name: side === 'bear' ? `BrZB${zoneCounts[side]}` : `BZB${zoneCounts[side]}`,
              price: bottom,
              kind: side === 'bear' ? 'zone-bear' : 'zone-bull',
              color,
              source: 'rocketscooter-page',
              capturedAt: state.capturedAt,
              metadata: { rawSymbol, reader: 'shape-zone-bottom' }
            });
            continue;
          }
        }

        const price = prices[0];
        if (!(price > 0)) continue;
        const levelName = levelNameFromLabel(label, color);
        if (shapeName === 'horizontal_line' || shapeName === 'horizontal_ray') {
          addChartLine(state, seen, {
            index,
            chart: rawSymbol,
            price,
            text: levelName || label,
            title: safeString(props && props.title),
            color,
            source: levelName ? 'chart_shape' : 'chart_horizontal',
            label
          });
        }
        if (!levelName) continue;
        addLevel(state.levels, seen, {
          symbol,
          name: levelName,
          price,
          kind: kindFromName(levelName),
          color,
          source: 'rocketscooter-page',
          capturedAt: state.capturedAt,
          metadata: { rawSymbol, reader: 'shape-line' }
        });
        if (kindFromName(levelName) === 'open-close') {
          addReferenceLine(state, seen, {
            index,
            name: levelName,
            price,
            source: 'chart_shape',
            text: label
          });
        }
      } catch (_err) {
        stats.readErrorCount += 1;
      }
    }
  }

  function readStudyLevels(chart, symbol, rawSymbol, state, seen) {
    const studies = safeArray(call(chart, 'getAllStudies'));
    state.reader.studyCount += studies.length;
    const index = displayIndex(symbol);
    for (const study of studies) {
      try {
        if (!/Liquidity|Map|Gap|Open|Close|Level|Zone|HP|MHP|DD/i.test(safeString(study.name))) continue;
        const studyObject = chart.getStudyById ? chart.getStudyById(study.id) : null;
        const data = studyObject && studyObject._study && studyObject._study.data && studyObject._study.data();
        if (!data || typeof data.each !== 'function') continue;
        const plotNames = studyPlotNames(studyObject);
        let last = null;
        data.each((_rowIndex, value) => {
          if (Array.isArray(value) && value.length > 1) last = value;
        });
        if (!last) continue;
        for (let i = 1; i < last.length; i += 1) {
          const price = numberValue(last[i]);
          if (!(price > 0)) continue;
          const name = levelNameFromLabel(plotNames[i - 1] || '', '');
          if (!name) continue;
          addLevel(state.levels, seen, {
            symbol,
            name,
            price,
            kind: kindFromName(name),
            color: '',
            source: 'rocketscooter-page',
            capturedAt: state.capturedAt,
            metadata: { rawSymbol, reader: 'study-plot', study: safeString(study.name) }
          });
          addReferenceLine(state, seen, {
            index,
            name,
            price,
            source: `study:${safeString(study.name) || 'unknown'}`,
            text: plotNames[i - 1] || ''
          });
        }
      } catch (_err) {
        stats.readErrorCount += 1;
      }
    }
  }

  function addLevel(levels, seen, level) {
    const price = numberValue(level.price);
    const name = safeString(level.name);
    if (!name || !(price > 0)) return;
    const key = [level.symbol, name, price.toFixed(2), level.kind || ''].join('|');
    if (seen.levels.has(key)) return;
    seen.levels.add(key);
    levels.push({
      ...level,
      name,
      price
    });
  }

  function addChartLine(state, seen, line) {
    const price = numberValue(line.price);
    const text = compact(line.text);
    if (!text || !(price > 0)) return;
    const key = [line.index, text, price.toFixed(2), line.source || ''].join('|');
    if (seen.chartLines.has(key)) return;
    seen.chartLines.add(key);
    state.chartLines.push({
      index: safeString(line.index),
      chart: safeString(line.chart),
      price,
      text,
      title: safeString(line.title),
      color: safeString(line.color),
      source: safeString(line.source || 'chart_shape'),
      label: compact(line.label)
    });
  }

  function addReferenceLine(state, seen, line) {
    const price = numberValue(line.price);
    const name = compact(line.name);
    if (!name || !(price > 0)) return;
    const key = [line.index, name, price.toFixed(2), line.source || ''].join('|');
    if (seen.referenceLines.has(key)) return;
    seen.referenceLines.add(key);
    state.referenceLines.push({
      index: safeString(line.index),
      name,
      price,
      source: safeString(line.source || 'chart_shape'),
      text: compact(line.text)
    });
  }

  function addZoneRectangle(state, seen, rectangle) {
    const top = numberValue(rectangle.top);
    const bottom = numberValue(rectangle.bottom);
    if (!(top > 0) || !(bottom > 0) || top <= bottom) return;
    const text = compact(rectangle.text);
    const key = [rectangle.index, top.toFixed(2), bottom.toFixed(2), text, rectangle.source || ''].join('|');
    if (seen.zoneRectangles.has(key)) return;
    seen.zoneRectangles.add(key);
    state.zoneRectangles.push({
      index: safeString(rectangle.index),
      chart: safeString(rectangle.chart),
      top,
      bottom,
      name: safeString(rectangle.name),
      text,
      color: safeString(rectangle.color),
      source: safeString(rectangle.source || 'chart_shape'),
      side: safeString(rectangle.side)
    });
  }

  function shapeLabel(shape, props) {
    return compact([
      shape && shape.name,
      props && props.text,
      props && props.title,
      props && props.name,
      props && props.description
    ].join(' '));
  }

  function shapeColor(props) {
    return normalizeColor(props && (props.linecolor || props.color || props.textcolor || props.backgroundColor));
  }

  function isZoneRectangleShape(shapeName, props) {
    const name = safeString(shapeName);
    if (/rect|box|range/i.test(name)) return true;
    return Boolean(props && (props.backgroundColor || props.bgcolor || props.fillColor || props.fillcolor));
  }

  function levelNameFromLabel(label, color) {
    const text = compact(label);
    const direct = text.match(/\b(OVNMHP|OVNHP|MHP|HP|man_MHP|man_HP|PrevDayClose|LastOpen|MidGap|HalfGap|HG|DD(?:\s*(?:Upper|Lower))?|Bull\s*Zone|Bea(?:r)?\s*Zone|BZT\d*|BZB\d*|BrZT\d*|BrZB\d*|CAT|YL\d*|RL\d*|Yellow\s*Line|Red\s*Line)\b/i);
    if (direct) return normalizeName(direct[1]);
    if (/\bOpen\b[^\d-]*-?[\d,]+(?:\.\d+)?/i.test(text) && !/\bClose\b/i.test(text)) return 'Open';
    if (/\bClose\b[^\d-]*-?[\d,]+(?:\.\d+)?/i.test(text) && !/Prev\s*Close|PrevDayClose/i.test(text)) return 'Close';
    const priced = text.match(/\b(Bull\s*Zone|Bea(?:r)?\s*Zone|MHP|HP|DD|Open|Close|Half\s*Gap|HG|CAT|YL\d*|RL\d*|Yellow\s*Line|Red\s*Line)\s*:?\s*-?[\d,]+(?:\.\d+)?/i);
    if (priced) return normalizeName(priced[1]);
    if (/Liquidity|liq-map-history/i.test(text)) {
      const byColor = hpMhpFromColor(color);
      if (byColor) return byColor;
    }
    return manualLevelNameFromColor(color);
  }

  function normalizeName(value) {
    const text = compact(value);
    if (/^man_mhp$/i.test(text)) return 'man_MHP';
    if (/^man_hp$/i.test(text)) return 'man_HP';
    if (/^mhp$/i.test(text)) return 'MHP';
    if (/^hp$/i.test(text)) return 'HP';
    if (/^hg$/i.test(text) || /half\s*gap/i.test(text)) return 'MidGap';
    if (/bull\s*zone/i.test(text)) return 'Bull Zone';
    if (/bea(?:r)?\s*zone/i.test(text)) return 'Bear Zone';
    if (/^cat$/i.test(text)) return 'CAT';
    if (/^yl\d*$/i.test(text) || /yellow\s*line/i.test(text)) return 'Yellow Line';
    if (/^rl\d*$/i.test(text) || /red\s*line/i.test(text)) return 'Red Line';
    if (/^dd/i.test(text)) return text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function kindFromName(name) {
    const text = safeString(name).toUpperCase();
    const compact = text.replace(/[^A-Z0-9]+/g, '');
    if (text.includes('BRZ') || text.includes('BEAR') || text.includes('BEA ZONE') || compact.includes('BEAZONE')) return 'zone-bear';
    if (text.includes('BZ') || text.includes('BULL')) return 'zone-bull';
    if (text.includes('CAT')) return 'cat';
    if (/\bYL\d*\b/.test(text) || text.includes('YELLOW LINE')) return 'yellow-line';
    if (/\bRL\d*\b/.test(text) || text.includes('RED LINE')) return 'red-line';
    if (text.includes('MHP')) return 'mhp';
    if (text.includes('HP')) return 'hp';
    if (text.includes('DD')) return 'dd-band';
    if (text.includes('OPEN') || text.includes('CLOSE') || text.includes('GAP')) return 'open-close';
    return 'reference';
  }

  function zoneSide(label) {
    const text = safeString(label).toUpperCase();
    const compact = text.replace(/[^A-Z0-9]+/g, '');
    if (text.includes('BEAR') || text.includes('BEA ZONE') || compact.includes('BEAZONE') || text.includes('BRZ') || text.includes('SUPPLY') || text.includes('SELL')) return 'bear';
    if (text.includes('BULL') || /\bBZ/.test(text) || text.includes('DEMAND') || text.includes('BUY')) return 'bull';
    return '';
  }

  function hpMhpFromColor(color) {
    const text = safeString(color);
    if (/aqua|cyan|0\s*,\s*255\s*,\s*255|#?00ffff/i.test(text)) return 'HP';
    if (/orange|255\s*,\s*152\s*,\s*0|#?ff9800/i.test(text)) return 'MHP';
    return '';
  }

  function manualLevelNameFromColor(color) {
    const rgb = colorRgb(color);
    if (!rgb) return '';
    if (isPurple(rgb)) return 'CAT';
    if (isYellow(rgb)) return 'Yellow Line';
    if (isRed(rgb)) return 'Red Line';
    return '';
  }

  function normalizeColor(value) {
    const rgb = colorRgb(value);
    if (!rgb) return safeString(value);
    return `#${hexByte(rgb.r)}${hexByte(rgb.g)}${hexByte(rgb.b)}`;
  }

  function colorRgb(value) {
    const raw = safeString(value).trim();
    const hex = raw.match(/^#?([0-9a-f]{6})$/i);
    if (hex) {
      const clean = hex[1];
      return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16)
      };
    }
    const rgb = raw.match(/rgba?\s*\(\s*([.\d]+)\s*,\s*([.\d]+)\s*,\s*([.\d]+)/i);
    if (rgb) {
      return {
        r: colorByte(rgb[1]),
        g: colorByte(rgb[2]),
        b: colorByte(rgb[3])
      };
    }
    const named = raw.toLowerCase();
    if (named === 'yellow') return { r: 255, g: 235, b: 59 };
    if (named === 'red') return { r: 242, g: 54, b: 69 };
    if (named === 'purple') return { r: 126, g: 87, b: 194 };
    return null;
  }

  function colorByte(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : 0;
  }

  function hexByte(value) {
    return colorByte(value).toString(16).padStart(2, '0');
  }

  function isYellow({ r, g, b }) {
    return r >= 220 && g >= 190 && b <= 140;
  }

  function isRed({ r, g, b }) {
    return r >= 200 && g <= 110 && b <= 130;
  }

  function isPurple({ r, g, b }) {
    return b >= 140 && r >= 80 && r > g && b > r;
  }

  function studyPlotNames(studyObject) {
    const names = [];
    try {
      const study = studyObject && studyObject._study;
      const meta = study && (typeof study.metaInfo === 'function' ? study.metaInfo() : study._metaInfo);
      const plots = safeArray(meta && meta.plots);
      const styles = plainObject(meta && meta.styles) ? meta.styles : {};
      for (const plot of plots) {
        const style = plot && plot.id && styles[plot.id] ? styles[plot.id] : {};
        names.push(safeString(style.title || style.name || plot.title || plot.name || plot.id));
      }
    } catch (_err) {}
    return names;
  }

  function futuresSymbol(value) {
    const text = safeString(value).toUpperCase();
    const parts = text.split(/[^A-Z0-9]+/).filter(Boolean);
    if (parts.some((part) => part === 'MNQ' || part === 'NQ' || part === 'ENQ' || /^M?NQ[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part) || /^ENQ[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part))) return 'MNQ';
    if (parts.some((part) => part === 'MES' || part === 'ES' || part === 'EP' || /^M?ES[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part) || /^EP[FGHJKMNQUVXZ](?:\d{1,2})?$/.test(part))) return 'MES';
    if ((/\bNASDAQ\b/.test(text) && !/[:/]/.test(text)) || /\bNQ[-\s]?100\b/.test(text)) return 'MNQ';
    if (/\bS\s*&\s*P\s*500\b/.test(text) || /\bS\s+AND\s+P\s+500\b/.test(text)) return 'MES';
    return '';
  }

  function chartDisplaySymbol(value) {
    const futures = futuresSymbol(value);
    if (futures) return futures;
    const text = safeString(value).trim().toUpperCase();
    if (!text) return '';
    const candidate = text.split(/[:/]/).filter(Boolean).pop() || '';
    return /^[A-Z][A-Z0-9.-]{0,14}$/.test(candidate) && candidate !== 'ALL' ? candidate : '';
  }

  function displayIndex(symbol) {
    const clean = chartDisplaySymbol(symbol);
    if (clean === 'MNQ') return 'NQ';
    if (clean === 'MES') return 'ES';
    return clean;
  }

  function chartCountFromWidget(widget) {
    try {
      return widget.chartsCount ? Math.max(1, Number(widget.chartsCount()) || 1) : 1;
    } catch (_err) {
      return 1;
    }
  }

  function safeChart(widget, index) {
    try {
      return widget.chart ? widget.chart(index) : null;
    } catch (_err) {
      return null;
    }
  }

  function call(target, method) {
    try {
      return target && typeof target[method] === 'function' ? target[method]() : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  function stableHash(snapshot) {
    const levelHash = snapshot.levels
      .map((level) => [level.symbol, level.name, Number(level.price).toFixed(2), level.kind].join(':'))
      .sort()
      .join('|');
    const statHash = Object.entries(snapshot.stats || {})
      .map(([symbol, values]) => [
        symbol,
        values.dd,
        values.riskInterval,
        values.resilience,
        values.monthlyResilience,
        values.weeklyResilience,
        values.mapCode
      ].join(':'))
      .sort()
      .join('|');
    return `${levelHash}#${statHash}`;
  }

  function snapshotHasStats(snapshot) {
    return Object.values(snapshot.stats || {}).some(hasStats);
  }

  function hasStats(values = {}) {
    return Boolean(values.mapCode) ||
      [values.dd, values.riskInterval, values.resilience, values.monthlyResilience, values.weeklyResilience].some((value) => value != null);
  }

  function firstFinite(...values) {
    for (const value of values) {
      const number = numberValue(value);
      if (number != null) return number;
    }
    return null;
  }

  function normalizeMapCode(value) {
    return safeString(value).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12);
  }

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function domArray(value) {
    try {
      return value ? Array.prototype.slice.call(value) : [];
    } catch (_err) {
      return [];
    }
  }

  function numberValue(value) {
    if (value == null || value === '') return null;
    const number = Number(typeof value === 'string' ? value.replace(/,/g, '') : value);
    return Number.isFinite(number) ? number : null;
  }

  function compact(value) {
    return safeString(value).replace(/\s+/g, ' ').trim();
  }

  function safeString(value) {
    return value == null ? '' : String(value);
  }

  publishDiagnostic('reader-installed');
  poll();
  timer = window.setInterval(poll, POLL_MS);
  window.addEventListener('beforeunload', () => {
    if (timer) window.clearInterval(timer);
  });
})();
