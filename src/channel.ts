import type { Work } from './types.ts';

// The work's own channel, else the one its logs mention most often (the most recent log's on a tie).
export function channelOf(work: Work): string {
  if (work.channel) return work.channel;
  const stats = new Map<string, { count: number; last: number }>();
  const chronological = [...work.logs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));
  chronological.forEach((log, i) => {
    const channel = log.program?.channel;
    if (channel) stats.set(channel, { count: (stats.get(channel)?.count ?? 0) + 1, last: i });
  });
  const ranked = [...stats].sort(([, a], [, b]) => b.count - a.count || b.last - a.last);
  return ranked[0]?.[0] ?? '';
}
