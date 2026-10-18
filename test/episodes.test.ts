import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareLogs, compareNewestFirst, coveringLog, episodeLabel, episodeSpan, highestEpisode, logDate, logHeading, neighbours, progressOf, sameEpisodeLogs } from '../src/episodes.ts';
import type { Log, Work } from '../src/types.ts';

const log = (over: Partial<Log> = {}): Log => ({ id: 'l1', author: 'alice', loggedAt: '2026-10-11', text: '', ...over });
const work = (logs: Log[], over: Partial<Work> = {}): Work => ({ id: 'w1', type: 'tv', title: 'ドラマ', path: '', tags: [], logs, ...over });

test('a log covers its episode, or the range up to episodeEnd', () => {
  assert.deepEqual(episodeSpan(log({ episode: 3 })), [3, 3]);
  assert.deepEqual(episodeSpan(log({ episode: 3, episodeEnd: 5 })), [3, 5]);
  assert.equal(episodeSpan(log()), null);
  assert.equal(episodeSpan(log({ episode: null, episodeEnd: 5 })), null);
});

test('episodeEnd is ignored unless it is greater than episode', () => {
  for (const episodeEnd of [null, 0, 2, 3]) assert.deepEqual(episodeSpan(log({ episode: 3, episodeEnd })), [3, 3], String(episodeEnd));
});

test('labels: single, range, none', () => {
  assert.equal(episodeLabel(log({ episode: 3 })), '第3話');
  assert.equal(episodeLabel(log({ episode: 3, episodeEnd: 5 })), '第3〜5話');
  assert.equal(episodeLabel(log({ episode: 3, episodeEnd: 3 })), '第3話');
  assert.equal(episodeLabel(log()), '');
});

test('the heading joins label and subtitle, whichever exist', () => {
  assert.equal(logHeading(log({ episode: 3, subtitle: '夜の手紙' })), '第3話 夜の手紙');
  assert.equal(logHeading(log({ episode: 3, subtitle: '' })), '第3話');
  assert.equal(logHeading(log({ subtitle: '特別編' })), '特別編');
  assert.equal(logHeading(log()), '');
});

test('viewing order sorts by episode, then date, with episode-less logs last', () => {
  const logs = [
    log({ id: 'e', loggedAt: '2026-10-01' }),
    log({ id: 'c', episode: 2, loggedAt: '2026-10-09' }),
    log({ id: 'b', episode: 2, loggedAt: '2026-10-08' }),
    log({ id: 'a', episode: 1, loggedAt: '2026-10-20' }),
  ];
  assert.deepEqual(logs.sort(compareLogs).map((l) => l.id), ['a', 'b', 'c', 'e']);
});

test('newest first puts the later episode first within a day', () => {
  const logs = [log({ id: 'a', episode: 1 }), log({ id: 'b', episode: 2 }), log({ id: 'c', loggedAt: '2026-10-12' })];
  assert.deepEqual(logs.sort(compareNewestFirst).map((l) => l.id), ['c', 'b', 'a']);
});

test('a log belongs to the broadcast day of its program, else to the day it was logged', () => {
  assert.equal(logDate(log({ loggedAt: '2026-10-18', program: { channel: 'NHK総合', date: '2014-11-27' } })), '2014-11-27');
  assert.equal(logDate(log({ loggedAt: '2026-10-18' })), '2026-10-18');
  assert.equal(logDate(log({ loggedAt: '2026-10-18', program: null })), '2026-10-18');
});

test('newest first goes by the broadcast day, not the day the log was made', () => {
  const logs = [
    log({ id: 'a', loggedAt: '2026-10-18', program: { channel: 'TBS', date: '2026-10-04' } }),
    log({ id: 'b', loggedAt: '2026-10-18', program: { channel: 'TBS', date: '2026-10-11' } }),
    log({ id: 'c', loggedAt: '2026-10-12' }),
  ];
  assert.deepEqual(logs.sort(compareNewestFirst).map((l) => l.id), ['c', 'b', 'a']);
});

test('viewing order still goes by the day the logs were made', () => {
  const logs = [
    log({ id: 'b', episode: 1, loggedAt: '2026-10-18', program: { channel: 'TBS', date: '2026-10-04' } }),
    log({ id: 'a', episode: 1, loggedAt: '2026-10-12', program: { channel: 'TBS', date: '2026-10-11' } }),
  ];
  assert.deepEqual(logs.sort(compareLogs).map((l) => l.id), ['a', 'b']);
});

test('neighbours follow viewing order and stop at both ends', () => {
  const w = work([log({ id: 'b', episode: 2 }), log({ id: 'a', episode: 1 }), log({ id: 'c', episode: 3 })]);
  const ids = (l: Log) => {
    const n = neighbours(w, l);
    return [n.prev?.id, n.next?.id];
  };
  assert.deepEqual(ids(w.logs[1]!), [undefined, 'b']);
  assert.deepEqual(ids(w.logs[0]!), ['a', 'c']);
  assert.deepEqual(ids(w.logs[2]!), ['b', undefined]);
});

test('neighbours never cross to another author', () => {
  const w = work([
    log({ id: 'a1', episode: 1 }),
    log({ id: 'b1', author: 'そら', episode: 1 }),
    log({ id: 'a2', episode: 2 }),
    log({ id: 'b2', author: 'そら', episode: 2 }),
  ]);
  const n = neighbours(w, w.logs[0]!);
  assert.deepEqual([n.prev?.id, n.next?.id], [undefined, 'a2']);
  const m = neighbours(w, w.logs[3]!);
  assert.deepEqual([m.prev?.id, m.next?.id], ['b1', undefined]);
});

test('same-episode logs are the other authors\' logs whose episodes overlap', () => {
  const w = work([
    log({ id: 'a', episode: 3, episodeEnd: 5 }),
    log({ id: 'b', author: 'そら', episode: 4 }),
    log({ id: 'c', author: 'そら', episode: 5, episodeEnd: 7 }),
    log({ id: 'd', author: 'そら', episode: 6 }),
    log({ id: 'e', author: 'そら' }),
    log({ id: 'f', episode: 4 }),
  ]);
  assert.deepEqual(sameEpisodeLogs(w, w.logs[0]!).map((l) => l.id), ['b', 'c']);
  assert.deepEqual(sameEpisodeLogs(w, w.logs[2]!).map((l) => l.id), ['a']);
  assert.deepEqual(sameEpisodeLogs(w, w.logs[3]!), []);
});

test('a log without an episode has no same-episode logs', () => {
  const w = work([log({ id: 'a' }), log({ id: 'b', author: 'そら', episode: 1 })]);
  assert.deepEqual(sameEpisodeLogs(w, w.logs[0]!), []);
});

test('highestEpisode looks at the end of ranges and is null without episodes', () => {
  assert.equal(highestEpisode(work([log({ episode: 2 }), log({ id: 'l2', episode: 3, episodeEnd: 5 })])), 5);
  assert.equal(highestEpisode(work([log()])), null);
});

test('progress has one row per author with episode logs, sorted by name', () => {
  const p = progressOf(
    work([
      log({ id: 'a', author: 'そら', episode: 1 }),
      log({ id: 'b', author: 'あお', episode: 1 }),
      log({ id: 'c', author: 'あお', episode: 2 }),
      log({ id: 'd', author: 'ぬし' }),
    ]),
  );
  assert.deepEqual(p?.rows.map((r) => [r.author, r.count]), [['あお', 2], ['そら', 1]]);
});

test('progress total is the larger of episodeCount and the highest episode logged', () => {
  assert.equal(progressOf(work([log({ episode: 3 })], { episodeCount: 10 }))?.total, 10);
  assert.equal(progressOf(work([log({ episode: 12 })], { episodeCount: 10 }))?.total, 12);
  const unknown = progressOf(work([log({ episode: 3 })]));
  assert.equal(unknown?.total, 3);
  assert.equal(unknown?.countKnown, false);
});

test('progress counts each episode once, including episodes covered by a range', () => {
  const p = progressOf(work([log({ id: 'a', episode: 1 }), log({ id: 'b', episode: 1, episodeEnd: 3 }), log({ id: 'c', episode: 5 })]));
  assert.equal(p?.rows[0]?.count, 4);
});

test('episode 0 is not counted or drawn', () => {
  assert.equal(progressOf(work([log({ episode: 0 })])), null);
  const p = progressOf(work([log({ episode: 0, episodeEnd: 2 })], { episodeCount: 3 }));
  assert.equal(p?.rows[0]?.count, 2);
  assert.equal(p?.total, 3);
});

test('progress is null when no log has an episode number', () => {
  assert.equal(progressOf(work([log()], { episodeCount: 10 })), null);
});

test('the earliest log wins when an episode was logged twice', () => {
  const p = progressOf(work([log({ id: 'late', episode: 2, loggedAt: '2026-10-20' }), log({ id: 'early', episode: 2, loggedAt: '2026-10-10' })]));
  assert.equal(coveringLog(p!.rows[0]!, 2)?.id, 'early');
  assert.equal(coveringLog(p!.rows[0]!, 1), undefined);
});

test('an absurd episode number does not make progress expensive', () => {
  const p = progressOf(work([log({ episode: 1, episodeEnd: 2_000_000_000 })]));
  assert.equal(p?.rows[0]?.count, 2_000_000_000);
});
