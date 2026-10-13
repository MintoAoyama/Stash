import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSiteData } from '../src/aggregate.ts';
import type { Log, Work } from '../src/types.ts';

const log = (over: Partial<Log> = {}): Log => ({ id: 'l1', author: 'あお', loggedAt: '2026-10-11', text: '', ...over });
const work = (id: string, over: Partial<Work> = {}): Work => ({ id, type: 'tv', title: `作品 ${id}`, path: '', tags: [], logs: [log()], ...over });

test('counts per media type and of seasons decide which navigation links are shown', () => {
  const data = buildSiteData([
    work('a1'),
    work('b2', { season: '2026-autumn' }),
    work('c3', { season: '2026-autumn' }),
    work('d4', { type: 'movie', season: '2026-summer' }),
    work('e5', { type: 'book', logs: [] }),
  ]);
  assert.deepEqual(data.counts.byType, { tv: 3, movie: 1, book: 1 });
  assert.equal(data.counts.seasons, 2);
  assert.equal(data.counts.works, 4);
});

test('an empty site has no types or seasons', () => {
  const data = buildSiteData([]);
  assert.deepEqual(data.counts, { works: 0, logs: 0, byType: {}, seasons: 0 });
});

test('works that were given as a one-shot iterator are all counted', () => {
  const works = new Map([work('a1'), work('b2')].map((w) => [w.id, w]));
  assert.equal(buildSiteData(works.values()).counts.byType.tv, 2);
});
