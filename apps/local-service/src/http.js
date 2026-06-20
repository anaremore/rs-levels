import http from 'node:http';
import { URL } from 'node:url';
import { createTradingViewJsonExport, createTradingViewPayload } from '../../../packages/exporters/src/index.js';
import { normalizeSymbol } from '../../../packages/schemas/src/index.js';
import { networkStatus } from './config.js';
import { levelsToSierraText } from './sierra-format.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function createHttpApp({ store, config }) {
  const clients = new Set();

  const server = http.createServer(async (req, res) => {
    try {
      setCommonHeaders(req, res, config);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';

      if (req.method === 'GET' && pathname === '/') return sendJson(res, 200, rootInfo(config));
      if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, health(store, config));
      if (req.method === 'GET' && pathname === '/status') return sendJson(res, 200, status(store, config));
      if (req.method === 'GET' && pathname === '/snapshot') return sendJson(res, 200, store.getSnapshot());
      if (req.method === 'GET' && pathname === '/levels') return sendJson(res, 200, { levels: store.flatLevels() });
      if (req.method === 'GET' && pathname === '/ddbands') return sendJson(res, 200, { levels: store.flatLevels().filter((level) => level.kind === 'dd-band') });
      if (req.method === 'GET' && pathname === '/references') return sendJson(res, 200, { levels: store.flatLevels().filter((level) => ['reference', 'open-close', 'hp', 'mhp'].includes(level.kind)) });
      if (req.method === 'GET' && pathname === '/stream') return streamSnapshots(req, res, clients, store);

      const tradingViewMatch = pathname.match(/^\/tradingview\/([^/]+)$/);
      if (req.method === 'GET' && tradingViewMatch) {
        const symbol = normalizeSymbol(tradingViewMatch[1]);
        const row = store.getSnapshot().symbols[symbol] || null;
        if (!row) return sendJson(res, 404, { ok: false, error: 'symbol not found' });
        if (url.searchParams.get('format') === 'json') {
          return sendJson(res, 200, createTradingViewJsonExport(row));
        }
        return sendText(res, 200, createTradingViewPayload(row), 'text/plain; charset=utf-8');
      }

      const symbolMatch = pathname.match(/^\/levels\/([^/]+)$/);
      if (req.method === 'GET' && symbolMatch) {
        const symbol = normalizeSymbol(symbolMatch[1]);
        const row = store.getSnapshot().symbols[symbol] || null;
        if (url.searchParams.get('format') === 'sierra') {
          return sendText(res, 200, levelsToSierraText(row ? row.levels : []), 'text/plain; charset=utf-8');
        }
        return sendJson(res, row ? 200 : 404, row || { ok: false, error: 'symbol not found' });
      }

      if (req.method === 'POST' && pathname === '/capture/api') {
        const payload = await readJson(req);
        const snapshot = store.applyCapture(payload);
        broadcast(clients, 'snapshot', snapshot);
        return sendJson(res, 200, { ok: true, snapshot });
      }

      sendJson(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      sendJson(res, err.statusCode || 500, { ok: false, error: err.message || 'server error' });
    }
  });

  return { server, clients };
}

export function rootInfo(config) {
  return {
    ok: true,
    name: 'RS Levels local service',
    endpoints: ['/health', '/status', '/snapshot', '/levels', '/tradingview/:symbol', '/stream'],
    network: networkStatus(config)
  };
}

export function health(store, config) {
  const snapshot = store.getSnapshot();
  return {
    ok: true,
    service: 'rs-levels',
    schemaVersion: snapshot.schemaVersion,
    generatedAt: new Date().toISOString(),
    network: networkStatus(config),
    source: snapshot.source,
    symbolCount: Object.keys(snapshot.symbols).length,
    levelCount: store.flatLevels().length
  };
}

export function status(store, config) {
  return {
    ok: true,
    network: networkStatus(config),
    source: store.getSnapshot().source,
    symbols: Object.keys(store.getSnapshot().symbols)
  };
}

function streamSnapshots(req, res, clients, store) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  const client = { res };
  clients.add(client);
  sendSse(res, 'snapshot', store.getSnapshot());
  req.on('close', () => clients.delete(client));
}

function broadcast(clients, event, data) {
  clients.forEach((client) => sendSse(client.res, event, data));
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function setCommonHeaders(req, res, config) {
  const allowedOrigin = corsAllowedOrigin(req.headers.origin, config.corsOrigins || []);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function corsAllowedOrigin(origin, allowedOrigins) {
  const value = String(origin || '').trim();
  if (!value) return '';
  if (allowedOrigins.includes(value)) return value;
  if (allowedOrigins.includes('http://127.0.0.1:*') && loopbackOriginWithPort(value, '127.0.0.1')) return value;
  if (allowedOrigins.includes('http://localhost:*') && loopbackOriginWithPort(value, 'localhost')) return value;
  if (allowedOrigins.includes('http://[::1]:*') && loopbackOriginWithPort(value, '[::1]')) return value;
  if (value.startsWith('chrome-extension://') && allowedOrigins.includes('chrome-extension://*')) return value;
  if (value.startsWith('moz-extension://') && allowedOrigins.includes('moz-extension://*')) return value;
  return '';
}

function loopbackOriginWithPort(origin, host) {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === `${host}:${url.port}` && Boolean(url.port);
  } catch (_err) {
    return false;
  }
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value, null, 2));
}

function sendText(res, statusCode, value, contentType) {
  res.writeHead(statusCode, { 'Content-Type': contentType });
  res.end(value);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('request body too large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        err.statusCode = 400;
        reject(err);
      }
    });
  });
}