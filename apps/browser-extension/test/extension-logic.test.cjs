const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const root = join(__dirname, '..');

const sharedContext = { URL };
vm.createContext(sharedContext);
vm.runInContext(readFileSync(join(root, 'src', 'shared.js'), 'utf8'), sharedContext);

const settings = sharedContext.RS_LEVELS.cleanSettings({
  serviceUrl: ' http://127.0.0.1:8765/// ',
  captureEnabled: true,
  endpointPatterns: ' level\n\nzone,ddband ',
  maxCaptureBytes: 0
});

assert.equal(settings.serviceUrl, 'http://127.0.0.1:8765');
assert.equal(JSON.stringify(settings.endpointPatterns), JSON.stringify(['level', 'zone', 'ddband']));
assert.equal(settings.maxCaptureBytes, 1024);
assert.equal(sharedContext.RS_LEVELS.cleanSettings({ maxCaptureBytes: 99999999 }).maxCaptureBytes, 5 * 1024 * 1024);
assert.throws(() => sharedContext.RS_LEVELS.cleanServiceUrl('ftp://example.test'), /http or https/);
assert.throws(() => sharedContext.RS_LEVELS.cleanServiceUrl('not a url'), /Invalid URL/);

const rulesContext = { URL };
vm.createContext(rulesContext);
vm.runInContext(readFileSync(join(root, 'src', 'capture-rules.js'), 'utf8'), rulesContext);

const rules = rulesContext.RS_LEVELS_CAPTURE_RULES;
assert.equal(rules.isAllowedCaptureUrl('https://example.test/api/levels/MES', ['levels']), true);
assert.equal(rules.isAllowedCaptureUrl('https://example.test/api/profile', ['levels']), false);
assert.equal(rules.isAllowedCaptureUrl('', ['levels']), false);
assert.equal(rules.endpointFromUrl('/api/levels/MES', 'https://example.test/chart'), '/api/levels/MES');
assert.equal(rules.endpointFromUrl('not a url', ''), 'not a url');

console.log('browser extension logic tests passed');