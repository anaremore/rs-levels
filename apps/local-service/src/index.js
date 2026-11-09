import { loadConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createStatsHistory } from './stats-history.js';
import { createLevelStore } from './store.js';

export function createService(options = {}) {
  const config = loadConfig(options.env || process.env, options.config || {}, options.savedConfig ?? {});
  const history = options.history || createStatsHistory({
    dataDir: config.dataDir,
    retentionDays: config.historyRetentionDays,
    maxBytes: config.historyMaxBytes,
    clock: options.clock
  });
  const store = options.store || createLevelStore({
    staleMs: config.staleMs,
    clock: options.clock,
    onStats: history.record,
    onSeries: history.recordSeries
  });
  const app = createHttpApp({ store, config, history, onCapture: options.onCapture });
  return {
    config,
    store,
    history,
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
