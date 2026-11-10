import { loadConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createStatsHistory } from './stats-history.js';
import { createSeriesLive } from './series-live.js';
import { createLevelStore } from './store.js';

export function createService(options = {}) {
  const config = loadConfig(options.env || process.env, options.config || {}, options.savedConfig ?? {});
  const history = options.history || createStatsHistory({
    dataDir: config.dataDir,
    retentionDays: config.historyRetentionDays,
    maxBytes: config.historyMaxBytes,
    clock: options.clock
  });
  // Each bar's last value goes to history when its minute ends.
  const live = createSeriesLive({ clock: options.clock, onClosed: history.recordSeries });
  const store = options.store || createLevelStore({
    staleMs: config.staleMs,
    clock: options.clock,
    onStats: history.record,
    onSeries: history.recordSeries,
    onLiveSeries: live.accept
  });
  const app = createHttpApp({ store, config, history, live, onCapture: options.onCapture });
  return {
    config,
    store,
    history,
    live,
    server: app.server,
    clients: app.clients
  };
}

export function listen(service) {
  return new Promise((resolve, reject) => {
    service.server.once('error', reject);
    service.server.listen(service.config.port, service.config.host, () => {
      service.server.off('error', reject);
      resolve(service.server.address());
    });
  });
}
