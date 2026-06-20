const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const checkOutput = execFileSync(process.execPath, ['tools/package-release.mjs', '--check'], {
  cwd: root,
  encoding: 'utf8'
});

assert.match(checkOutput, /release package check passed/);
assert.match(checkOutput, /16 critical entries/);
assert.match(checkOutput, /zip enabled/);

const packageOutput = execFileSync(process.execPath, ['tools/package-release.mjs'], {
  cwd: root,
  encoding: 'utf8'
});

assert.match(packageOutput, /release zip written/);
assert.match(packageOutput, /release zip checksum written/);

const zipPath = join(root, 'dist', 'rs-levels-0.0.0.zip');
const releaseRoot = join(root, 'dist', 'rs-levels-0.0.0');
const releaseCli = join(releaseRoot, 'apps', 'local-service', 'src', 'cli.js');
const releaseVersion = execFileSync(process.execPath, [releaseCli, '--version'], {
  cwd: releaseRoot,
  encoding: 'utf8'
}).trim();
assert.equal(releaseVersion, '0.0.0');
const releaseHelp = execFileSync(process.execPath, [releaseCli, '--help'], {
  cwd: releaseRoot,
  encoding: 'utf8'
});
assert.match(releaseHelp, /RS_LEVELS_HOST/);
assert.match(releaseHelp, /trusted private networks/);

const zip = readFileSync(zipPath);
assert.equal(zip.readUInt32LE(0), 0x04034b50);
assert.match(zip.toString('utf8'), /rs-levels-0\.0\.0\/README\.md/);
assert.match(zip.toString('utf8'), /rs-levels-0\.0\.0\/plugins\/manifest\.json/);
assert.match(zip.toString('utf8'), /rs-levels-0\.0\.0\/scripts\/start-local-service\.cmd/);
assert.match(zip.toString('utf8'), /rs-levels-0\.0\.0\/scripts\/start-local-service\.ps1/);
assert.match(zip.toString('utf8'), /rs-levels-0\.0\.0\/scripts\/start-local-service\.sh/);

const checksum = readFileSync(`${zipPath}.sha256`, 'utf8').trim();
assert.match(checksum, /^[a-f0-9]{64}  rs-levels-0\.0\.0\.zip$/);

console.log('package release tests passed');
