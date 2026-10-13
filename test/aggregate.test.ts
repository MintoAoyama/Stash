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

test('watching lists works with episode logs, most recently logged first, with the highest episode logged', () => {
  const data = buildSiteData([
    work('a1', { logs: [log({ id: 'x', episode: 1, loggedAt: '2026-10-05' }), log({ id: 'y', author: 'そら', episode: 2, episodeEnd: 4, loggedAt: '2026-10-06' })] }),
    work('b2', { logs: [log({ id: 'x', episode: 7, loggedAt: '2026-10-12' })], episodeCount: 12 }),
    work('c3', { logs: [log({ id: 'x', loggedAt: '2026-10-13' })] }),
  ]);
  assert.deepEqual(data.watching, [
    { id: 'b2', title: '作品 b2', channel: '', episode: 7, episodeCount: 12, loggedAt: '2026-10-12' },
    { id: 'a1', title: '作品 a1', channel: '', episode: 4, episodeCount: null, loggedAt: '2026-10-06' },
  ]);
});

test('the date of a watching entry is the latest of all its logs, including ones without an episode', () => {
  const data = buildSiteData([work('a1', { logs: [log({ id: 'x', episode: 3, loggedAt: '2026-10-05' }), log({ id: 'y', loggedAt: '2026-10-09' })] })]);
  assert.equal(data.watching[0]?.loggedAt, '2026-10-09');
});

test('watching is limited to the 12 most recent works', () => {
  const works = Array.from({ length: 15 }, (_, i) => work(`w${i}`, { logs: [log({ id: 'x', episode: 1, loggedAt: `2026-10-${String(i + 1).padStart(2, '0')}` })] }));
  const data = buildSiteData(works);
  assert.equal(data.watching.length, 12);
  assert.equal(data.watching[0]?.id, 'w14');
  assert.equal(data.watching[11]?.id, 'w3');
});

test('watching leaves out works whose length is known and that every author has watched to the end', () => {
  const both = (episodeEnd: number) => [log({ id: 'x', episode: 1, episodeEnd }), log({ id: 'y', author: 'そら', episode: 1, episodeEnd })];
  const data = buildSiteData([
    work('a1', { logs: both(3), episodeCount: 3 }),
    work('b2', { logs: both(3), episodeCount: 4 }),
    work('c3', { logs: [log({ id: 'x', episode: 1, episodeEnd: 3 }), log({ id: 'y', author: 'そら', episode: 1 })], episodeCount: 3 }),
    work('d4', { logs: both(3) }),
  ]);
  assert.deepEqual(data.watching.map((w) => w.id), ['b2', 'c3', 'd4']);
});

test('watching entries carry the channel of the work, or the one its logs mention most', () => {
  const onAir = (channel: string) => log({ id: 'x', episode: 1, program: { channel, date: '2026-10-11' } });
  const data = buildSiteData([work('a1', { channel: 'NHK総合', logs: [onAir('ＢＳ')] }), work('b2', { logs: [onAir('TBS')] }), work('c3', { logs: [log({ episode: 1 })] })]);
  assert.deepEqual(data.watching.map((w) => [w.id, w.channel]), [['a1', 'NHK総合'], ['b2', 'TBS'], ['c3', '']]);
});
