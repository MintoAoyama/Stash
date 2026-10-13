import type { Log, Work } from './types.ts';

// Inclusive range of episodes a log covers; null when it has no episode number.
export function episodeSpan(log: Log): [number, number] | null {
  if (log.episode == null) return null;
  return [log.episode, Math.max(log.episode, log.episodeEnd ?? 0)];
}

// "第3話", "第3〜5話", or "" when the log has no episode number.
export function episodeLabel(log: Log): string {
  const span = episodeSpan(log);
  if (!span) return '';
  return span[1] > span[0] ? `第${span[0]}〜${span[1]}話` : `第${span[0]}話`;
}

// Label and subtitle, or "" when the log has neither.
export function logHeading(log: Log): string {
  return [episodeLabel(log), log.subtitle].filter(Boolean).join(' ');
}

// Viewing order: by episode (logs without one last), then by date.
export function compareLogs(a: Log, b: Log): number {
  const x = a.episode ?? Infinity;
  const y = b.episode ?? Infinity;
  return (x === y ? 0 : x < y ? -1 : 1) || a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id);
}

// Newest date first; within a day, the later episode first.
export function compareNewestFirst(a: Log, b: Log): number {
  return b.loggedAt.localeCompare(a.loggedAt) || (b.episode ?? -1) - (a.episode ?? -1) || b.id.localeCompare(a.id);
}

// The previous and next log of the same author, in viewing order.
export function neighbours(work: Work, log: Log): { prev?: Log; next?: Log } {
  const ordered = work.logs.filter((l) => l.author === log.author).sort(compareLogs);
  const i = ordered.findIndex((l) => l.id === log.id);
  return { prev: ordered[i - 1], next: ordered[i + 1] };
}

// Logs by other authors whose episodes overlap this log's; none for a log without an episode.
export function sameEpisodeLogs(work: Work, log: Log): Log[] {
  const span = episodeSpan(log);
  if (!span) return [];
  return work.logs
    .filter((l) => {
      const other = episodeSpan(l);
      return l.author !== log.author && other !== null && other[0] <= span[1] && span[0] <= other[1];
    })
    .sort(compareLogs);
}

export function highestEpisode(work: Work): number | null {
  const ends = work.logs.flatMap((l) => episodeSpan(l)?.[1] ?? []);
  return ends.length > 0 ? Math.max(...ends) : null;
}

export interface Watched {
  log: Log;
  from: number;
  to: number;
}

export interface ProgressRow {
  author: string;
  // Earliest log first, so that the first watch wins when an episode was logged twice.
  watched: Watched[];
  count: number;
}

export interface Progress {
  total: number;
  // Whether total comes from the work's episodeCount rather than only from what has been logged.
  countKnown: boolean;
  rows: ProgressRow[];
}

// Episodes are numbered from 1; episode 0 is never counted.
function countCovered(watched: Watched[]): number {
  let count = 0;
  let end = 0;
  for (const { from, to } of [...watched].sort((a, b) => a.from - b.from)) {
    const start = Math.max(from, end + 1);
    if (to >= start) count += to - start + 1;
    end = Math.max(end, to);
  }
  return count;
}

export function progressOf(work: Work): Progress | null {
  const highest = highestEpisode(work);
  if (highest === null) return null;
  const total = Math.max(work.episodeCount ?? 0, highest);
  if (total < 1) return null;

  const byAuthor = new Map<string, Watched[]>();
  const chronological = [...work.logs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));
  for (const log of chronological) {
    const span = episodeSpan(log);
    if (!span) continue;
    const list = byAuthor.get(log.author) ?? [];
    list.push({ log, from: span[0], to: span[1] });
    byAuthor.set(log.author, list);
  }
  const rows = [...byAuthor.keys()].sort().map((author) => {
    const watched = byAuthor.get(author) ?? [];
    return { author, watched, count: countCovered(watched) };
  });
  return { total, countKnown: work.episodeCount != null, rows };
}

export function coveringLog(row: ProgressRow, episode: number): Log | undefined {
  return row.watched.find((w) => w.from <= episode && episode <= w.to)?.log;
}
