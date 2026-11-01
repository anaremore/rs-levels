// ==UserScript==
// @name         Rocket Scooter NQ/ES Restore
// @namespace    local.rocket-scooter-fix
// @version      1.5.0
// @description  Automatically restores NQ, ES, QQQ, and SPY to the intended four-pane Rocket Scooter layout.
// @match        https://rocket.place/pro-plus*
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// @downloadURL  none
// @updateURL    none
// ==/UserScript==

(() => {
  "use strict";

  const QUARTERLY_CONTRACTS = Object.freeze([
    Object.freeze({ month: 2, code: "H" }),
    Object.freeze({ month: 5, code: "M" }),
    Object.freeze({ month: 8, code: "U" }),
    Object.freeze({ month: 11, code: "Z" }),
  ]);

  function thirdFridayUtc(year, month) {
    const date = new Date(Date.UTC(year, month, 1));

    while (date.getUTCDay() !== 5) {
      date.setUTCDate(date.getUTCDate() + 1);
    }

    date.setUTCDate(date.getUTCDate() + 14);
    return date;
  }

  function quarterlyRollDateUtc(year, contractMonth) {
    if (!QUARTERLY_CONTRACTS.some(({ month }) => month === contractMonth)) {
      throw new RangeError(`Month ${contractMonth} is not a quarterly contract month.`);
    }

    const rollDate = thirdFridayUtc(year, contractMonth);

    // CME's customary U.S. equity-index roll date is the Monday before the
    // third Friday. Calculating it keeps the script valid without a dated
    // rollover table, including years when expiration itself is a holiday.
    rollDate.setUTCDate(rollDate.getUTCDate() - 4);
    return rollDate;
  }

  function currentContractSuffix(now = new Date()) {
    let contractYear = now.getUTCFullYear();
    let contractIndex = Math.floor(now.getUTCMonth() / 3);
    const expiringContract = QUARTERLY_CONTRACTS[contractIndex];
    const rollDate = quarterlyRollDateUtc(contractYear, expiringContract.month);

    // From the roll date onward, advance H -> M -> U -> Z -> H. The final
    // transition also advances the year (for example, Z26 -> H27).
    if (now >= rollDate) {
      contractIndex += 1;

      if (contractIndex === QUARTERLY_CONTRACTS.length) {
        contractIndex = 0;
        contractYear += 1;
      }
    }

    const monthCode = QUARTERLY_CONTRACTS[contractIndex].code;
    const twoDigitYear = String(contractYear).slice(-2);
    return `${monthCode}${twoDigitYear}`;
  }

  // Allow the date logic to be verified with Node without starting the
  // browser-only userscript.
  if (typeof unsafeWindow === "undefined") {
    if (typeof module !== "undefined") {
      module.exports = {
        currentContractSuffix,
        quarterlyRollDateUtc,
        thirdFridayUtc,
      };
    }

    return;
  }

  const page = unsafeWindow;
  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function waitForWidget() {
    const deadline = Date.now() + 60_000;

    while (Date.now() < deadline) {
      const widget = page.tvWidget;

      if (
        widget &&
        widget._ready &&
        typeof widget.chartsCount === "function" &&
        widget.chartsCount() >= 4
      ) {
        return widget;
      }

      await sleep(250);
    }

    throw new Error("Rocket's four-chart widget did not become ready within 60 seconds.");
  }

  async function setPaneSymbol(widget, paneIndex, symbol) {
    const chart = widget.chart(paneIndex);

    if (!chart || typeof chart.symbol !== "function") {
      throw new Error(`Pane ${paneIndex + 1} is unavailable.`);
    }

    if (chart.symbol() === symbol) {
      return;
    }

    if (typeof chart.setSymbol !== "function") {
      throw new Error(`Pane ${paneIndex + 1} does not expose setSymbol().`);
    }

    console.info(
      `[Rocket NQ/ES Restore] Pane ${paneIndex + 1}:`,
      chart.symbol(),
      "->",
      symbol,
    );

    const changed = await Promise.resolve(chart.setSymbol(symbol));

    if (changed === false) {
      throw new Error(`Pane ${paneIndex + 1} rejected symbol ${symbol}.`);
    }

    await waitForPaneSymbol(widget, paneIndex, symbol);
  }

  async function waitForPaneSymbol(widget, paneIndex, symbol, timeout = 10_000) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const chart = widget.chart(paneIndex);

      if (chart && typeof chart.symbol === "function" && chart.symbol() === symbol) {
        return;
      }

      await sleep(100);
    }

    throw new Error(`Pane ${paneIndex + 1} did not finish loading ${symbol}.`);
  }

  async function activatePane(widget, paneIndex) {
    if (typeof widget.setActiveChart === "function") {
      widget.setActiveChart(paneIndex);
      await sleep(300);
    }

    if (
      typeof widget.activeChartIndex === "function" &&
      widget.activeChartIndex() !== paneIndex
    ) {
      throw new Error(`Could not activate pane ${paneIndex + 1}.`);
    }

    return typeof widget.activeChart === "function"
      ? widget.activeChart()
      : widget.chart(paneIndex);
  }

  async function setPaneResolution(widget, paneIndex, resolution) {
    const chart = widget.chart(paneIndex);

    if (!chart || typeof chart.resolution !== "function") {
      throw new Error(`Pane ${paneIndex + 1} is unavailable.`);
    }

    if (chart.resolution() === resolution) {
      return;
    }

    if (typeof chart.setResolution !== "function") {
      throw new Error(`Pane ${paneIndex + 1} does not expose setResolution().`);
    }

    console.info(
      `[Rocket NQ/ES Restore] Pane ${paneIndex + 1} interval:`,
      chart.resolution(),
      "->",
      resolution,
    );

    await Promise.resolve(chart.setResolution(resolution));
  }

  async function reloadUpperRightEs(widget, symbol) {
    const paneIndex = 2;
    let chart = await activatePane(widget, paneIndex);

    if (!chart || typeof chart.symbol !== "function") {
      throw new Error("Upper-right pane is unavailable.");
    }

    if (typeof chart.setSymbol !== "function") {
      throw new Error("Upper-right pane does not expose setSymbol().");
    }

    // Rocket rebuilds its custom levels for the active chart. Always perform a
    // real symbol-change cycle here, after the upper-left NQ chart has settled.
    console.info(
      "[Rocket NQ/ES Restore] Upper-right: forcing SPY -> ES level reload.",
    );

    let changed = await Promise.resolve(chart.setSymbol("SPY"));

    if (changed === false) {
      throw new Error("Upper-right pane rejected the SPY toggle.");
    }

    await waitForPaneSymbol(widget, paneIndex, "SPY");
    await sleep(750);

    // Reassert the active pane before the important half of the toggle so
    // Rocket's activeChart subscription handles the ES change itself.
    chart = await activatePane(widget, paneIndex);
    changed = await Promise.resolve(chart.setSymbol(symbol));

    if (changed === false) {
      throw new Error(`Upper-right pane rejected symbol ${symbol}.`);
    }

    await waitForPaneSymbol(widget, paneIndex, symbol);
    await sleep(1_500);
  }

  async function restoreLayout(widget, forceUpperRightReload = false) {
    const suffix = currentContractSuffix();

    // Rocket numbers this four-chart layout column-first:
    //   0 = upper-left, 1 = lower-left,
    //   2 = upper-right, 3 = lower-right.
    // Make every pane explicit so a previous bad autosave cannot persist.
    await activatePane(widget, 0);
    await setPaneSymbol(widget, 0, `F.US.ENQ${suffix}`);
    await waitForPaneSymbol(widget, 0, `F.US.ENQ${suffix}`);

    if (forceUpperRightReload) {
      // Give Rocket time to finish rebuilding NQ before activating and
      // toggling the upper-right pane.
      await sleep(1_500);
      await reloadUpperRightEs(widget, `F.US.EP${suffix}`);
    } else {
      await setPaneSymbol(widget, 2, `F.US.EP${suffix}`);
    }

    await sleep(500);
    await setPaneSymbol(widget, 1, "QQQ");
    await setPaneResolution(widget, 1, "1D");
    await sleep(500);
    await setPaneSymbol(widget, 3, "SPY");
    await setPaneResolution(widget, 3, "1D");
  }

  async function start() {
    const widget = await waitForWidget();

    // Let Rocket apply its saved layout once, then run the important sequence
    // step by step: upper-left NQ first, upper-right SPY -> ES second.
    await sleep(1_500);

    try {
      await restoreLayout(widget, true);
    } catch (error) {
      console.warn("[Rocket NQ/ES Restore] Initial restore failed:", error);
    }

    // Rocket can still reapply its saved window symbol shortly afterward.
    // Recheck without repeating the visible toggle, then leave later manual
    // symbol changes alone.
    const startupCheckDelays = [2_000, 4_000, 8_000];

    for (const delay of startupCheckDelays) {
      await sleep(delay);

      try {
        await restoreLayout(widget, false);
      } catch (error) {
        console.warn("[Rocket NQ/ES Restore] Startup check failed:", error);
      }
    }
  }

  start().catch((error) => {
    console.warn("[Rocket NQ/ES Restore]", error);
  });
})();
