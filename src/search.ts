import { channelOf } from './channel.ts';
import { compareNewestFirst, logDate, logHeading } from './episodes.ts';
import { GENRE_LABELS, genreMajors } from './genre.ts';
import { plainText } from './markdown.ts';
import { seasonLabel, seasonOf } from './season.ts';
import { MEDIA_TYPE_LABELS, type Log, type Work } from './types.ts';

// data/search.json, which the search page (assets/search.js) matches in the browser.
export interface SearchData {
  // Most recently logged first. meta is what the cards of a list show of a work, and also searched.
  works: {
    id: string;
    title: string;
    meta: string;
    tags: string[];
    date: string | null;
    // Newest first. program is the title it was broadcast under, when it says more than the work's title and the subtitle.
    logs: { id: string; date: string; author: string; rating: number | null; heading: string; program: string; text: string }[];
  }[];
}

function workMeta(w: Work): string {
  const season = seasonOf(w);
  return [
    MEDIA_TYPE_LABELS[w.type],
    genreMajors(w).map((g) => GENRE_LABELS[g]).join('・'),
    channelOf(w),
    w.airtime ?? '',
    season ? seasonLabel(season) : '',
    w.platform ?? '',
    (w.creators ?? []).join('、'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function programTitle(w: Work, l: Log): string {
  const title = l.program?.title ?? '';
  return title === w.title || (l.subtitle && title.includes(l.subtitle)) ? '' : title;
}

export function buildSearchData(works: Iterable<Work>): SearchData {
  const list = [...works].map((w) => {
    const logs = [...w.logs].sort(compareNewestFirst).map((l) => ({
      id: l.id,
      date: logDate(l),
      author: l.author,
      rating: l.rating ?? null,
      heading: logHeading(l),
      program: programTitle(w, l),
      text: plainText(l.text),
    }));
    return { id: w.id, title: w.title, meta: workMeta(w), tags: w.tags, date: logs[0]?.date ?? null, logs };
  });
  list.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id));
  return { works: list };
}
