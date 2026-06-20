const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const platforms = ['sierra-chart', 'ninjatrader', 'quantower', 'bookmap', 'tradingview'];

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
