// ==UserScript==
// @name         Rocket Scooter Backup
// @namespace    local.rocket-scooter-fix
// @version      1.0.0
// @description  Saves Rocket Scooter layouts, chart settings, and watchlist to a JSON file and restores them from it.
// @match        https://rocket.place/pro-plus*
// @grant        none
// @run-at       document-start
// @noframes
// @downloadURL  none
// @updateURL    none
// ==/UserScript==

(() => {
  "use strict";

  const BACKUP_FORMAT = "rocket-scooter-backup";
  const BACKUP_VERSION = 1;
  const PENDING_RESTORE_KEY = "rs-backup-pending-restore";
  const RELOAD_DELAY = 500;

  const EMAIL_KEY = "email";
  const SETTINGS_KEY = "rocket_scooter_settings";

  // Rocket stores these per user as { [email]: value }. The backup keeps only
  // the value, so the file holds no email and restores under the current user.
  const USER_SCOPED_KEYS = Object.freeze([
    "rocket_scooter_chart_layouts",
    "rocket_scooter_drawing_templates",
    "rocket_scooter_study_templates",
  ]);

  // Only keys named here are ever read or written. Everything else in
  // localStorage, including sign-in data, stays out of the file, and a file
  // cannot write to any other key.
  const PLAIN_KEYS = Object.freeze([
    "RSWatchList",
    "RS_Window_Layouts",
    "RemovedRiskIntervalTickers",
    "watchList.colfilter",
    "events.eventsFilter",
    "events.stocksFilter",
    "output-table-width",
    "chart_auto_save",
    "auto_scaling",
  ]);

  // Broker panel state shares the settings entry but is not part of the backup.
  const isBrokerSetting = (name) => /^trading\./i.test(name);

  function parseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  // Values are stored parsed so the file stays readable. Plain text and
  // JSON-encoded strings stay raw so they restore byte for byte.
  function toBackupValue(raw) {
    const parsed = parseJson(raw);
    return parsed === undefined || typeof parsed === "string" ? raw : parsed;
  }

  function toStoredValue(value) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  function filterSettings(settings, keep) {
    return Object.fromEntries(Object.entries(settings).filter(([name]) => keep(name)));
  }

  function createBackup(storage, now = new Date()) {
    const items = {};

    for (const key of PLAIN_KEYS) {
      const raw = storage.getItem(key);

      if (raw !== null) {
        items[key] = toBackupValue(raw);
      }
    }

    const settings = parseJson(storage.getItem(SETTINGS_KEY));

    if (settings) {
      items[SETTINGS_KEY] = filterSettings(settings, (name) => !isBrokerSetting(name));
    }

    const email = storage.getItem(EMAIL_KEY);

    for (const key of USER_SCOPED_KEYS) {
      const value = parseJson(storage.getItem(key))?.[email];

      if (value !== undefined) {
        items[key] = value;
      }
    }

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      savedAt: now.toISOString(),
      items,
    };
  }

  function readBackup(text) {
    const backup = parseJson(text);

    if (backup?.format !== BACKUP_FORMAT || typeof backup.items !== "object" || !backup.items) {
      throw new Error("This is not a Rocket Scooter backup file.");
    }

    if (backup.version !== BACKUP_VERSION) {
      throw new Error(`Backup version ${backup.version} is not supported.`);
    }

    return backup;
  }

  // Keys missing from the file are left alone, so a file trimmed by hand to
  // just the watchlist restores just the watchlist.
  function applyBackup(storage, backup) {
    const { items } = backup;
    const email = storage.getItem(EMAIL_KEY);

    for (const key of PLAIN_KEYS) {
      if (Object.hasOwn(items, key)) {
        storage.setItem(key, toStoredValue(items[key]));
      }
    }

    if (Object.hasOwn(items, SETTINGS_KEY)) {
      const current = parseJson(storage.getItem(SETTINGS_KEY)) ?? {};

      storage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          ...filterSettings(current, isBrokerSetting),
          ...filterSettings(items[SETTINGS_KEY], (name) => !isBrokerSetting(name)),
        }),
      );
    }

    for (const key of USER_SCOPED_KEYS) {
      if (Object.hasOwn(items, key)) {
        if (!email) {
          throw new Error("Sign in to Rocket Scooter before restoring layouts.");
        }

        const current = parseJson(storage.getItem(key)) ?? {};
        storage.setItem(key, JSON.stringify({ ...current, [email]: items[key] }));
      }
    }
  }

  function describeBackup(backup) {
    const { items, savedAt } = backup;
    const layouts = items.rocket_scooter_chart_layouts?.length ?? 0;
    const symbols = items.RSWatchList?.length ?? 0;
    return `Saved ${savedAt}\n${layouts} chart layout(s), ${symbols} watchlist symbol(s)`;
  }

  // Allow the backup logic to be verified with Node without starting the
  // browser-only userscript.
  if (typeof window === "undefined") {
    if (typeof module !== "undefined") {
      module.exports = {
        applyBackup,
        createBackup,
        describeBackup,
        readBackup,
      };
    }

    return;
  }

  function downloadBackup(label) {
    const backup = createBackup(localStorage);
    const date = backup.savedAt.slice(0, 10);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = `rocket-scooter-backup-${label}${date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function restoreFromFile(file) {
    const text = await file.text();
    const backup = readBackup(text);

    if (!localStorage.getItem(EMAIL_KEY)) {
      throw new Error("Sign in to Rocket Scooter before restoring.");
    }

    const replace = confirm(
      `Replace your current Rocket Scooter setup with this backup?\n\n${describeBackup(backup)}\n\n` +
        "Your current setup is downloaded first, then the page reloads.",
    );

    if (!replace) {
      return;
    }

    downloadBackup("pre-restore-");

    // Rocket autosaves layouts while it runs, so the values are applied on the
    // next load, before its code starts, where nothing can overwrite them.
    sessionStorage.setItem(PENDING_RESTORE_KEY, text);
    setTimeout(() => location.reload(), RELOAD_DELAY);
  }

  function applyPendingRestore() {
    const pending = sessionStorage.getItem(PENDING_RESTORE_KEY);

    if (!pending) {
      return;
    }

    sessionStorage.removeItem(PENDING_RESTORE_KEY);

    try {
      applyBackup(localStorage, readBackup(pending));
      console.info("[Rocket Backup] Restored backup.");
    } catch (error) {
      console.warn("[Rocket Backup] Restore failed:", error);
    }
  }

  function headerButton(text, title, onClick) {
    const button = document.createElement("button");

    button.textContent = text;
    button.title = title;
    button.style.cssText =
      "background: none; border: 1px solid #434651; border-radius: 4px; color: #d1d4dc;" +
      "cursor: pointer; font: 600 11px/18px sans-serif; padding: 0 8px;";
    button.addEventListener("click", onClick);
    return button;
  }

  function addButtons() {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files;
      input.value = "";

      if (file) {
        restoreFromFile(file).catch((error) => {
          alert(`Backup was not restored.\n\n${error.message}`);
        });
      }
    });

    // Fixed over the empty part of Rocket's header, so nothing here depends on
    // the page's own markup.
    const container = document.createElement("div");
    container.style.cssText =
      "position: fixed; top: 14px; right: 240px; z-index: 1000; display: flex; gap: 6px;";
    container.append(
      headerButton("Backup", "Download layouts, chart settings, and watchlist", () =>
        downloadBackup(""),
      ),
      headerButton("Restore", "Restore from a downloaded backup file", () => input.click()),
      input,
    );
    document.body.append(container);
  }

  applyPendingRestore();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addButtons);
  } else {
    addButtons();
  }
})();
