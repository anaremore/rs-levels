const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.service_worker, 'src/background.js');
assert.deepEqual(manifest.permissions.sort(), ['clipboardWrite', 'storage']);
assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
assert.ok(!JSON.stringify(manifest).includes('webRequest'));
assert.ok(!JSON.stringify(manifest).includes('debugger'));
assert.ok(!JSON.stringify(manifest.host_permissions).includes('http://*/*'));
assert.ok(!JSON.stringify(manifest).includes('tabs'));
assert.deepEqual(manifest.optional_host_permissions.sort(), ['http://*/*', 'https://*/*']);
assert.ok(manifest.content_scripts[0].matches.every((match) => match.includes('rocketscooter.com')));
assert.equal(manifest.content_scripts[0].run_at, 'document_start');
assert.match(JSON.stringify(manifest.web_accessible_resources), /src\/capture-rules\.js/);
assert.match(JSON.stringify(manifest.web_accessible_resources), /src\/page-hook\.js/);

const contentScript = readFileSync(join(root, 'src', 'content-script.js'), 'utf8');
const pageHook = readFileSync(join(root, 'src', 'page-hook.js'), 'utf8');
const background = readFileSync(join(root, 'src', 'background.js'), 'utf8');
const popup = readFileSync(join(root, 'src', 'popup.js'), 'utf8');
const popupHtml = readFileSync(join(root, 'src', 'popup.html'), 'utf8');
const options = readFileSync(join(root, 'src', 'options.js'), 'utf8');

assert.match(contentScript, /capture-rules\.js/);
assert.match(contentScript, /page-hook\.js/);
assert.match(contentScript, /rsLevelsNonce/);
assert.match(contentScript, /window\.location\.origin/);
assert.match(pageHook, /NONCE/);
assert.match(pageHook, /event\.origin/);
assert.match(pageHook, /xhr\.responseType/);
assert.doesNotMatch(contentScript + pageHook, /document\.body\.innerText/);
assert.doesNotMatch(contentScript + pageHook, /document\.documentElement\.innerText/);
assert.doesNotMatch(background, /chrome\.cookies/);
assert.match(background, /importScripts\('shared\.js'\)/);
assert.match(background, /\/capture\/api/);
assert.match(popup, /\/tradingview\/\$\{selectedSymbol\(\)\}/);
assert.match(popup, /format=json/);
assert.match(popup, /\/diagnostics/);
assert.match(popup, /cleanExtensionState/);
assert.match(popupHtml, /copy-diagnostics/);
assert.match(popupHtml, /open-docs/);
assert.match(options, /chrome\.permissions\.request/);

console.log('browser extension static tests passed');
