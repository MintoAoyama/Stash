import type { Work } from './types.ts';

// Genres are ARIB STD-B10 content genres, as the program guides give them: the major and the minor genre as two hex
// digits ("30" is ドラマ / 国内ドラマ), or the major alone ("3"). The pages only tell the majors apart.
export const GENRE_CODE = /^[0-9A-F]{1,2}$/;

// By major, shortened from the names of the standard for the filters and the headings.
export const GENRE_LABELS = ['ニュース', 'スポーツ', '情報', 'ドラマ', '音楽', 'バラエティ', '映画', 'アニメ・特撮', 'ドキュメンタリー', '劇場・公演', '趣味・教育', '福祉'];

// The majors of a work, main one first.
export function genreMajors(work: Work): number[] {
  const majors = (work.genres ?? []).map((g) => parseInt(g.charAt(0), 16)).filter((m) => m < GENRE_LABELS.length);
  return [...new Set(majors)];
}
