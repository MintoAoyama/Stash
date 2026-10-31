import { channelOf } from './channel.ts';
import { highestEpisode, logDate, logHeading } from './episodes.ts';
import { digest } from './markdown.ts';
import { seasonOf } from './season.ts';
import type { Log, MediaType, Work } from './types.ts';

export interface SiteData {
  // byType and seasons count every work, including those without logs, because they decide which navigation links lead to a page.
  // authors decides whether author names are shown: with a single author they say nothing.
  counts: { works: number; logs: number; byType: Partial<Record<MediaType, number>>; seasons: number; authors: number };
  // Newest loggedAt first; aired is the day the log belongs to when that is not loggedAt. The home page leaves out the
  // works of the season of the day it is opened, which it shows apart, so there are more than it shows.
  // heading is the episode and subtitle; digest the start of the text as the work page shows it.
  recent: (LogDigest & { id: string; title: string; type: MediaType; log: string; loggedAt: string; aired?: string; author: string; season?: string })[];
  // Season -> its works, most recently logged first and works without logs last; episode is the highest one logged,
  // and the digest is of the latest log. The home page picks the season of the day it is opened, so every season is listed.
  seasonWorks: Record<string, (Partial<LogDigest> & { id: string; title: string; channel: string; episode: number | null; episodeCount: number | null; loggedAt: string | null })[]>;
  // years and days go by the day a log belongs to (logDate), like the year and month pages they lead to; months holds the records of January to December.
  years: { year: string; logs: number; months: number[] }[];
  // "MM-dd" -> records on that day in any year, for "on this day"
  days: Record<string, { year: string; id: string; title: string }[]>;
  // "yyyy-MM-dd" (the day it was logged) -> number of records per media type, for the activity heatmap
  activity: Record<string, Partial<Record<MediaType, number>>>;
}

const RECENT_LIMIT = 60;

type LogDigest = { heading: string; digest: string; rating: number | null };

function logDigest(l: Log): LogDigest {
  return { heading: logHeading(l), digest: digest(l.text).text, rating: l.rating ?? null };
}

function seasonWorksOf(works: Work[]): SiteData['seasonWorks'] {
  const bySeason: SiteData['seasonWorks'] = {};
  for (const w of works) {
    const season = seasonOf(w);
    if (!season) continue;
    const latest = [...w.logs].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt) || b.id.localeCompare(a.id))[0];
    const loggedAt = latest?.loggedAt ?? null;
    (bySeason[season] ??= []).push({
      id: w.id, title: w.title, channel: channelOf(w), episode: highestEpisode(w), episodeCount: w.episodeCount ?? null, loggedAt,
      ...(latest ? logDigest(latest) : {}),
    });
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
      log: l.id,
      loggedAt: l.loggedAt,
      ...(logDate(l) !== l.loggedAt ? { aired: logDate(l) } : {}),
      author: l.author,
      ...(seasonOf(w) ? { season: seasonOf(w) } : {}),
      ...logDigest(l),
    })),
    seasonWorks: seasonWorksOf(all),
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, months]) => ({ year, logs: months.reduce((a, b) => a + b, 0), months })),
    days,
    activity,
  };
}
