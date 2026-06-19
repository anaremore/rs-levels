#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'private';

const scanners = {
  private: [
    /\b(?:account|rithmic|full auto|execution|flatten|cancel|order|password|token|secret|audit|journal|pnl|live account)\b/gi
  ],
  secrets: [
    /AKIA[0-9A-Z]{16}/g,
    /BEGIN [A-Z ]*PRIVATE KEY/g,
    /Authorization:/gi,
    /Cookie:/gi,
    /Bearer\s+[A-Za-z0-9._~+/=-]+/g
  ]
};

if (!scanners[mode]) {
  console.error(`Unknown scan mode: ${mode}`);
  process.exit(2);
}

const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage']);
const excludedFiles = new Set(['tools/scan-text.mjs']);
const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.pine', '.ps1', '.txt', '.yaml', '.yml'
]);

const allowedDocumentation = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'package.json',
  'docs/',
  'apps/browser-extension/README.md',
  'apps/local-service/README.md',
  'packages/core-parser/README.md',
  'packages/schemas/README.md',
  'plugins/'
];

const hits = [];
await walk(root);

const disallowed = hits.filter((hit) => !isAllowedDocumentation(hit.file));
for (const hit of hits) {
  const marker = isAllowedDocumentation(hit.file) ? 'allowed-doc' : 'review';
  console.log(`${marker}: ${hit.file}:${hit.line}: ${hit.match}`);
}

if (disallowed.length > 0) {
  console.error(`${mode} scan failed: ${disallowed.length} implementation hit(s) need review.`);
  process.exit(1);
}

console.log(`${mode} scan passed (${hits.length} documentation hit(s), 0 implementation hits)`);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = slash(path.relative(root, absolute));
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) await walk(absolute);
      continue;
    }
    if (!entry.isFile()) continue;
    if (excludedFiles.has(relative)) continue;
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    await scanFile(absolute, relative);
  }
}

async function scanFile(absolute, relative) {
  const text = await fs.readFile(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    scanners[mode].forEach((pattern) => {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        hits.push({ file: relative, line: index + 1, match: match[0] });
      }
    });
  });
}

function isAllowedDocumentation(file) {
  return allowedDocumentation.some((allowed) => file === allowed || file.startsWith(allowed));
}

function slash(value) {
  return value.replace(/\\/g, '/');
}