#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = cleanBaseUrl(process.env.RS_LEVELS_URL || process.argv[2] || 'http://127.0.0.1:8765');
const fixturePath = path.resolve(root, process.argv[3] || 'examples/sample-captures/mes-levels.json');
const payload = JSON.parse(await fs.readFile(fixturePath, 'utf8'));

const response = await fetch(`${baseUrl}/capture/api`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

if (!response.ok) {
  console.error(`RS Levels API returned ${response.status}`);
  console.error(await response.text());
  process.exit(1);
}

const data = await response.json();
const symbols = Object.keys(data.snapshot?.symbols || {});
const levelCount = Object.values(data.snapshot?.symbols || {}).reduce((sum, row) => sum + (row.levels || []).length, 0);
console.log(`posted ${path.relative(root, fixturePath).replace(/\\/g, '/')}`);
console.log(`symbols=${symbols.join(',') || 'none'} levels=${levelCount}`);

function cleanBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
}