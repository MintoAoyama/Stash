import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fold, marks, prepare, queryTerms, rememberQuery, search, snippet, suggestions } from '../assets/search-core.js';
import { buildSearchData } from '../src/search.ts';
import type { Log, Work } from '../src/types.ts';

function work(id: string, over: Partial<Work> = {}): Work {
  return { id, type: 'tv', title: `作品 ${id}`, path: '', tags: [], logs: [], ...over };
}

function log(id: string, over: Partial<Log> = {}): Log {
  return { id, author: 'alice', loggedAt: '2026-10-01', text: '', ...over };
}

const marked = (text: string, query: string) => marks(text, queryTerms(query)).map(([s, e]) => text.slice(s, e));

test('search data carries the text of each log without its markup, newest work and log first', () => {
  const data = buildSearchData([
    work('a', { logs: [log('a1', { loggedAt: '2026-09-01', text: '**太字**と[リンク](https://example.com)' })] }),
    work('b', {
      channel: 'NHK総合',
      genres: ['30'],
      season: '2026-autumn',
      logs: [log('b1', { loggedAt: '2026-10-01', episode: 2, subtitle: '出会い' }), log('b2', { loggedAt: '2026-10-08', episode: 3 })],
    }),
  ]);
  assert.deepEqual(data.works.map((w) => w.id), ['b', 'a']);
  assert.equal(data.works[1]!.logs[0]!.text, '太字とリンク');
  assert.equal(data.works[0]!.meta, 'TV · ドラマ · NHK総合 · 2026秋');
  assert.deepEqual(data.works[0]!.logs.map((l) => [l.id, l.heading]), [['b2', '第3話'], ['b1', '第2話 出会い']]);
});

test('search data names the program a log was broadcast under only when it says more than the work and the subtitle', () => {
  const program = (title: string) => ({ source: 'nhk', title, channel: 'NHK総合', date: '2026-10-01' }) as Log['program'];
  const logs = [
    log('a1', { program: program('WBS') }),
    log('a2', { program: program('WBS 特別版') }),
    log('a3', { subtitle: '円安の行方', program: program('WBS 円安の行方') }),
  ];
  const data = buildSearchData([work('a', { title: 'WBS', logs })]);
  assert.deepEqual(data.works[0]!.logs.map((l) => l.program).sort(), ['', '', 'WBS 特別版']);
});

test('folding treats full and half width, case and katakana as the same letters', () => {
  assert.equal(fold('ＷＢＳ ｶﾞｯﾁﾘ ポカポカ').folded, 'wbs がっちり ぽかぽか');
});

test('a match is marked on the original letters even where folding changed their number', () => {
  assert.deepEqual(marked('ｶﾞｯﾁﾘマンデー', 'がっちり'), ['ｶﾞｯﾁﾘ']);
  assert.deepEqual(marked('㈱テスト', '(株)'), ['㈱']);
  assert.deepEqual(marked('お宝ハンターズのハンター', 'はんたー'), ['ハンター', 'ハンター']);
});

test('marks of terms that overlap are merged', () => {
  assert.deepEqual(marked('全力脱力タイムズ', '全力 力脱'), ['全力脱']);
});

const data = buildSearchData([
  work('wbs', {
    title: 'WBS',
    tags: ['経済'],
    logs: [log('w1', { loggedAt: '2026-10-02', text: '円安の特集' }), log('w2', { loggedAt: '2026-10-03', text: '決算の話' })],
  }),
  work('pk', { title: 'ぽかぽか', logs: [log('p1', { loggedAt: '2026-10-04', text: 'ゲストは円楽さん' })] }),
]);
const prepared = prepare(data);
const found = (query: string) => {
  const r = search(prepared, query);
  return { works: r.works.map((w) => w.id), logs: r.logs.map((l) => l.log.id) };
};

test('a work matches by its own fields, and its logs are not listed for that alone', () => {
  assert.deepEqual(found('wbs'), { works: ['wbs'], logs: [] });
  assert.deepEqual(found('#経済'), { works: ['wbs'], logs: [] });
});

test('logs match by their text, newest first, and words split by spaces all have to be found', () => {
  assert.deepEqual(found('円'), { works: [], logs: ['p1', 'w1'] });
  assert.deepEqual(found('円 特集'), { works: [], logs: ['w1'] });
});

test('the terms of a log may be shared with the fields of its work', () => {
  assert.deepEqual(found('WBS 円安'), { works: [], logs: ['w1'] });
  assert.deepEqual(found('ぽかぽか 円安'), { works: [], logs: [] });
});

test('an empty query finds nothing', () => {
  assert.deepEqual(found('  　'), { works: [], logs: [] });
});

test('a snippet starts at the line of the first match when it is close, else a little before it', () => {
  const text = `前置き\n${'あ'.repeat(10)}円安の話\n後の行`;
  const s = snippet(text, queryTerms('円安'));
  assert.equal(s.head, true);
  assert.equal(s.segments.map((r) => r.text).join(''), `${'あ'.repeat(10)}円安の話 後の行`);
  assert.deepEqual(s.segments.filter((r) => r.mark).map((r) => r.text), ['円安']);

  const far = snippet(`${'あ'.repeat(100)}円安`, queryTerms('円安'), { before: 5, length: 10 });
  assert.equal(far.segments.map((r) => r.text).join(''), 'あああああ円安');
  assert.equal(far.tail, false);
});

test('a snippet of a log that matched only by its heading is its start', () => {
  const s = snippet('本文の始まり', queryTerms('第3話'), { length: 3 });
  assert.equal(s.segments.map((r) => r.text).join(''), '本文の');
  assert.deepEqual([s.head, s.tail], [false, true]);
});

test('recent queries put the newest first, keep each once and drop the oldest beyond the limit', () => {
  assert.deepEqual(rememberQuery(['円安', 'WBS'], ' WBS '), ['WBS', '円安']);
  assert.deepEqual(rememberQuery(['b', 'c'], 'a', 2), ['a', 'b']);
  assert.deepEqual(rememberQuery(['a'], '円安　特集'), ['円安 特集', 'a']);
  assert.deepEqual(rememberQuery(['a'], '   '), ['a']);
});

test('the drop-down offers the recent queries with what has been typed in them, other than that itself', () => {
  const history = ['円安 特集', 'WBS', 'ポカポカ'];
  assert.deepEqual(suggestions(history, ''), history);
  assert.deepEqual(suggestions(history, 'ぽか'), ['ポカポカ']);
  assert.deepEqual(suggestions(history, 'wbs'), []);
});
