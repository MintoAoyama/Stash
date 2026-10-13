import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareLogs, compareNewestFirst, coveringLog, episodeLabel, episodeSpan, highestEpisode, logHeading, neighbours, progressOf } from '../src/episodes.ts';
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
