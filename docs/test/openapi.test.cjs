const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const spec = readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8');

for (const path of ['/', '/docs', '/openapi.yaml', '/swagger.yaml', '/diagnostics', '/health', '/status', '/plugins', '/snapshot', '/levels', '/levels/{symbol}', '/stats', '/stats/{symbol}', '/ddbands', '/zones', '/references', '/tradingview', '/tradingview/{symbol}', '/stream', '/capture/api']) {
  assert.match(spec, new RegExp(`^  ${path.replace(/[{}]/g, '\\$&')}:`, 'm'));
}

for (const schema of ['Snapshot', 'SymbolSnapshot', 'SymbolSummary', 'StatsSnapshot', 'StatsRow', 'Stats', 'PluginManifest', 'PluginEntry', 'Level', 'TradingViewPayload', 'CapturePayload', 'Diagnostics', 'DiagnosticCheck']) {
  assert.match(spec, new RegExp(`^    ${schema}:`, 'm'));
}

assert.match(spec, /openapi: 3\.1\.0/);
assert.match(spec, /http:\/\/127\.0\.0\.1:8765/);
assert.match(spec, /application\/yaml:/);

console.log('OpenAPI spec tests passed');
