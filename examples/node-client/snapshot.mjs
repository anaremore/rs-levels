#!/usr/bin/env node
const baseUrl = cleanBaseUrl(process.env.RS_LEVELS_URL || process.argv[2] || 'http://127.0.0.1:8765');
const symbol = (process.argv[3] || process.env.RS_LEVELS_SYMBOL || '').toUpperCase();

const endpoint = symbol ? `/levels/${encodeURIComponent(symbol)}` : '/snapshot';
const response = await fetch(`${baseUrl}${endpoint}`);
if (!response.ok) {
  console.error(`RS Levels API returned ${response.status}`);
  process.exit(1);
}

const data = await response.json();
if (symbol) {
  printSymbol(data);
} else {
  printSnapshot(data);
}

function printSnapshot(snapshot) {
  const symbols = Object.keys(snapshot.symbols || {});
  console.log(`RS Levels ${snapshot.schemaVersion || ''}`.trim());
  console.log(`source=${snapshot.source?.state || 'unknown'} symbols=${symbols.length}`);
  for (const nextSymbol of symbols) {
    const row = snapshot.symbols[nextSymbol];
    const stats = formatStats(row.stats);
    console.log(`${displaySymbol(nextSymbol, row)}: ${(row.levels || []).length} levels captured=${row.capturedAt || 'n/a'}${stats ? ` ${stats}` : ''}`);
  }
}

function printSymbol(row) {
  console.log(`${displaySymbol(row.symbol, row)}: ${(row.levels || []).length} levels`);
  const stats = formatStats(row.stats);
  if (stats) console.log(stats);
  for (const level of row.levels || []) {
    console.log(`${level.name}\t${level.kind}\t${Number(level.price).toFixed(2)}`);
  }
}

function displaySymbol(symbol, row = {}) {
  const raw = String(row.displaySymbol || symbol || '').toUpperCase();
  if (raw === 'MES') return 'ES';
  if (raw === 'MNQ') return 'NQ';
  return raw || 'MES';
}

function formatStats(stats = {}) {
  const parts = [];
  appendMetric(parts, 'DD', stats.dd);
  appendMetric(parts, 'Res', stats.resilience);
  appendMetric(parts, 'MRes', stats.monthlyResilience);
  appendMetric(parts, 'WRes', stats.weeklyResilience);
  if (stats.mapCode) parts.push(`Map=${stats.mapCode}`);
  return parts.join(' ');
}

function appendMetric(parts, label, value) {
  if (value == null || value === '') return;
  const number = Number(value);
  if (Number.isFinite(number)) parts.push(`${label}=${number.toFixed(2).replace(/\.?0+$/, '')}`);
}

function cleanBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
}
