import { loadConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createStatsHistory } from './stats-history.js';
import { SERIES_BAR_MS, createSeriesLive } from './series-live.js';
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
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
  // A minute read carries the forming bar too: that one is live only (it reaches history when
  // its minute ends); the closed bars go to history as they come.
  const onSeries = (symbol, points) => {
    const nowMs = new Date(clock()).getTime();
    const forming = (point) => Date.parse(point?.t) + SERIES_BAR_MS > nowMs;
    const closed = points.filter((point) => !forming(point));
    const open = points.filter(forming);
    // The fast path keeps a held forming bar current: a minute read's (older) value for it
    // would only take that back.
    const fresh = open.filter((point) => !live.holds(symbol, point.t));
    if (fresh.length) live.accept(symbol, fresh);
    return closed.length ? history.recordSeries(symbol, closed) : 0;
  };
  const store = options.store || createLevelStore({
    staleMs: config.staleMs,
    clock: options.clock,
    onStats: history.record,
    onSeries,
    onLiveSeries: live.accept
  });
  const app = createHttpApp({ store, config, history, live, onCapture: options.onCapture });
  // A bar whose minute ended reaches history even with no post after it (a closed tab).
  const settleTimer = setInterval(live.settleAll, 5000);
  settleTimer.unref?.();
  app.server.on('close', () => clearInterval(settleTimer));
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
