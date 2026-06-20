import { loadConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createLevelStore } from './store.js';

export function createService(options = {}) {
  const config = loadConfig(options.env || process.env, options.config || {});
  const store = options.store || createLevelStore({ staleMs: config.staleMs });
  const app = createHttpApp({ store, config });
  return {
    config,
    store,
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
