import { seasonOf } from './season.ts';
import type { MediaType, Work } from './types.ts';

export interface SiteData {
  // byType and seasons count every work, including those without logs, because they decide which navigation links lead to a page.
  counts: { works: number; logs: number; byType: Partial<Record<MediaType, number>>; seasons: number };
  recent: { id: string; title: string; type: MediaType; loggedAt: string; author: string; rating: number | null }[];
  years: { year: string; logs: number }[];
  // "MM-dd" -> records on that day in any year, for "on this day"
  days: Record<string, { year: string; id: string; title: string }[]>;
  // "yyyy-MM-dd" -> number of records per media type, for the activity heatmap
  activity: Record<string, Partial<Record<MediaType, number>>>;
}

const RECENT_LIMIT = 30;

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
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, logs]) => ({ year, logs })),
    days,
    activity,
  };
}
