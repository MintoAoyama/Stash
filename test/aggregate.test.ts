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
  assert.deepEqual(data.counts, { works: 0, logs: 0, byType: {}, seasons: 0, authors: 0 });
});

test('authors counts the distinct authors of all logs, which decides whether their names are shown', () => {
  assert.equal(buildSiteData([work('a1', { logs: [log(), log({ id: 'l2' })] }), work('b2')]).counts.authors, 1);
  assert.equal(buildSiteData([work('a1'), work('b2', { logs: [log({ author: 'そら' })] })]).counts.authors, 2);
});

const oldRecording = log({ id: 'o', loggedAt: '2026-10-18', program: { channel: 'NHK総合', date: '2014-11-27' } });

test('years and on-this-day go by the broadcast day, the activity calendar by the day it was logged', () => {
  const data = buildSiteData([work('a1', { logs: [oldRecording] }), work('b2')]);
  assert.deepEqual(data.years.map((y) => [y.year, y.logs]), [['2026', 1], ['2014', 1]]);
  assert.equal(data.years[1]?.months[10], 1);
  assert.deepEqual(data.days['11-27'], [{ year: '2014', id: 'a1', title: '作品 a1' }]);
  assert.equal(data.days['10-18'], undefined);
  assert.deepEqual(data.activity['2026-10-18'], { tv: 1 });
  assert.equal(data.activity['2014-11-27'], undefined);
});

test('recent logs go by the day they were logged and name the broadcast day when it is another', () => {
  const data = buildSiteData([work('a1', { logs: [oldRecording] }), work('b2', { logs: [log({ id: 'n', loggedAt: '2026-10-17' })] })]);
  assert.deepEqual(data.recent.map((r) => [r.id, r.loggedAt, r.aired]), [['a1', '2026-10-18', '2014-11-27'], ['b2', '2026-10-17', undefined]]);
  assert.ok(!('aired' in data.recent[1]!));
});

test('works that were given as a one-shot iterator are all counted', () => {
  const works = new Map([work('a1'), work('b2')].map((w) => [w.id, w]));
  assert.equal(buildSiteData(works.values()).counts.byType.tv, 2);
});

test('seasonWorks groups works by season, most recently logged first, works without logs last', () => {
  const data = buildSiteData([
    work('a1', { season: '2026-autumn', logs: [log({ id: 'x', episode: 1, loggedAt: '2026-10-05' }), log({ id: 'y', author: 'そら', episode: 2, episodeEnd: 4, loggedAt: '2026-10-06' })] }),
    work('b2', { season: '2026-autumn', logs: [log({ id: 'x', episode: 7, loggedAt: '2026-10-12' })], episodeCount: 12 }),
    work('c3', { season: '2026-autumn', logs: [] }),
    work('d4', { season: '2026-summer', logs: [log({ id: 'x', loggedAt: '2026-08-01' })] }),
    work('e5', { logs: [log({ id: 'x' })] }),
  ]);
  assert.deepEqual(data.seasonWorks, {
    '2026-autumn': [
      { id: 'b2', title: '作品 b2', channel: '', episode: 7, episodeCount: 12, loggedAt: '2026-10-12', heading: '第7話', digest: '', rating: null },
      { id: 'a1', title: '作品 a1', channel: '', episode: 4, episodeCount: null, loggedAt: '2026-10-06', heading: '第2〜4話', digest: '', rating: null },
      { id: 'c3', title: '作品 c3', channel: '', episode: null, episodeCount: null, loggedAt: null },
    ],
    '2026-summer': [{ id: 'd4', title: '作品 d4', channel: '', episode: null, episodeCount: null, loggedAt: '2026-08-01', heading: '', digest: '', rating: null }],
  });
});

test('seasonWorks keeps works that have been watched to the end', () => {
  const data = buildSiteData([work('a1', { season: '2026-autumn', episodeCount: 3, logs: [log({ id: 'x', episode: 1, episodeEnd: 3 })] })]);
  assert.deepEqual(data.seasonWorks['2026-autumn']?.map((w) => w.id), ['a1']);
});

test('seasonWorks entries carry the channel of the work, or the one its logs mention most', () => {
  const onAir = (channel: string) => log({ id: 'x', episode: 1, program: { channel, date: '2026-10-11' } });
  const data = buildSiteData([
    work('a1', { season: '2026-autumn', channel: 'NHK総合', logs: [onAir('ＢＳ')] }),
    work('b2', { season: '2026-autumn', logs: [onAir('TBS')] }),
  ]);
  assert.deepEqual(data.seasonWorks['2026-autumn']?.map((w) => [w.id, w.channel]), [['a1', 'NHK総合'], ['b2', 'TBS']]);
});

test('years carry the number of records of each month, by the day a log belongs to', () => {
  const data = buildSiteData([
    work('a1', { logs: [log({ id: 'x', loggedAt: '2026-10-11' }), log({ id: 'y', loggedAt: '2026-10-12' }), log({ id: 'z', loggedAt: '2026-03-01' })] }),
    work('b2', { logs: [log({ id: 'x', loggedAt: '2025-12-31' })] }),
  ]);
  assert.deepEqual(data.years, [
    { year: '2026', logs: 3, months: [0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0] },
    { year: '2025', logs: 1, months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
  ]);
});

test('the home page gets the start of each log as plain text, with its episode, and the season of its work', () => {
  const long = `**強調**と[リンク](https://example.com)。${'あ'.repeat(200)}`;
  const data = buildSiteData([
    work('a1', { season: '2026-autumn', logs: [log({ id: 'x', episode: 3, subtitle: '再会', rating: 4, text: long }), log({ id: 'y', loggedAt: '2026-10-01', text: '前の回' })] }),
    work('b2', { logs: [log({ id: 'z', loggedAt: '2026-10-05', text: '- 一つ目\n- 二つ目' })] }),
  ]);
  const latest = data.seasonWorks['2026-autumn']![0]!;
  assert.equal(latest.heading, '第3話 再会');
  assert.equal(latest.rating, 4);
  assert.ok(latest.digest!.startsWith('強調とリンク。あ'));
  assert.equal(Array.from(latest.digest!).length, 141, 'cut where the work page cuts, with an ellipsis');
  assert.deepEqual(data.recent.map((r) => [r.log, r.season]), [['x', '2026-autumn'], ['z', undefined], ['y', '2026-autumn']]);
  assert.equal(data.recent[1]!.digest, '・一つ目\n・二つ目');
});
