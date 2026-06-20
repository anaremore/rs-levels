const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const output = execFileSync(process.execPath, ['tools/scan-text.mjs', 'private'], {
  cwd: root,
  encoding: 'utf8'
});

assert.match(output, /private scan passed/);
assert.match(output, /allowed-doc: plugins\/bookmap\/README\.md:/);

for (const line of output.split(/\r?\n/)) {
  if (!line.startsWith('allowed-doc: plugins/')) continue;
  assert.match(line, /^allowed-doc: plugins\/[^/]+\/README\.md:/, `unexpected plugin documentation allowlist hit: ${line}`);
}

console.log('scan text tests passed');
