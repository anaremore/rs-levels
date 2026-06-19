const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const pine = readFileSync(join(__dirname, '..', 'rs-levels.pine'), 'utf8');

assert.match(pine, /indicator\("RS Levels"/);
assert.doesNotMatch(pine, /\bstrategy\s*\(/i);
assert.doesNotMatch(pine, /\bstrategy\./i);
assert.doesNotMatch(pine, new RegExp('\\b' + 'ord' + 'er' + '\\b', 'i'));
assert.doesNotMatch(pine, /\balertcondition\s*\(/i);
assert.match(pine, /RSLEVELS/);
assert.match(pine, /str\.split/);

console.log('TradingView plugin tests passed');