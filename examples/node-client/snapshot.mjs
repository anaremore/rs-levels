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
    console.log(`${nextSymbol}: ${(row.levels || []).length} levels captured=${row.capturedAt || 'n/a'}`);
  }
}

function printSymbol(row) {
  console.log(`${row.symbol}: ${(row.levels || []).length} levels`);
  for (const level of row.levels || []) {
    console.log(`${level.name}\t${level.kind}\t${Number(level.price).toFixed(2)}`);
  }
}

function cleanBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
}