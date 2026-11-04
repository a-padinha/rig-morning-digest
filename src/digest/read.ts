// Plan morning-digest § 1: reads runs/<night>.jsonl into one row per job.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, LogLine, ReadNight, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isStatus = (v: unknown): v is RunStatus => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

/** Parses one log line at the edge; null when it is not valid JSON or has the wrong shape. */
export function parseLine(text: string): LogLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: LogLine = { at, job, status, owner: owner ?? null };
  if (error !== undefined) line.error = error;
  return line;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;
  for (const text of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (line === null) {
      badLines++;
      continue;
    }
    const prev = byJob.get(line.job);
    byJob.set(line.job, {
      job: line.job,
      owner: line.owner,
      runs: (prev?.runs ?? 0) + 1,
      retries: (prev?.retries ?? 0) + (line.status === 'retry' ? 1 : 0),
      lastStatus: line.status,
      lastError: line.error ?? null,
      firstAt: prev?.firstAt ?? line.at,
      lastAt: line.at,
    });
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
};
