#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const releaseName = `${packageJson.name}-${packageJson.version}`;
const distRoot = path.join(root, 'dist');
const outDir = path.join(distRoot, releaseName);

const includeEntries = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'package.json',
  'apps',
  'packages',
  'plugins',
  'examples',
  'docs',
  'tools'
];

const requiredReleaseEntries = [
  'README.md',
  'docs/openapi.yaml',
  'docs/user-setup.md',
  'apps/local-service/src/cli.js',
  'apps/browser-extension/manifest.json',
  'apps/browser-extension/src/popup.html',
  'plugins/tradingview/rs-levels.pine',
  'plugins/sierra-chart/rs-levels-sierra.cpp',
  'plugins/ninjatrader/RSLevelsDisplay.cs',
  'plugins/quantower/RSLevelsDisplayQuantower.cs',
  'plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java',
  'tools/scan-text.mjs'
];

const excludedNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '__pycache__',
  'captures',
  'snapshots',
  'screenshots',
  'logs',
  'archives'
]);

const excludedExtensions = new Set(['.db', '.sqlite', '.sqlite3', '.har', '.log', '.jsonl']);

const files = [];
for (const entry of includeEntries) {
  const source = path.join(root, entry);
  await assertExists(source);
  await collectFiles(source, entry.replace(/\\/g, '/'), files);
}
files.sort((a, b) => a.relative.localeCompare(b.relative));
assertRequiredReleaseEntries(files);

if (checkOnly) {
  console.log(`release package check passed (${files.length} files, ${requiredReleaseEntries.length} critical entries)`);
  process.exit(0);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const manifestFiles = [];
for (const file of files) {
  const target = path.join(outDir, file.relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(file.absolute, target);
  const stat = await fs.stat(file.absolute);
  manifestFiles.push({
    path: file.relative,
    bytes: stat.size,
    sha256: await sha256(file.absolute)
  });
}

const manifest = {
  name: packageJson.name,
  version: packageJson.version,
  generatedAt: new Date().toISOString(),
  releaseName,
  files: manifestFiles
};

await fs.writeFile(path.join(outDir, 'RELEASE-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(
  path.join(outDir, 'SHA256SUMS.txt'),
  manifestFiles.map((file) => `${file.sha256}  ${file.path}`).join('\n') + '\n'
);

console.log(`release package written to ${path.relative(root, outDir)}`);
console.log(`${manifestFiles.length} files`);

async function assertExists(filePath) {
  try {
    await fs.stat(filePath);
  } catch (_err) {
    throw new Error(`Required release entry is missing: ${path.relative(root, filePath)}`);
  }
}

async function collectFiles(absolute, relative, output) {
  const stat = await fs.stat(absolute);
  const name = path.basename(absolute);
  if (excludedNames.has(name) || excludedExtensions.has(path.extname(name).toLowerCase())) return;

  if (stat.isDirectory()) {
    const entries = await fs.readdir(absolute);
    for (const entry of entries) {
      await collectFiles(path.join(absolute, entry), `${relative}/${entry}`, output);
    }
    return;
  }

  if (!stat.isFile()) return;
  output.push({ absolute, relative });
}

function assertRequiredReleaseEntries(files) {
  const releasePaths = new Set(files.map((file) => file.relative));
  const missing = requiredReleaseEntries.filter((entry) => !releasePaths.has(entry));
  if (missing.length) {
    throw new Error(`Required release file(s) missing: ${missing.join(', ')}`);
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
