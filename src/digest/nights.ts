// Plan morning-digest § 2c: nights on disk with their line counts, for the status board.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number>;

export type NightSummary = {
  night: string;
  /** Log lines by status; null when the file could not be read. Unparsed lines are not counted. */
  counts: NightCounts | null;
};

/** Nights on disk = runs/<YYYY-MM-DD>.jsonl, ascending. */
export function listNights(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort();
  } catch {
    return [];
  }
}

/** Counts log lines by status (not jobs by last status). */
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const l of text.split(/\r?\n/)) {
    const line = l.trim() === '' ? null : parseLine(l);
    if (line) counts[line.status]++;
  }
  return counts;
}

export function summarizeNights(runsDir: string): NightSummary[] {
  return listNights(runsDir).map((night) => ({ night, counts: countNight(runsDir, night) }));
}
