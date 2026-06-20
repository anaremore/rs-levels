const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const output = execFileSync(process.execPath, ['tools/package-release.mjs', '--check'], {
  cwd: root,
  encoding: 'utf8'
});

assert.match(output, /release package check passed/);
assert.match(output, /critical entries/);

console.log('package release tests passed');
