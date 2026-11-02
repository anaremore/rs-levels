// ==UserScript==
// @name         Rocket Scooter RI Label
// @namespace    local.rocket-scooter-fix
// @version      1.0.1
// @description  Shows each futures pane's Risk Interval (RI) in its chart legend, read from the RI/DD table.
// @match        https://rocket.place/pro-plus*
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// @downloadURL  none
// @updateURL    none
// ==/UserScript==

(() => {
  "use strict";

  const LABEL_CLASS = "rs-ri-label";
  const LABEL_STYLE =
    'font: 600 13px/20px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif;' +
    "color: #d1d4dc; padding: 0 4px; width: fit-content; border-radius: 3px;" +
    "background: rgba(19, 23, 34, 0.7);";
  const REFRESH_INTERVAL = 1_000;

  const cellText = (cell) => cell.textContent.trim();

  // Rocket keeps this table in the page while the RI/DD tab is hidden, so the
  // tab never has to be opened for the values to be available.
  function riskIntervalsByTicker(doc) {
    const intervals = new Map();
    const table = doc.querySelector(".risk-interval-table table");

    if (!table) {
      return intervals;
    }

    const headers = Array.from(table.querySelectorAll("th"), cellText);
    const tickerColumn = headers.indexOf("Ticker");
    const riColumn = headers.indexOf("RI");

    if (tickerColumn < 0 || riColumn < 0) {
      return intervals;
    }

    for (const row of table.querySelectorAll("tbody tr")) {
      const cells = Array.from(row.children, cellText);

      if (/^\d[\d,]*(\.\d+)?$/.test(cells[riColumn] ?? "")) {
        intervals.set(cells[tickerColumn], cells[riColumn]);
      }
    }

    return intervals;
  }

  function renderLabel(doc, legend, riskInterval) {
    let label = legend.querySelector(`.${LABEL_CLASS}`);

    if (!riskInterval) {
      label?.remove();
      return;
    }

    if (!label) {
      label = doc.createElement("div");
      label.className = LABEL_CLASS;
      label.style.cssText = LABEL_STYLE;

      // Directly below the symbol and OHLC rows, above the study list.
      legend.insertBefore(label, legend.children[1] ?? null);
    }

    const text = `RI ${riskInterval}`;

    if (label.textContent !== text) {
      label.textContent = text;
    }
  }

  // Each pane's ticker comes from the chart API because the legend title turns
  // into a product description once market data loads. Chart containers line up
  // with chart indexes; a count mismatch skips the update rather than risk
  // showing a value on the wrong pane. Panes without a table row get no label.
  // The label is page-only: unlike a chart shape, it cannot reach Rocket's
  // saved layout.
  function refreshLabels(page) {
    const widget = page.tvWidget;
    const chartDocument = page.document.querySelector(
      'iframe[id^="tradingview_"]',
    )?.contentDocument;

    if (!chartDocument || !widget?._ready || typeof widget.chartsCount !== "function") {
      return;
    }

    const containers = chartDocument.querySelectorAll(".chart-container");

    if (containers.length !== widget.chartsCount()) {
      return;
    }

    const intervals = riskIntervalsByTicker(page.document);

    containers.forEach((container, paneIndex) => {
      const legend = container.querySelector('[data-name="legend"]');

      if (legend) {
        renderLabel(chartDocument, legend, intervals.get(widget.chart(paneIndex).symbol()));
      }
    });
  }

  // Allow the table and label logic to be verified with Node without starting
  // the browser-only userscript.
  if (typeof unsafeWindow === "undefined") {
    if (typeof module !== "undefined") {
      module.exports = {
        refreshLabels,
        riskIntervalsByTicker,
      };
    }

    return;
  }

  setInterval(() => refreshLabels(unsafeWindow), REFRESH_INTERVAL);
})();
