#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createService, listen } from './index.js';
import { createCaptureReporter } from './cli-output.js';
import { loadConfigFile } from './config-file.js';

const PACKAGE_JSON = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const argv = process.argv.slice(2);
const args = new Set(argv);

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

if (args.has('--version') || args.has('-v')) {
  console.log(String(PACKAGE_JSON.version || '0.0.0'));
  process.exit(0);
}

let captureReporter;
let service;
try {
  const configPath = parseConfigPath(argv);
  const savedConfig = configPath === undefined ? {} : loadConfigFile(configPath);
  captureReporter = createCaptureReporter();
  service = createService({ savedConfig, onCapture: captureReporter.report });
  const address = await listen(service);
  const host = typeof address === 'object' && address ? address.address : service.config.host;
  const port = typeof address === 'object' && address ? address.port : service.config.port;
  const urlHost = host.includes(':') ? `[${host}]` : host;

  console.log('RS Levels local service');
  console.log(`API: http://${urlHost}:${port}`);
  console.log('Ready. Waiting for first browser capture...');
  service.config.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
} catch (error) {
  captureReporter?.close();
  console.error(startupError(error));
  process.exitCode = 1;
}

function parseConfigPath(argv) {
  let configPath;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--config' && !arg.startsWith('--config=')) {
      throw new Error('Usage error: unknown argument; use --help for supported options.');
    }
    if (configPath !== undefined) throw new Error('Usage error: --config may only be supplied once.');
    const value = arg === '--config' ? argv[++index] : arg.slice('--config='.length);
    if (!value || !value.trim() || (arg === '--config' && value.startsWith('-'))) {
      throw new Error('Usage error: --config requires a file path.');
    }
    configPath = value;
  }
  return configPath;
}

function startupError(error) {
  if (/^(Configuration|Usage) error:/.test(error.message || '')) return error.message;
  if (error.code === 'EADDRINUSE') return 'Startup error: port is already in use; stop the other service or choose a different port.';
  if (error.code === 'EADDRNOTAVAIL') return 'Startup error: requested host is not available on this machine; choose a local interface address.';
  if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') return 'Startup error: requested host could not be resolved; check the bind hostname.';
  if (error.code === 'EACCES' || error.code === 'EPERM') return 'Startup error: permission denied while binding; check the host, port, and operating-system permissions.';
  return 'Startup error: service could not start; check the configuration and local networking.';
}

function shutdown(code) {
  captureReporter.close();
  service.server.close(() => process.exit(code));
}

function printHelp() {
  console.log(`RS Levels local service

Usage:
  node apps/local-service/src/cli.js [--config PATH] [--help] [--version]
  npm start -- --config PATH

Saved settings:
  --config PATH           Read an explicit UTF-8 JSON file (also --config=PATH)
                          Relative paths use the current working directory
                          Defaults < file < environment < programmatic overrides
                          Restart after editing; no automatic file discovery

Environment:
  RS_LEVELS_HOST           Host to bind, default 127.0.0.1
  RS_LEVELS_PORT           Port to bind, default 8765
  RS_LEVELS_ALLOW_REMOTE   Set to 1 only on trusted private networks
  RS_LEVELS_CORS_ORIGINS   Replacement comma-separated CORS origins; empty restores defaults
  RS_LEVELS_STALE_MS       Source stale threshold in milliseconds, default 82800000
`);
}
