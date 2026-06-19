#!/usr/bin/env node
import { createService, listen } from './index.js';

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

