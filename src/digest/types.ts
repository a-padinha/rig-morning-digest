// Plan morning-digest § 1. Types only: the reader and every part of § 2 build against these.

/** A run's outcome, as written in the log. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl, once parsed. */
export type LogLine = {
  /** Time as written in the log, offset kept (never converted to UTC). */
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. Missing data (null) renders as `—`. */
export type DigestRow = {
  job: string;
  /** Owner of the job; null when the log has none. */
  owner: string | null;
  /** Number of lines for this job. */
  runs: number;
  /** Number of lines for this job with status "retry". */
  retries: number;
  /** Status of the job's last line. */
  lastStatus: RunStatus;
  /** Error of the job's last line; null when it has none. */
  lastError: string | null;
  /** `at` of the job's first line, original string with its offset. */
  firstAt: string;
  /** `at` of the job's last line, original string with its offset. */
  lastAt: string;
};

/** A night's digest: its rows plus the count of lines that did not parse. */
export type Night = {
  rows: DigestRow[];
  /** Lines that did not parse; counted, never thrown. */
  badLines: number;
};

/** Reads runs/<night>.jsonl from runsDir. null when the night has no file. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
