#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
const zipPath = path.join(distRoot, `${releaseName}.zip`);
const zipShaPath = `${zipPath}.sha256`;
const extensionRoot = path.join(root, 'apps', 'browser-extension');
const extensionManifest = JSON.parse(await fs.readFile(path.join(extensionRoot, 'manifest.json'), 'utf8'));
const extensionVersion = extensionManifest.version || packageJson.version;
const extensionReleaseName = `${packageJson.name}-browser-extension-${extensionVersion}`;
const extensionZipPath = path.join(distRoot, `${extensionReleaseName}.zip`);
const extensionZipShaPath = `${extensionZipPath}.sha256`;
const gitRevision = revisionFromGit();
const buildInfo = buildInfoSource({
  revision: gitRevision,
  generatedAt: new Date().toISOString(),
  source: 'package'
});

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
  'scripts',
  'tools'
];

const extensionIncludeEntries = ['manifest.json', 'README.md', 'src'];

const requiredReleaseEntries = [
  'README.md',
  'docs/openapi.yaml',
  'docs/user-setup.md',
  'apps/local-service/src/cli.js',
  'apps/browser-extension/manifest.json',
  'apps/browser-extension/src/popup.html',
  'scripts/start-local-service.cmd',
  'scripts/start-local-service.ps1',
  'scripts/start-local-service.sh',
  'plugins/manifest.json',
  'plugins/tradingview/rs-levels.pine',
  'plugins/sierra-chart/rs-levels-sierra.cpp',
  'plugins/ninjatrader/RSLevelsDisplay.cs',
  'plugins/quantower/RSLevelsDisplayQuantower.cs',
  'plugins/bookmap/src/main/java/com/rslevels/bookmap/RSLevelsDisplayBookmap.java',
  'tools/scan-text.mjs'
];

const requiredExtensionEntries = [
  'manifest.json',
  'README.md',
  'src/background.js',
  'src/build-info.js',
  'src/capture-rules.js',
  'src/content-script.js',
  'src/options.html',
  'src/options.js',
  'src/page-hook.js',
  'src/popup.html',
  'src/popup.js',
  'src/shared.js'
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

const CRC32_TABLE = Array.from({ length: 256 }, (_value, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

const files = [];
for (const entry of includeEntries) {
  const source = path.join(root, entry);
  await assertExists(source);
  await collectFiles(source, entry.replace(/\\/g, '/'), files);
}
files.sort((a, b) => a.relative.localeCompare(b.relative));
assertRequiredReleaseEntries(files);

const extensionFiles = [];
for (const entry of extensionIncludeEntries) {
  const source = path.join(extensionRoot, entry);
  await assertExists(source);
  await collectFiles(source, entry.replace(/\\/g, '/'), extensionFiles);
}
extensionFiles.sort((a, b) => a.relative.localeCompare(b.relative));
assertRequiredExtensionEntries(extensionFiles);

if (checkOnly) {
  console.log(
    `release package check passed (${files.length} files, ${requiredReleaseEntries.length} critical entries, zip enabled, extension zip enabled)`
  );
  process.exit(0);
}

await fs.rm(outDir, { recursive: true, force: true });
await fs.rm(zipPath, { force: true });
await fs.rm(zipShaPath, { force: true });
await fs.rm(extensionZipPath, { force: true });
await fs.rm(extensionZipShaPath, { force: true });
await fs.mkdir(outDir, { recursive: true });

const manifestFiles = [];
for (const file of files) {
  const target = path.join(outDir, file.relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (file.relative === 'apps/browser-extension/src/build-info.js') {
    await fs.writeFile(target, buildInfo);
  } else {
    await fs.copyFile(file.absolute, target);
  }
  const stat = await fs.stat(target);
  manifestFiles.push({
    path: file.relative,
    bytes: stat.size,
    sha256: await sha256(target)
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

const archiveFiles = [];
await collectFiles(outDir, releaseName, archiveFiles);
archiveFiles.sort((a, b) => a.relative.localeCompare(b.relative));
await writeZip(zipPath, archiveFiles);
const zipHash = await sha256(zipPath);
await fs.writeFile(zipShaPath, `${zipHash}  ${path.basename(zipPath)}\n`);

const packagedExtensionFiles = [];
for (const entry of extensionIncludeEntries) {
  const source = path.join(outDir, 'apps', 'browser-extension', entry);
  await collectFiles(source, entry.replace(/\\/g, '/'), packagedExtensionFiles);
}
packagedExtensionFiles.sort((a, b) => a.relative.localeCompare(b.relative));
assertRequiredExtensionEntries(packagedExtensionFiles);

await writeZip(extensionZipPath, packagedExtensionFiles);
const extensionZipHash = await sha256(extensionZipPath);
await fs.writeFile(extensionZipShaPath, `${extensionZipHash}  ${path.basename(extensionZipPath)}\n`);

console.log(`release package written to ${path.relative(root, outDir)}`);
console.log(`release zip written to ${path.relative(root, zipPath)}`);
console.log(`release zip checksum written to ${path.relative(root, zipShaPath)}`);
console.log(`browser extension zip written to ${path.relative(root, extensionZipPath)}`);
console.log(`browser extension zip checksum written to ${path.relative(root, extensionZipShaPath)}`);
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

function assertRequiredExtensionEntries(files) {
  const releasePaths = new Set(files.map((file) => file.relative));
  const missing = requiredExtensionEntries.filter((entry) => !releasePaths.has(entry));
  if (missing.length) {
    throw new Error(`Required extension package file(s) missing: ${missing.join(', ')}`);
  }
}

function revisionFromGit() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_err) {
    return '';
  }
}

function buildInfoSource(info) {
  return `globalThis.RS_LEVELS_BUILD = Object.freeze(${JSON.stringify({
    revision: info.revision || '',
    generatedAt: info.generatedAt || '',
    source: info.source || 'source'
  }, null, 2)});\n`;
}

async function writeZip(targetPath, zipFiles) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of zipFiles) {
    const name = slash(file.relative);
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = await fs.readFile(file.absolute);
    const crc = crc32(data);
    const localHeader = zipLocalHeader(nameBuffer, data.length, crc);
    localParts.push(localHeader, data);
    centralParts.push(zipCentralHeader(nameBuffer, data.length, crc, offset));
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = zipEndRecord(zipFiles.length, centralDirectory.length, offset);
  await fs.writeFile(targetPath, Buffer.concat([...localParts, centralDirectory, end]));
}

function zipLocalHeader(nameBuffer, size, crc) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  writeDosDateTime(header, 10);
  header.writeUInt32LE(crc >>> 0, 14);
  header.writeUInt32LE(size >>> 0, 18);
  header.writeUInt32LE(size >>> 0, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer]);
}

function zipCentralHeader(nameBuffer, size, crc, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  writeDosDateTime(header, 12);
  header.writeUInt32LE(crc >>> 0, 16);
  header.writeUInt32LE(size >>> 0, 20);
  header.writeUInt32LE(size >>> 0, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset >>> 0, 42);
  return Buffer.concat([header, nameBuffer]);
}

function zipEndRecord(entryCount, centralSize, centralOffset) {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize >>> 0, 12);
  header.writeUInt32LE(centralOffset >>> 0, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function writeDosDateTime(buffer, offset) {
  buffer.writeUInt16LE(0, offset);
  buffer.writeUInt16LE((1 << 5) | 1, offset + 2);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
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

function slash(value) {
  return value.replace(/\\/g, '/');
}
