import type { Work } from './types.ts';

const SEASON = /^(\d{4})-(winter|spring|summer|autumn)$/;
const SEASON_LABELS = { winter: '冬', spring: '春', summer: '夏', autumn: '秋' } as const;
// Later in the year sorts first when the year is the same.
const SEASON_RANK = { winter: 0, spring: 1, summer: 2, autumn: 3 } as const;

type SeasonName = keyof typeof SEASON_LABELS;

function parseSeason(season: string): { year: string; name: SeasonName } | null {
  const m = SEASON.exec(season);
  return m ? { year: m[1]!, name: m[2] as SeasonName } : null;
}

// The work's season, or undefined when it has none (or an unusable one).
export function seasonOf(work: Work): string | undefined {
  return work.season && SEASON.test(work.season) ? work.season : undefined;
}

// "2026-autumn" -> "2026年秋"
export function seasonLabel(season: string): string {
  const s = parseSeason(season);
  return s ? `${s.year}年${SEASON_LABELS[s.name]}` : season;
}

// Newest season first.
export function compareSeasons(a: string, b: string): number {
  const x = parseSeason(a);
  const y = parseSeason(b);
  if (!x || !y) return a.localeCompare(b);
  return y.year.localeCompare(x.year) || SEASON_RANK[y.name] - SEASON_RANK[x.name];
}
