import { channelOf } from './channel.ts';
import { highestEpisode, isFinished } from './episodes.ts';
import { seasonOf } from './season.ts';
import type { MediaType, Work } from './types.ts';

export interface SiteData {
  // byType and seasons count every work, including those without logs, because they decide which navigation links lead to a page.
  counts: { works: number; logs: number; byType: Partial<Record<MediaType, number>>; seasons: number };
  recent: { id: string; title: string; type: MediaType; loggedAt: string; author: string; rating: number | null }[];
  // Works with episode logs that are neither finished nor idle, most recently logged first; episode is the highest one logged.
  watching: { id: string; title: string; channel: string; episode: number; episodeCount: number | null; loggedAt: string }[];
  years: { year: string; logs: number }[];
  // "MM-dd" -> records on that day in any year, for "on this day"
  days: Record<string, { year: string; id: string; title: string }[]>;
  // "yyyy-MM-dd" -> number of records per media type, for the activity heatmap
  activity: Record<string, Partial<Record<MediaType, number>>>;
}

const RECENT_LIMIT = 30;
const WATCHING_LIMIT = 12;
// How long a work may go without a log before it stops counting as being watched, measured from the newest log of the whole data set so that site.json only changes with the data.
export const WATCHING_MAX_IDLE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS;
}

function watchingOf(works: Work[], newest: string): SiteData['watching'] {
  return works
    .flatMap((w) => {
      const episode = highestEpisode(w);
      const loggedAt = w.logs.map((l) => l.loggedAt).sort().at(-1) ?? '';
      if (episode === null || isFinished(w) || daysBetween(loggedAt, newest) > WATCHING_MAX_IDLE_DAYS) return [];
      return [{ id: w.id, title: w.title, channel: channelOf(w), episode, episodeCount: w.episodeCount ?? null, loggedAt }];
    })
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt) || a.id.localeCompare(b.id))
    .slice(0, WATCHING_LIMIT);
}

export function buildSiteData(works: Iterable<Work>): SiteData {
  const all = [...works];
  const entries = all.flatMap((w) => w.logs.map((l) => ({ w, l })));
  entries.sort((a, b) => b.l.loggedAt.localeCompare(a.l.loggedAt) || a.l.id.localeCompare(b.l.id));

  const years = new Map<string, number>();
  const days: SiteData['days'] = {};
  const activity: SiteData['activity'] = {};
  const workIds = new Set<string>();
  for (const { w, l } of entries) {
    workIds.add(w.id);
    const year = l.loggedAt.slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + 1);
    const day = l.loggedAt.slice(5, 10);
    const list = (days[day] ??= []);
    if (!list.some((d) => d.year === year && d.id === w.id)) list.push({ year, id: w.id, title: w.title });
    const counts = (activity[l.loggedAt] ??= {});
    counts[w.type] = (counts[w.type] ?? 0) + 1;
  }

  const byType: SiteData['counts']['byType'] = {};
  for (const w of all) byType[w.type] = (byType[w.type] ?? 0) + 1;

  return {
    counts: { works: workIds.size, logs: entries.length, byType, seasons: new Set(all.map(seasonOf).filter(Boolean)).size },
    recent: entries.slice(0, RECENT_LIMIT).map(({ w, l }) => ({
      id: w.id,
      title: w.title,
      type: w.type,
      loggedAt: l.loggedAt,
      author: l.author,
      rating: l.rating ?? null,
    })),
    watching: watchingOf(all, entries[0]?.l.loggedAt ?? ''),
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, logs]) => ({ year, logs })),
    days,
    activity,
  };
}
