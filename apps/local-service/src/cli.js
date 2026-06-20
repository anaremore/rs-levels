#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createService, listen } from './index.js';

const PACKAGE_JSON = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

if (args.has('--version') || args.has('-v')) {
  console.log(String(PACKAGE_JSON.version || '0.0.0'));
  process.exit(0);
}

const service = createService();
const address = await listen(service);
const host = typeof address === 'object' && address ? address.address : service.config.host;
const port = typeof address === 'object' && address ? address.port : service.config.port;

console.log('RS Levels local service');
console.log(`API: http://${host}:${port}`);
console.log('Status: waiting for browser capture');
service.config.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function shutdown(code) {
  service.server.close(() => process.exit(code));
}

function printHelp() {
  console.log(`RS Levels local service

Usage:
  node apps/local-service/src/cli.js [--help] [--version]

Environment:
  RS_LEVELS_HOST           Host to bind, default 127.0.0.1
  RS_LEVELS_PORT           Port to bind, default 8765
  RS_LEVELS_ALLOW_REMOTE   Set to 1 only on trusted private networks
  RS_LEVELS_CORS_ORIGINS   Additional comma-separated CORS origins
  RS_LEVELS_STALE_MS       Source stale threshold in milliseconds, default 82800000
`);
}
