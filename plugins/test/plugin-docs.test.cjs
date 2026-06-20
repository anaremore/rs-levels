const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const platforms = ['sierra-chart', 'ninjatrader', 'quantower', 'bookmap', 'tradingview'];
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

assert.equal(manifest.schemaVersion, '0.1.0');
assert.deepEqual(manifest.plugins.map((plugin) => plugin.id).sort(), [...platforms].sort());

for (const plugin of manifest.plugins) {
  assert.equal(plugin.displayOnly, true, `${plugin.id} must be display-only`);
  assert.ok(existsSync(join(root, '..', plugin.entry)), `${plugin.id} entry file must exist`);
  assert.ok(existsSync(join(root, '..', plugin.readme)), `${plugin.id} readme must exist`);
  assert.ok(Array.isArray(plugin.api.endpoints) && plugin.api.endpoints.length > 0, `${plugin.id} must list API endpoints`);
  if (plugin.id === 'tradingview') {
    assert.equal(plugin.api.mode, 'manual-paste');
    assert.ok(plugin.api.endpoints.some((endpoint) => endpoint.includes('/tradingview/:symbol')));
  } else {
    assert.equal(plugin.api.mode, 'local-http');
    assert.ok(plugin.api.endpoints.includes('GET /status'), `${plugin.id} must poll status`);
    assert.ok(plugin.api.endpoints.some((endpoint) => endpoint.includes('/levels/:symbol')), `${plugin.id} must poll symbol levels`);
  }
}

for (const platform of platforms) {
  const text = readFileSync(join(root, platform, 'README.md'), 'utf8');
  assert.match(text, /display-only/i, `${platform} must state display-only boundary`);
  assert.match(text, /Safety Boundary/i, `${platform} must include a safety boundary`);
  if (platform !== 'tradingview') {
    assert.match(text, /GET \/status/, `${platform} must document status polling`);
    assert.match(text, /GET \/levels\//, `${platform} must document levels polling`);
    assert.match(text, /stale/i, `${platform} must document stale handling`);
  } else {
    assert.match(text, /RSLEVELS/, 'tradingview must document paste payload');
  }
}

const contract = readFileSync(join(root, '..', 'docs', 'plugin-contract.md'), 'utf8');
assert.match(contract, /GET \/levels\/:symbol/);
assert.match(contract, /Freshness Rules/);
assert.match(contract, /Safety Tests/);

const sierraSource = readFileSync(join(root, 'sierra-chart', 'rs-levels-sierra.cpp'), 'utf8');
assert.match(sierraSource, /SCSFExport scsf_RSLevelsDisplay/);
assert.match(sierraSource, /\/status/);
assert.match(sierraSource, /format=sierra/);
assert.match(sierraSource, /DRAWING_HORIZONTALLINE/);
assertNoPlatformApiTerms(sierraSource);

const ninjaSource = readFileSync(join(root, 'ninjatrader', 'RSLevelsDisplay.cs'), 'utf8');
assert.match(ninjaSource, /class RSLevelsDisplay : Indicator/);
assert.match(ninjaSource, /\/status/);
assert.match(ninjaSource, /format=sierra/);
assert.match(ninjaSource, /Draw\.HorizontalLine/);
assert.match(ninjaSource, /Draw\.TextFixed/);
assertNoPlatformApiTerms(ninjaSource);

const quantowerSource = readFileSync(join(root, 'quantower', 'RSLevelsDisplayQuantower.cs'), 'utf8');
assert.match(quantowerSource, /class RSLevelsDisplayQuantower : Indicator/);
assert.match(quantowerSource, /\/status/);
assert.match(quantowerSource, /format=sierra/);
assert.match(quantowerSource, /OnPaintChart/);
assert.match(quantowerSource, /DrawLine/);
assertNoPlatformApiTerms(quantowerSource);

const bookmapSource = readFileSync(join(root, 'bookmap', 'src', 'main', 'java', 'com', 'rslevels', 'bookmap', 'RSLevelsDisplayBookmap.java'), 'utf8');
assert.match(bookmapSource, /class RSLevelsDisplayBookmap implements CustomModule/);
assert.match(bookmapSource, /\/status/);
assert.match(bookmapSource, /format=sierra/);
assert.match(bookmapSource, /setHorizontalValueLinesInfo/);
assertNoPlatformApiTerms(bookmapSource);

const tradingViewSource = readFileSync(join(root, 'tradingview', 'rs-levels.pine'), 'utf8');
assert.match(tradingViewSource, /^indicator\(/m);
assert.doesNotMatch(tradingViewSource, /\bstrategy\s*\(/i);
assert.doesNotMatch(tradingViewSource, /\bstrategy\./i);
assert.doesNotMatch(tradingViewSource, /\balertcondition\s*\(/i);

console.log('plugin documentation tests passed');

function assertNoPlatformApiTerms(source) {
  for (const term of [
    'ord' + 'er',
    'acc' + 'ount',
    'flat' + 'ten',
    'can' + 'cel',
    'exec' + 'ution',
    'strat' + 'egy'
  ]) {
    assert.doesNotMatch(source, new RegExp('\\b' + term + '\\b', 'i'));
  }
}
