import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService, listen } from '../src/index.js';
import { status } from '../src/http.js';
import { HISTORY_GAP_MS, HISTORY_HEARTBEAT_MS, HISTORY_MAX_POINTS, createStatsHistory } from '../src/stats-history.js';
import { STATS_FIELDS } from '../../../packages/schemas/src/index.js';

// Synthetic values only. Every directory is temporary and every clock is manual.
const T0 = Date.parse('2026-06-20T14:00:00.000Z');
const MIN = 60 * 1000;
const dirs = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-levels-history-'));
  dirs.push(dir);
  return dir;
};
const iso = (ms) => new Date(ms).toISOString();
const open = (dataDir, nowRef, more = {}) => createStatsHistory({
  dataDir,
  retentionDays: 10,
  maxBytes: 1024 * 1024,
  clock: () => new Date(nowRef.ms),
  ...more
});
const fileLines = (dataDir) => {
  const dir = join(dataDir, 'history');
  return readdirSync(dir).sort().flatMap((name) =>
    readFileSync(join(dir, name), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));
};
const range = (fromMs, toMs, fields) => ({ fromMs, toMs, fields });

// Only changes are written, plus a heartbeat while captures keep arriving.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1.5, monthlyResilience: 2 }, T0);
  history.record('NQ', { resilience: 1.5, monthlyResilience: 2 }, T0 + 15000);
  history.record('NQ', { resilience: 1.5, monthlyResilience: 2 }, T0 + 30000);
  assert.equal(fileLines(dataDir).length, 1, 'unchanged within the heartbeat: nothing written');
  history.record('NQ', { resilience: 1.75, monthlyResilience: 2 }, T0 + 45000);
  let lines = fileLines(dataDir);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].v, { resilience: 1.75 }, 'only what changed');
  history.record('NQ', { resilience: 1.75, monthlyResilience: 2 }, T0 + 45000 + HISTORY_HEARTBEAT_MS);
  lines = fileLines(dataDir);
  assert.equal(lines.length, 3, 'a heartbeat at the interval');
  assert.equal(lines[2].v, undefined, 'a heartbeat carries no values');
  assert.deepEqual(lines[2].r, ['monthlyResilience', 'resilience']);
  // A file holds only stats: no capture body, URL or level.
  assert.deepEqual(Object.keys(lines[0]).sort(), ['r', 's', 't', 'v']);
}

// A capture reporting nothing for a symbol claims nothing about it.
{
  const dataDir = tempDir();
  const history = open(dataDir, { ms: T0 });
  history.record('ES', {}, T0);
  history.record('ES', { dd: null, resilience: '', mapCode: '' }, T0);
  assert.deepEqual(readdirSync(dataDir).length ? fileLines(dataDir) : [], []);
}

// Gaps stay gaps: no value carries across one, and nothing is interpolated.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1 }, T0);
  history.record('NQ', { resilience: 1 }, T0 + 2 * MIN);
  const resume = T0 + 2 * MIN + HISTORY_GAP_MS + MIN;
  history.record('NQ', { resilience: 1 }, resume);
  assert.deepEqual(fileLines(dataDir).at(-1).v, { resilience: 1 }, 'written again after a gap, unchanged or not');
  now.ms = resume + MIN;
  const out = await history.query('NQ', range(T0, now.ms, ['resilience']));
  assert.deepEqual(out.segments.resilience, [
    { from: iso(T0), to: iso(T0 + 2 * MIN) },
    { from: iso(resume), to: iso(resume) }
  ]);
  assert.deepEqual(out.points, [
    { t: iso(T0), values: { resilience: 1 } },
    { t: iso(resume), values: { resilience: 1 } }
  ]);
  // Asked for a time inside the gap: nothing is known then, so nothing is opening.
  const inside = await history.query('NQ', range(T0 + 3 * MIN, T0 + 4 * MIN, ['resilience']));
  assert.deepEqual(inside.points, []);
  assert.deepEqual(inside.opening, {});
  assert.deepEqual(inside.segments.resilience, []);
  assert.deepEqual(inside.absentFields, ['resilience']);
}

// Coverage is per field: one that stops being reported gaps while the others go on.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1, weeklyResilience: 5 }, T0);
  for (let i = 1; i <= 10; i += 1) history.record('NQ', { resilience: 1 }, T0 + i * MIN);
  now.ms = T0 + 10 * MIN;
  const out = await history.query('NQ', range(T0, now.ms, ['resilience', 'weeklyResilience']));
  assert.deepEqual(out.segments.resilience, [{ from: iso(T0), to: iso(T0 + 10 * MIN) }]);
  assert.deepEqual(out.segments.weeklyResilience, [{ from: iso(T0), to: iso(T0) }], 'it stops where it stopped');
}

// `opening` is the value in force at `from`, only while its segment reaches `from`.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1 }, T0);
  history.record('NQ', { resilience: 1 }, T0 + MIN);
  history.record('NQ', { resilience: 2 }, T0 + 2 * MIN);
  now.ms = T0 + 3 * MIN;
  const middle = await history.query('NQ', range(T0 + 30000, now.ms, ['resilience']));
  assert.deepEqual(middle.opening.resilience, { t: iso(T0), value: 1 });
  assert.deepEqual(middle.points, [{ t: iso(T0 + 2 * MIN), values: { resilience: 2 } }]);
  assert.deepEqual(middle.absentFields, []);
  const later = await history.query('NQ', range(T0 + 3 * MIN, now.ms, ['resilience']));
  assert.deepEqual(later.opening, {}, 'past the end of its segment');
  assert.deepEqual(later.segments.resilience, []);
}

// An unknown field reads as absent. A field a later version wrote is read back by name.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1, somethingNew: 9 }, T0);
  assert.deepEqual(fileLines(dataDir)[0].v, { resilience: 1 }, 'only listed fields are written');
  now.ms = T0 + MIN;
  const out = await history.query('NQ', range(T0 - MIN, now.ms, ['resilience', 'nosuchfield', 'constructor', '__proto__', 'not valid!']));
  assert.deepEqual(out.fields, ['resilience', 'nosuchfield', 'constructor']);
  assert.deepEqual(out.absentFields, ['nosuchfield', 'constructor']);
  assert.deepEqual(out.points, [{ t: iso(T0), values: { resilience: 1 } }]);

  appendFileSync(join(dataDir, 'history', 'stats-2026-06-20.jsonl'),
    `${JSON.stringify({ t: iso(T0 + 1000), s: 'MNQ', r: ['laterField'], v: { laterField: 3.5 } })}\n`);
  const later = await history.query('NQ', range(T0, now.ms, ['laterField']));
  assert.deepEqual(later.points, [{ t: iso(T0 + 1000), values: { laterField: 3.5 } }]);
}

// The field list is data: every listed field is recorded, with no list anywhere else to extend.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  const stats = Object.fromEntries(STATS_FIELDS.map(({ key, kind }, i) => [key, kind === 'text' ? 'BLD' : i + 1]));
  history.record('NQ', stats, T0);
  now.ms = T0 + MIN;
  const out = await history.query('NQ', range(T0, now.ms));
  assert.deepEqual(out.fields, STATS_FIELDS.map(({ key }) => key));
  assert.deepEqual(out.points[0].values, stats);
}

// It survives a restart: no repeated line for an unchanged value, and the gap rule still holds.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  open(dataDir, now).record('NQ', { resilience: 1 }, T0);
  now.ms = T0 + 10000;
  const reopened = open(dataDir, now);
  reopened.record('NQ', { resilience: 1 }, now.ms);
  assert.equal(fileLines(dataDir).length, 1, 'the value is known across the restart');
  assert.equal(reopened.status().symbols[0].symbol, 'NQ');
  assert.equal(reopened.status().symbols[0].lastChangeAt, iso(T0));
  now.ms = T0 + HISTORY_GAP_MS + 2 * MIN;
  const late = open(dataDir, now);
  late.record('NQ', { resilience: 1 }, now.ms);
  assert.deepEqual(fileLines(dataDir).at(-1).v, { resilience: 1 }, 'down past the gap: written again');
  const out = await late.query('NQ', range(T0, now.ms, ['resilience']));
  assert.equal(out.segments.resilience.length, 2);
}

// A crash's partial last line is skipped, and the next append doesn't join it.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  open(dataDir, now).record('NQ', { resilience: 1 }, T0);
  const file = join(dataDir, 'history', 'stats-2026-06-20.jsonl');
  appendFileSync(file, '{"t":"2026-06-20T14:00:01.000Z","s":"MNQ","r":["resi');
  now.ms = T0 + 2000;
  const history = open(dataDir, now);
  assert.equal(history.status().skippedLines, 1);
  history.record('NQ', { resilience: 2 }, now.ms);
  const out = await history.query('NQ', range(T0, now.ms, ['resilience']));
  assert.deepEqual(out.points.map((point) => point.values.resilience), [1, 2]);
}

// Damaged values read as absent, not as zero.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('NQ', { resilience: 1 }, T0);
  appendFileSync(join(dataDir, 'history', 'stats-2026-06-20.jsonl'),
    `not json\n${JSON.stringify({ t: 'bad', s: 'MNQ', r: [], v: { resilience: 5 } })}\n${JSON.stringify({ t: iso(T0 + 1000), s: 'MNQ', r: ['resilience'], v: { resilience: null, dd: [1] } })}\n`);
  now.ms = T0 + 2000;
  const out = await history.query('NQ', range(T0, now.ms, ['resilience', 'dd']));
  assert.deepEqual(out.points, [{ t: iso(T0), values: { resilience: 1 } }]);
  assert.deepEqual(out.absentFields, ['dd']);
}

// Retention: past it, files go and lines read as absent. Only this store's own files are touched.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const first = open(dataDir, now);
  first.record('NQ', { resilience: 1 }, T0);
  const keep = join(dataDir, 'history', 'notes.txt');
  writeFileSync(keep, 'not ours');
  now.ms = T0 + 11 * 24 * 60 * MIN;
  const later = open(dataDir, now);
  later.record('NQ', { resilience: 2 }, now.ms);
  const names = readdirSync(join(dataDir, 'history')).sort();
  assert.deepEqual(names, ['notes.txt', `stats-${iso(now.ms).slice(0, 10)}.jsonl`]);
  const out = await later.query('NQ', range(T0, now.ms, ['resilience']));
  assert.deepEqual(out.points.map((point) => point.values.resilience), [2]);
  assert.equal(later.status().oldestDay, iso(now.ms).slice(0, 10));
}

// Size: the oldest day goes first. Today's file past the limit stops writing, and says so.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now, { maxBytes: 300 });
  history.record('NQ', { resilience: 1 }, T0);
  now.ms = T0 + 24 * 60 * MIN;
  let value = 2;
  let at = now.ms;
  for (let i = 0; i < 10; i += 1) {
    at += 1000;
    now.ms = at;
    history.record('NQ', { resilience: value }, at);
    value += 1;
  }
  const dir = join(dataDir, 'history');
  const names = readdirSync(dir);
  assert.deepEqual(names, [`stats-${iso(at).slice(0, 10)}.jsonl`], 'the older day went');
  const bytes = names.reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
  assert.ok(bytes <= 300, `${bytes} within the limit`);
  const report = history.status();
  assert.ok(report.droppedWrites > 0);
  assert.equal(report.lastError, 'size-limit');
  assert.equal(report.bytes, bytes);
}

// Writes that fail are counted and never throw into a capture.
{
  const dataDir = tempDir();
  const blocked = join(dataDir, 'file');
  writeFileSync(blocked, 'a file where the directory should be');
  const history = open(blocked, { ms: T0 });
  assert.doesNotThrow(() => history.record('NQ', { resilience: 1 }, T0));
  const report = history.status();
  assert.ok(report.droppedWrites > 0);
  assert.ok(report.lastError);
  assert.ok(!report.lastError.includes(dataDir), 'the error never carries the path');
  assert.ok(!JSON.stringify(report).includes(dataDir), 'nor does the report');
}

// Too many points in one answer: truncated, with where to carry on.
{
  const dataDir = tempDir();
  const start = T0;
  const lines = [];
  for (let i = 0; i <= HISTORY_MAX_POINTS; i += 1) {
    lines.push(JSON.stringify({ t: iso(start + i), s: 'MNQ', r: ['resilience'], v: { resilience: i } }));
  }
  const now = { ms: start + HISTORY_MAX_POINTS + 1 };
  const history = open(dataDir, now, { maxBytes: 64 * 1024 * 1024 });
  history.record('ES', { dd: 1 }, start);
  writeFileSync(join(dataDir, 'history', 'stats-2026-06-20.jsonl'), `${lines.join('\n')}\n`);
  const out = await history.query('NQ', range(start, now.ms, ['resilience']));
  assert.equal(out.points.length, HISTORY_MAX_POINTS);
  assert.equal(out.truncated, true);
  assert.equal(out.nextFrom, iso(start + HISTORY_MAX_POINTS));
}

// Off without a data directory: nothing written, and the answers say so.
{
  const history = createStatsHistory({ dataDir: '' });
  assert.equal(history.enabled, false);
  history.record('NQ', { resilience: 1 }, T0);
  assert.deepEqual(history.status(), { enabled: false });
  const out = await history.query('NQ', {});
  assert.equal(out.enabled, false);
  assert.deepEqual(out.points, []);
}

// A batch of timestamped points backfills, in any arrival, and sending it again writes nothing.
{
  const dataDir = tempDir();
  const now = { ms: T0 + 60 * MIN };
  const history = open(dataDir, now);
  const batch = [
    { t: iso(T0 + 2 * MIN), values: { resilience: 3 } },
    { t: iso(T0), values: { resilience: 1 } },
    { t: iso(T0 + MIN), values: { resilience: 2, monthlyResilience: 7 } }
  ];
  assert.equal(history.recordPoints('NQ', batch), 3);
  const count = fileLines(dataDir).length;
  assert.equal(history.recordPoints('NQ', batch), 0, 'idempotent');
  assert.equal(history.recordPoints('NQ', batch.slice(0, 1)), 0, 'and any part of it');
  assert.equal(fileLines(dataDir).length, count);
  assert.equal(open(dataDir, now).recordPoints('NQ', batch), 0, 'across a restart too');
  let out = await history.query('NQ', range(T0, now.ms, ['resilience']));
  assert.deepEqual(out.points.map((point) => point.values.resilience), [1, 2, 3], 'read back in time');
  assert.deepEqual(out.segments.resilience, [{ from: iso(T0), to: iso(T0 + 2 * MIN) }]);

  // A corrected value is written, and wins.
  assert.equal(history.recordPoints('NQ', [{ t: iso(T0 + MIN), values: { resilience: 2.5, monthlyResilience: 7 } }]), 1);
  out = await history.query('NQ', range(T0, now.ms, ['resilience']));
  assert.deepEqual(out.points.map((point) => point.values.resilience), [1, 2.5, 3]);

  // Live capture isn't moved back: a late older point doesn't become the value now.
  history.record('NQ', { resilience: 9 }, now.ms);
  assert.equal(history.recordPoints('NQ', [{ t: iso(T0 - 10 * MIN), values: { resilience: 4 } }]), 1);
  const lines = fileLines(dataDir).length;
  history.record('NQ', { resilience: 9 }, now.ms + 1000);
  assert.equal(fileLines(dataDir).length, lines, 'still 9: no change to write');

  // A far apart point stays a gap, not a line drawn between.
  const apart = tempDir();
  const spaced = open(apart, now);
  spaced.recordPoints('NQ', [{ t: iso(T0), values: { resilience: 1 } }, { t: iso(T0 + 30 * MIN), values: { resilience: 2 } }]);
  out = await spaced.query('NQ', range(T0, now.ms, ['resilience']));
  assert.equal(out.segments.resilience.length, 2);

  // Skipped: past retention, in the future, unknown fields, damaged times, not a list.
  assert.equal(history.recordPoints('NQ', [
    { t: iso(now.ms - 11 * 24 * 60 * MIN), values: { resilience: 1 } },
    { t: iso(now.ms + MIN), values: { resilience: 1 } },
    { t: iso(T0), values: { somethingNew: 1 } },
    { t: 'bad', values: { resilience: 1 } },
    null
  ]), 0);
  assert.equal(history.recordPoints('NQ', 'nope'), 0);

  // A point on an earlier day goes in that day's file.
  const yesterday = T0 - 24 * 60 * MIN;
  assert.equal(history.recordPoints('NQ', [{ t: iso(yesterday), values: { resilience: 6 } }]), 1);
  assert.ok(readdirSync(join(dataDir, 'history')).includes(`stats-${iso(yesterday).slice(0, 10)}.jsonl`));
  assert.equal(history.status().oldestDay, iso(yesterday).slice(0, 10));
  assert.equal(createStatsHistory({ dataDir: '' }).recordPoints('NQ', batch), 0, 'off: nothing');
}

// Review round 1: a field reported every 10 s is never a gap between its once-a-minute lines.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  for (let at = T0; at <= T0 + 2 * MIN + 30000; at += 10000) {
    now.ms = at;
    history.record('ES', { dd: 5 }, at);
  }
  // Between two heartbeat lines.
  let body = await history.query('ES', range(T0 + 20000, T0 + 40000, ['dd']));
  assert.deepEqual(body.absentFields, []);
  assert.deepEqual(body.segments.dd, [{ from: iso(T0 + 20000), to: iso(T0 + 40000) }]);
  assert.deepEqual(body.opening.dd, { t: iso(T0), value: 5 });
  // Ending between lines: the span runs to `to`.
  body = await history.query('ES', range(T0, T0 + 90000, ['dd']));
  assert.deepEqual(body.segments.dd, [{ from: iso(T0), to: iso(T0 + 90000) }]);
  // The tail since the last line: up to the latest report, and no further.
  body = await history.query('ES', range(T0, T0 + 10 * MIN, ['dd']));
  assert.deepEqual(body.segments.dd, [{ from: iso(T0), to: iso(T0 + 2 * MIN + 30000) }]);
  // A real gap is still a gap.
  now.ms = T0 + 20 * MIN;
  history.record('ES', { dd: 5 }, now.ms);
  body = await history.query('ES', range(T0, now.ms, ['dd']));
  assert.equal(body.segments.dd.length, 2);
}

// Review round 2: reports lost to a failed write are a gap. No later line claims them, and a value
// that comes back is written, not assumed.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now);
  history.record('ES', { dd: 7, resilience: 1 }, T0);
  // The directory turns into a file: every write fails for a while.
  const dir = join(dataDir, 'history');
  const saved = readFileSync(join(dir, `stats-${iso(T0).slice(0, 10)}.jsonl`), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(dir, 'blocked');
  now.ms = T0 + 6 * MIN;
  history.record('ES', { dd: 7, resilience: 1 }, now.ms);
  assert.ok(history.status().droppedWrites > 0);
  // Writes work again; only resilience is reported.
  rmSync(dir, { force: true });
  mkdirSync(dir);
  writeFileSync(join(dir, `stats-${iso(T0).slice(0, 10)}.jsonl`), saved);
  now.ms = T0 + 7 * MIN;
  history.record('ES', { resilience: 1 }, now.ms);
  const lastLine = fileLines(dataDir).pop();
  assert.deepEqual(lastLine.r, ['resilience'], 'dd was not reported: no line says so');
  // dd comes back with the same value: it is written, after its gap.
  now.ms = T0 + 8 * MIN;
  history.record('ES', { dd: 7, resilience: 1 }, now.ms);
  const body = await history.query('ES', range(T0 + 7 * MIN, now.ms, ['dd']));
  assert.deepEqual(body.points.map((point) => point.values.dd), [7]);
}

// Review round 3: an old file that can't be removed (held open) never costs a value. Here a
// directory named like an expired day stands in for it.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now, { retentionDays: 1 });
  history.record('ES', { resilience: 7 }, T0);
  mkdirSync(join(dataDir, 'history', 'stats-2026-06-01.jsonl'));
  const nextDay = Date.parse('2026-06-21T00:00:30.000Z');
  now.ms = nextDay;
  history.record('ES', { resilience: 7 }, now.ms);
  now.ms = nextDay + 10000;
  history.record('ES', { dd: 1 }, now.ms);
  const body = await history.query('ES', range(nextDay, now.ms, ['resilience']));
  assert.equal(body.ok, true, 'a directory among the files is skipped');
  assert.deepEqual(body.points.map((point) => point.values.resilience), [7], 'the value after the gap is written');
}

// Review round 3: retention runs when only batches arrive.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const history = open(dataDir, now, { retentionDays: 1 });
  for (let day = 0; day < 5; day += 1) {
    now.ms = T0 + day * 24 * 60 * MIN;
    history.recordPoints('NQ', [{ t: iso(now.ms), values: { resilience: day } }]);
  }
  assert.ok(readdirSync(join(dataDir, 'history')).length <= 2, 'days past retention are deleted');
}

// Review round 1: an unreadable history directory answers with a code, never its path.
{
  const dataDir = tempDir();
  const history = open(dataDir, { ms: T0 });
  rmSync(join(dataDir, 'history'), { recursive: true, force: true });
  writeFileSync(join(dataDir, 'history'), 'a file where the directory should be');
  const body = await history.query('NQ', range(T0, T0 + MIN));
  assert.equal(body.ok, false);
  assert.ok(body.error);
  assert.ok(!JSON.stringify(body).includes(dataDir), 'no path in the answer');
}

// Review round 1: limits have defaults even when a caller passes none.
{
  const dataDir = tempDir();
  const history = createStatsHistory({ dataDir, clock: () => new Date(T0) });
  history.record('NQ', { resilience: 1 }, T0);
  const report = history.status();
  assert.equal(report.retentionDays, 10);
  assert.equal(report.maxBytes, 64 * 1024 * 1024);
  assert.equal(report.droppedWrites, 0);
}

// Review round 1: a crash-cut line on an earlier day is not joined by a backfilled point.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  open(dataDir, now).record('NQ', { resilience: 1 }, T0 - 24 * 60 * MIN);
  const yesterdayFile = join(dataDir, 'history', `stats-${iso(T0 - 24 * 60 * MIN).slice(0, 10)}.jsonl`);
  appendFileSync(yesterdayFile, '{"t":"cut off');
  const history = open(dataDir, now);
  assert.equal(history.recordPoints('NQ', [{ t: iso(T0 - 23 * 60 * MIN), values: { resilience: 2 } }]), 1);
  const lines = readFileSync(yesterdayFile, 'utf8').split('\n').filter(Boolean);
  assert.equal(JSON.parse(lines[lines.length - 1]).v.resilience, 2, 'the new line stands alone');
}

// Through the service: capture in, read back over HTTP, across a restart, on a temporary port.
{
  const dataDir = tempDir();
  const now = { ms: T0 };
  const start = () => createService({
    env: {},
    config: { host: '127.0.0.1', port: 0, dataDir },
    clock: () => new Date(now.ms)
  });
  let service = start();
  let address = await listen(service);
  let base = `http://127.0.0.1:${address.port}`;
  const capture = async (resilience) => fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: '/page-reader/display',
      method: 'PAGE_READER',
      status: 200,
      capturedAt: iso(now.ms),
      body: { levels: [], stats: { MNQ: { resilience, monthlyResilience: 3 } } }
    })
  });
  assert.equal((await capture(1.5)).status, 200);
  now.ms += 20000;
  assert.equal((await capture(1.5)).status, 200);
  now.ms += 20000;
  assert.equal((await capture(2.5)).status, 200);
  const url = `${base}/history/NQ?from=${iso(T0)}&to=${iso(now.ms)}&fields=resilience,arb`;
  let body = await (await fetch(url)).json();
  assert.equal(body.ok, true);
  assert.equal(body.symbol, 'NQ');
  assert.deepEqual(body.points.map((point) => point.values.resilience), [1.5, 2.5]);
  assert.deepEqual(body.absentFields, ['arb'], 'a field never captured reads as absent');

  const statusBody = await (await fetch(`${base}/status`)).json();
  assert.equal(statusBody.history.enabled, true);
  assert.equal(statusBody.history.symbols[0].symbol, 'NQ');
  assert.equal(statusBody.history.symbols[0].fresh, true);
  assert.deepEqual(statusBody.history.symbols[0].freshFields, ['monthlyResilience', 'resilience']);
  assert.ok(!JSON.stringify(statusBody).includes(dataDir), '/status never names the directory');

  // The next read after the data stops says it's no longer fresh.
  now.ms += HISTORY_GAP_MS + 1000;
  const staleBody = await (await fetch(`${base}/status`)).json();
  assert.equal(staleBody.history.symbols[0].fresh, false);
  assert.deepEqual(staleBody.history.symbols[0].freshFields, []);

  // Bad input: a clear refusal, not a guess.
  assert.equal((await fetch(`${base}/history/NQ?from=yesterday`)).status, 400);
  assert.equal((await fetch(`${base}/history/NQ?to=nope`)).status, 400);
  assert.equal((await fetch(`${base}/history/NQ?from=${iso(T0 + 1000)}&to=${iso(T0)}`)).status, 400);
  assert.equal((await fetch(`${base}/history/NQ?to=-271821-04-20T00:00:00Z`)).status, 400, 'out of range, not a 500');
  assert.equal((await fetch(`${base}/history/NQ?to=2026-06-20T10:00`)).status, 400, 'no local time guessed');
  assert.equal((await fetch(`${base}/history/NQ?to=2026-06-20T10:00:00%2B02:00`)).status, 200, 'an offset is fine');
  assert.equal((await fetch(`${base}/history/NQ`, { method: 'POST' })).status, 404, 'read-only');
  const unknownSymbol = await (await fetch(`${base}/history/ZZZ`)).json();
  assert.deepEqual(unknownSymbol.points, []);

  // The default range is the last day, ending now.
  body = await (await fetch(`${base}/history/NQ`)).json();
  assert.equal(body.to, iso(now.ms));
  assert.equal(Date.parse(body.to) - Date.parse(body.from), 24 * 60 * MIN);

  // Restart: what was stored is still there.
  await new Promise((resolve) => service.server.close(resolve));
  service = start();
  address = await listen(service);
  base = `http://127.0.0.1:${address.port}`;
  body = await (await fetch(`${base}/history/NQ?from=${iso(T0)}&to=${iso(now.ms)}&fields=resilience`)).json();
  assert.deepEqual(body.points.map((point) => point.values.resilience), [1.5, 2.5]);
  await new Promise((resolve) => service.server.close(resolve));

  // Off by default: answers say so and no capture touches the disk.
  const off = createService({ env: {}, config: { host: '127.0.0.1', port: 0 } });
  const offAddress = await listen(off);
  const offBase = `http://127.0.0.1:${offAddress.port}`;
  assert.deepEqual((await (await fetch(`${offBase}/status`)).json()).history, { enabled: false });
  assert.equal((await (await fetch(`${offBase}/history/NQ`)).json()).enabled, false);
  await new Promise((resolve) => off.server.close(resolve));

  // A status call with no history object still works, for callers of the exported helper.
  assert.deepEqual(status(off.store, off.config).history, { enabled: false });
}

// Study series from the page reader: history only, idempotent, served under their own names,
// and the levels snapshot is untouched.
{
  const dataDir = tempDir();
  const now = { ms: T0 + 10 * MIN };
  const service = createService({
    env: {},
    config: { host: '127.0.0.1', port: 0, dataDir },
    clock: () => new Date(now.ms)
  });
  const address = await listen(service);
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body) => fetch(`${base}/capture/api`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: body.endpoint, method: 'PAGE_READER', status: 200, capturedAt: iso(now.ms), body: JSON.stringify(body.body) })
  });
  assert.equal((await post({
    endpoint: '/page-reader/display',
    body: { type: 'rs_snapshot', levels: [{ symbol: 'MNQ', name: 'HP', kind: 'hp', price: 30000 }], stats: {} }
  })).status, 200);
  const before = await (await fetch(`${base}/snapshot`)).json();

  const series = {
    endpoint: '/page-reader/series',
    body: {
      type: 'rs_series',
      source: 'page-reader',
      series: {
        MNQ: [
          { t: iso(T0), values: { 'res.hg': 1.25, 'res.hp': 3.75, 'arb.speed': -0.5 } },
          { t: iso(T0 + MIN), values: { 'res.hg': 1.5, 'res.hp': 3.75, 'arb.speed': 0.75 } },
          // Not a series name: dropped, never stored.
          { t: iso(T0 + 2 * MIN), values: { 'Not A Field': 1, 'res.hg': 'text' } }
        ]
      }
    }
  };
  assert.equal((await post(series)).status, 200);
  assert.equal((await post(series)).status, 200, 'the same batch again');

  const after = await (await fetch(`${base}/snapshot`)).json();
  assert.deepEqual(after.symbols, before.symbols, 'the snapshot is untouched');
  assert.equal(after.source.state, before.source.state);

  const body = await (await fetch(`${base}/history/NQ?from=${iso(T0)}&to=${iso(now.ms)}`)).json();
  assert.ok(body.fields.includes('res.hg') && body.fields.includes('arb.speed'), 'stored series fields are listed by default');
  assert.deepEqual(body.points.map((point) => point.values), [
    { 'arb.speed': -0.5, 'res.hg': 1.25, 'res.hp': 3.75 },
    { 'arb.speed': 0.75, 'res.hg': 1.5, 'res.hp': 3.75 }
  ], 'each point once');
  assert.ok(!body.fields.includes('Not A Field'));
  const lines = fileLines(dataDir);
  assert.equal(lines.length, 2, 'the repeat wrote nothing');
  await new Promise((resolve) => service.server.close(resolve));
}

for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
console.log('Stats history tests passed');
