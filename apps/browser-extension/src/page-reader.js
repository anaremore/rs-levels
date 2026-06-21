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
    if (!snapshot.levels.length) {
      stats.skippedEmptyCount += 1;
      publishDiagnostic(snapshot.reader.chartCount ? 'reader-empty' : 'reader-waiting');
      return;
    }

    const hash = stableHash(snapshot.levels);
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
      chartLines: [],
      referenceLines: [],
      zoneRectangles: [],
      reader: {
        chartCount: 0,
        shapeCount: 0,
        studyCount: 0,
        levelCount: 0,
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
    try {
      const widget = globalThis.tvWidget;
      if (!widget) return state;
      const chartCount = chartCountFromWidget(widget);
      state.reader.chartCount = chartCount;
      for (let index = 0; index < chartCount; index += 1) {
        const chart = safeChart(widget, index);
        if (!chart) continue;
        const rawSymbol = safeString(call(chart, 'symbol'));
        const symbol = futuresSymbol(rawSymbol);
        if (!symbol) continue;
        readShapeLevels(chart, symbol, rawSymbol, state, seen);
        readStudyLevels(chart, symbol, rawSymbol, state, seen);
      }
    } catch (_err) {
      stats.readErrorCount += 1;
    }
    state.reader.levelCount = state.levels.length;
    state.reader.chartLineCount = state.chartLines.length;
    state.reader.referenceLineCount = state.referenceLines.length;
    state.reader.zoneRectangleCount = state.zoneRectangles.length;
    return state;
  }

  function readShapeLevels(chart, symbol, rawSymbol, state, seen) {
    const shapes = safeArray(call(chart, 'getAllShapes'));
    state.reader.shapeCount += shapes.length;
    const zoneCounts = { bull: 0, bear: 0 };
    const index = futuresIndex(symbol);

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

        if (side && prices.length >= 2) {
          zoneCounts[side] += 1;
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
    const index = futuresIndex(symbol);
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
    return safeString(props && (props.linecolor || props.color || props.textcolor || props.backgroundColor));
  }

  function levelNameFromLabel(label, color) {
    const text = compact(label);
    const direct = text.match(/\b(OVNMHP|OVNHP|MHP|HP|man_MHP|man_HP|PrevDayClose|LastOpen|MidGap|HalfGap|HG|DD(?:\s*(?:Upper|Lower))?|Bull\s*Zone|Bear\s*Zone|BZT\d*|BZB\d*|BrZT\d*|BrZB\d*)\b/i);
    if (direct) return normalizeName(direct[1]);
    if (/\bOpen\b[^\d-]*-?[\d,]+(?:\.\d+)?/i.test(text) && !/\bClose\b/i.test(text)) return 'Open';
    if (/\bClose\b[^\d-]*-?[\d,]+(?:\.\d+)?/i.test(text) && !/Prev\s*Close|PrevDayClose/i.test(text)) return 'Close';
    const priced = text.match(/\b(Bull\s*Zone|Bear\s*Zone|MHP|HP|DD|Open|Close|Half\s*Gap|HG)\s*:?\s*-?[\d,]+(?:\.\d+)?/i);
    if (priced) return normalizeName(priced[1]);
    if (/Liquidity|liq-map-history/i.test(text)) {
      const byColor = hpMhpFromColor(color);
      if (byColor) return byColor;
    }
    return '';
  }

  function normalizeName(value) {
    const text = compact(value);
    if (/^man_mhp$/i.test(text)) return 'man_MHP';
    if (/^man_hp$/i.test(text)) return 'man_HP';
    if (/^mhp$/i.test(text)) return 'MHP';
    if (/^hp$/i.test(text)) return 'HP';
    if (/^hg$/i.test(text) || /half\s*gap/i.test(text)) return 'MidGap';
    if (/bull\s*zone/i.test(text)) return 'Bull Zone';
    if (/bear\s*zone/i.test(text)) return 'Bear Zone';
    if (/^dd/i.test(text)) return text.replace(/\s+/g, ' ').trim();
    return text;
  }

  function kindFromName(name) {
    const text = safeString(name).toUpperCase();
    if (text.includes('BRZ') || text.includes('BEAR')) return 'zone-bear';
    if (text.includes('BZ') || text.includes('BULL')) return 'zone-bull';
    if (text.includes('MHP')) return 'mhp';
    if (text.includes('HP')) return 'hp';
    if (text.includes('DD')) return 'dd-band';
    if (text.includes('OPEN') || text.includes('CLOSE') || text.includes('GAP')) return 'open-close';
    return 'reference';
  }

  function zoneSide(label) {
    const text = safeString(label).toUpperCase();
    if (text.includes('BEAR') || text.includes('BRZ') || text.includes('SUPPLY') || text.includes('SELL')) return 'bear';
    if (text.includes('BULL') || /\bBZ/.test(text) || text.includes('DEMAND') || text.includes('BUY')) return 'bull';
    return '';
  }

  function hpMhpFromColor(color) {
    const text = safeString(color);
    if (/aqua|cyan|0\s*,\s*255\s*,\s*255|#?00ffff/i.test(text)) return 'HP';
    if (/orange|255\s*,\s*152\s*,\s*0|#?ff9800/i.test(text)) return 'MHP';
    return '';
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
    if (/\bNASDAQ\b/.test(text) || /\bNQ[-\s]?100\b/.test(text)) return 'MNQ';
    if (/\bS\s*&\s*P\s*500\b/.test(text) || /\bS\s+AND\s+P\s+500\b/.test(text)) return 'MES';
    return '';
  }

  function futuresIndex(symbol) {
    return safeString(symbol).toUpperCase() === 'MNQ' ? 'NQ' : 'ES';
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

  function stableHash(levels) {
    return levels
      .map((level) => [level.symbol, level.name, Number(level.price).toFixed(2), level.kind].join(':'))
      .sort()
      .join('|');
  }

  function plainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function numberValue(value) {
    const number = Number(value);
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
