import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

type ApiDigest = { night: string; badLines: number; rows: { job: string; owner: string | null }[] };

let dir: string;
let config: RigConfig;
const night = (name: string, lines: string[]) => writeFileSync(join(dir, `${name}.jsonl`), lines.join('\n'));
const l = (o: object) => JSON.stringify(o);
const page = (n: string) => createApp(config).request(`/digest/${n}`);
const api = (n: string) => createApp(config).request(`/api/digest/${n}`);

// Written out of job order on purpose: the routes sort by job name.
const normal = [
  l({ at: '2026-01-01T01:00:00+01:00', job: 'zeta/sync', status: 'retry', owner: 'ana' }),
  l({ at: '2026-01-01T01:10:00+01:00', job: 'zeta/sync', status: 'retry', owner: 'ana' }),
  l({ at: '2026-01-01T01:20:00+01:00', job: 'zeta/sync', status: 'retry', owner: 'ana' }),
  l({ at: '2026-01-01T01:30:00+01:00', job: 'zeta/sync', status: 'ok', owner: 'ana' }),
  l({ at: '2026-01-01T02:00:00+01:00', job: 'mid/backup', status: 'fail', owner: 'bo', error: 'disk full' }),
  l({ at: '2026-01-01T03:00:00+01:00', job: 'alpha/rotate', status: 'ok', owner: null }),
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('200 with jobs in order, retries and fail marks, and an em dash for a null owner', async () => {
    night('2026-01-01', normal);
    const res = await page('2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    const a = html.indexOf('alpha/rotate');
    const m = html.indexOf('mid/backup');
    const z = html.indexOf('zeta/sync');
    expect(a).toBeGreaterThan(-1);
    expect(m).toBeGreaterThan(a);
    expect(z).toBeGreaterThan(m);
    expect(html).toContain('disk full');
    expect(html).toMatch(/mid\/backup<\/td>.*?fail<\/td>.*?<td class="warn">fail<\/td>/);
    expect(html).toMatch(/zeta\/sync<\/td>.*?<td class="warn">retries<\/td>/);
    expect(html).toContain('<td>alpha/rotate</td><td>—</td>');
  });

  it('404 for a night with no file', async () => {
    const res = await page('2026-02-02');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('night not found: 2026-02-02');
  });

  it('404 for a malformed night name', async () => {
    const res = await page('bad');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('night not found: bad');
  });

  it('says nothing ran for an empty night', async () => {
    night('2026-01-01', []);
    const res = await page('2026-01-01');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('warns about a bad line and still renders the good rows', async () => {
    night('2026-01-01', [l({ at: 't1', job: 'good/job', status: 'ok', owner: 'ana' }), '{"at":"t2"']);
    const res = await page('2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 lines could not be read');
    expect(html).toContain('good/job');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with sorted rows, retries, fail status and a null owner', async () => {
    night('2026-01-01', normal);
    const res = await api('2026-01-01');
    const body = (await res.json()) as ApiDigest & { rows: Record<string, unknown>[] };
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-01-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/rotate', 'mid/backup', 'zeta/sync']);
    expect(body.rows[0]?.owner).toBeNull();
    expect(body.rows[1]).toMatchObject({ lastStatus: 'fail', lastError: 'disk full', retries: 0 });
    expect(body.rows[2]).toMatchObject({ retries: 3, runs: 4, lastStatus: 'ok' });
  });

  it('404 for a night with no file', async () => {
    const res = await api('2026-02-02');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found', night: '2026-02-02' });
  });

  it('404 for a malformed night name', async () => {
    const res = await api('bad');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found', night: 'bad' });
  });

  it('200 with empty rows for an empty night', async () => {
    night('2026-01-01', []);
    const res = await api('2026-01-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-01-01', badLines: 0, rows: [] });
  });

  it('counts a bad line and keeps the rows intact', async () => {
    night('2026-01-01', [l({ at: 't1', job: 'good/job', status: 'ok', owner: 'ana' }), '{"at":"t2"']);
    const res = await api('2026-01-01');
    const body = (await res.json()) as ApiDigest;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['good/job']);
    expect(body.rows[0]?.owner).toBe('ana');
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for the same night', async () => {
    night('2026-01-01', normal);
    const body = (await (await api('2026-01-01')).json()) as ApiDigest;
    const html = await (await page('2026-01-01')).text();
    const fromPage = [...html.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(fromPage).toEqual(body.rows.map((r) => r.job));
    expect(fromPage).toHaveLength(3);
  });
});
