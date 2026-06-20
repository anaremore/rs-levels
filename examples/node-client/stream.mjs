#!/usr/bin/env node
const baseUrl = cleanBaseUrl(process.env.RS_LEVELS_URL || process.argv[2] || 'http://127.0.0.1:8765');

const response = await fetch(`${baseUrl}/stream`);
if (!response.ok || !response.body) {
  console.error(`RS Levels stream returned ${response.status}`);
  process.exit(1);
}

console.log(`connected ${baseUrl}/stream`);
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let boundary;
  while ((boundary = buffer.indexOf('\n\n')) >= 0) {
    const raw = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    handleEvent(raw);
  }
}

function handleEvent(raw) {
  const lines = raw.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || 'message';
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
  if (event !== 'snapshot' || !data) return;
  const snapshot = JSON.parse(data);
  const levelCount = Object.values(snapshot.symbols || {}).reduce((sum, row) => sum + (row.levels || []).length, 0);
  console.log(`${snapshot.generatedAt} state=${snapshot.source?.state || 'unknown'} symbols=${Object.keys(snapshot.symbols || {}).length} levels=${levelCount}`);
}

function cleanBaseUrl(value) {
  return String(value || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '');
}