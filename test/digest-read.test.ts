import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

let dir: string;
const night = (name: string, lines: string[]) => writeFileSync(join(dir, `${name}.jsonl`), lines.join('\n'));
const l = (o: object) => JSON.stringify(o);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a bad night name', () => {
    night('2026-01-01', []);
    expect(readNight(dir, '../2026-01-01')).toBeNull();
    expect(readNight(dir, '2026-1-1')).toBeNull();
    expect(readNight(dir, '2026-01-01.jsonl')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    night('2026-01-01', []);
    expect(readNight(dir, '2026-01-01')).toEqual({ rows: [], badLines: 0 });
  });

  it('keeps a row with a null or missing owner', () => {
    night('2026-01-01', [
      l({ at: '2026-01-01T05:00:00+01:00', job: 'a', status: 'ok', owner: null }),
      l({ at: '2026-01-01T05:00:00+01:00', job: 'b', status: 'ok' }),
    ]);
    const n = readNight(dir, '2026-01-01');
    expect(n?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
    ]);
    expect(n?.badLines).toBe(0);
  });

  it('counts bad JSON and wrong-shape lines, skips blank lines', () => {
    night('2026-01-01', [
      l({ at: 't1', job: 'a', status: 'ok', owner: 'x' }),
      '{"at":"t2","job":"a"',
      '',
      '   ',
      l({ at: 't3', job: 'a', status: 'done', owner: 'x' }),
      l({ at: 't4', job: 1, status: 'ok', owner: 'x' }),
      l({ at: 't5', job: 'a', status: 'ok', owner: 7 }),
      l({ at: 't6', job: 'a', status: 'fail', owner: 'x', error: 42 }),
      '[1,2]',
      'null',
    ]);
    expect(readNight(dir, '2026-01-01')).toEqual({
      rows: [{ job: 'a', owner: 'x', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: 't1', lastAt: 't1' }],
      badLines: 7,
    });
  });

  it('counts retries and takes last status, error, owner and times in file order', () => {
    night('2026-01-01', [
      l({ at: '2026-01-01T01:00:00+01:00', job: 'z', status: 'retry', owner: 'old', error: 'e1' }),
      l({ at: '2026-01-01T01:30:00+01:00', job: 'm', status: 'ok', owner: 'o' }),
      l({ at: '2026-01-01T02:00:00+01:00', job: 'z', status: 'retry', owner: 'old', error: 'e2' }),
      l({ at: '2026-01-01T03:00:00+01:00', job: 'z', status: 'fail', owner: 'new', error: 'e3' }),
    ]);
    expect(readNight(dir, '2026-01-01')?.rows).toEqual([
      { job: 'm', owner: 'o', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-01-01T01:30:00+01:00', lastAt: '2026-01-01T01:30:00+01:00' },
      { job: 'z', owner: 'new', runs: 3, retries: 2, lastStatus: 'fail', lastError: 'e3', firstAt: '2026-01-01T01:00:00+01:00', lastAt: '2026-01-01T03:00:00+01:00' },
    ]);
  });

  it('reads the real fixture runs/2026-10-28: 5 jobs, 1 bad line', () => {
    const n = readNight('runs', '2026-10-28');
    expect(n?.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(n?.badLines).toBe(1);
  });
});
