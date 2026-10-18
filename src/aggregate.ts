import { channelOf } from './channel.ts';
import { highestEpisode, logDate } from './episodes.ts';
import { seasonOf } from './season.ts';
import type { MediaType, Work } from './types.ts';

export interface SiteData {
  // byType and seasons count every work, including those without logs, because they decide which navigation links lead to a page.
  // authors decides whether author names are shown: with a single author they say nothing.
  counts: { works: number; logs: number; byType: Partial<Record<MediaType, number>>; seasons: number; authors: number };
  // Newest loggedAt first; aired is the day the log belongs to when that is not loggedAt.
  recent: { id: string; title: string; type: MediaType; loggedAt: string; aired?: string; author: string; rating: number | null }[];
  // Season -> its works, most recently logged first and works without logs last; episode is the highest one logged.
  // The home page picks the season of the day it is opened, so every season is listed.
  seasonWorks: Record<string, { id: string; title: string; channel: string; episode: number | null; episodeCount: number | null; loggedAt: string | null }[]>;
  // years and days go by the day a log belongs to (logDate), like the year and month pages they lead to; months holds the records of January to December.
  years: { year: string; logs: number; months: number[] }[];
  // "MM-dd" -> records on that day in any year, for "on this day"
  days: Record<string, { year: string; id: string; title: string }[]>;
  // "yyyy-MM-dd" (the day it was logged) -> number of records per media type, for the activity heatmap
  activity: Record<string, Partial<Record<MediaType, number>>>;
}

const RECENT_LIMIT = 30;

function seasonWorksOf(works: Work[]): SiteData['seasonWorks'] {
  const bySeason: SiteData['seasonWorks'] = {};
  for (const w of works) {
    const season = seasonOf(w);
    if (!season) continue;
    const loggedAt = w.logs.map((l) => l.loggedAt).sort().at(-1) ?? null;
    (bySeason[season] ??= []).push({ id: w.id, title: w.title, channel: channelOf(w), episode: highestEpisode(w), episodeCount: w.episodeCount ?? null, loggedAt });
  }
  for (const list of Object.values(bySeason)) {
    list.sort((a, b) => (b.loggedAt ?? '').localeCompare(a.loggedAt ?? '') || a.id.localeCompare(b.id));
  }
  return bySeason;
}

export function buildSiteData(works: Iterable<Work>): SiteData {
  const all = [...works];
  const entries = all.flatMap((w) => w.logs.map((l) => ({ w, l })));
  entries.sort((a, b) => b.l.loggedAt.localeCompare(a.l.loggedAt) || a.l.id.localeCompare(b.l.id));

  const years = new Map<string, number[]>();
  const days: SiteData['days'] = {};
  const activity: SiteData['activity'] = {};
  const workIds = new Set<string>();
  for (const { w, l } of entries) {
    workIds.add(w.id);
    const year = logDate(l).slice(0, 4);
    const months = years.get(year) ?? Array<number>(12).fill(0);
    months[Number(logDate(l).slice(5, 7)) - 1]!++;
    years.set(year, months);
    const day = logDate(l).slice(5, 10);
    const list = (days[day] ??= []);
    if (!list.some((d) => d.year === year && d.id === w.id)) list.push({ year, id: w.id, title: w.title });
    const counts = (activity[l.loggedAt] ??= {});
    counts[w.type] = (counts[w.type] ?? 0) + 1;
  }

  const byType: SiteData['counts']['byType'] = {};
  for (const w of all) byType[w.type] = (byType[w.type] ?? 0) + 1;

  return {
    counts: {
      works: workIds.size,
      logs: entries.length,
      byType,
      seasons: new Set(all.map(seasonOf).filter(Boolean)).size,
      authors: new Set(entries.map(({ l }) => l.author)).size,
    },
    recent: entries.slice(0, RECENT_LIMIT).map(({ w, l }) => ({
      id: w.id,
      title: w.title,
      type: w.type,
      loggedAt: l.loggedAt,
      ...(logDate(l) !== l.loggedAt ? { aired: logDate(l) } : {}),
      author: l.author,
      rating: l.rating ?? null,
    })),
    seasonWorks: seasonWorksOf(all),
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, months]) => ({ year, logs: months.reduce((a, b) => a + b, 0), months })),
    days,
    activity,
  };
}
