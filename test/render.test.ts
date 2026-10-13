import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderPage, type Site } from '../src/render.ts';
import type { Log, Work } from '../src/types.ts';

const log = (over: Partial<Log> = {}): Log => ({ id: 'l1', author: 'あお', loggedAt: '2026-10-11', text: '', ...over });
const work = (logs: Log[], over: Partial<Work> = {}): Work => ({ id: 'w1', type: 'tv', title: 'テストドラマ', path: '', tags: [], logs, ...over });
const site = (works: Work[]): Site => ({ config: { title: 'stash', basePath: '/stash/' }, works: new Map(works.map((w) => [w.id, w])) });
const render = (works: Work[], key: string): string => {
  const out = renderPage(site(works), key);
  assert.notEqual(out, null, key);
  return out!;
};

test('the work page links each log to its own page and shows its episode and subtitle', () => {
  const page = render([work([log({ episode: 3, subtitle: '夜の手紙', text: '短い感想' })])], 'work:w1');
  assert.match(page, /<a class="log-title" href="\/stash\/w\/1\/w1\/l1\/">第3話 夜の手紙<\/a>/);
  assert.ok(page.includes('短い感想'));
});

test('a log without episode or subtitle has its date as the permalink', () => {
  const page = render([work([log({ text: '短い感想' })])], 'work:w1');
  assert.match(page, /<a href="\/stash\/w\/1\/w1\/l1\/"><time datetime="2026-10-11">2026-10-11<\/time><\/a>/);
  assert.ok(!page.includes('log-title'));
});

test('logs on the work page are listed newest first, later episode first within a day', () => {
  const logs = [log({ id: 'a', episode: 1 }), log({ id: 'b', episode: 2 }), log({ id: 'c', loggedAt: '2026-10-12', episode: 3 })];
  const page = render([work(logs)], 'work:w1');
  const order = ['/w1/c/', '/w1/b/', '/w1/a/'].map((p) => page.indexOf(`href="/stash/w/1${p}"`));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
});

test('long texts are cut at 140 characters with a link to the log page; short ones are shown whole', () => {
  const long = 'あ'.repeat(140) + 'ゐ'.repeat(60);
  const page = render([work([log({ text: long }), log({ id: 'l2', text: 'う'.repeat(140) })])], 'work:w1');
  assert.ok(page.includes(`${'あ'.repeat(140)}…`));
  assert.ok(!page.includes('ゐ'));
  assert.ok(page.includes('う'.repeat(140)));
  assert.equal(page.match(/続きを読む/g)?.length, 1);
  assert.match(page, /<p class="log-more"><a href="\/stash\/w\/1\/w1\/l1\/">続きを読む<\/a><\/p>/);
});

test('truncation does not split a surrogate pair', () => {
  const page = render([work([log({ text: '😀'.repeat(141) })])], 'work:w1');
  assert.ok(page.includes(`${'😀'.repeat(140)}…`));
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(page));
});

test('program info shows the time range and an https link to the official page', () => {
  const program = { channel: 'NHK総合', date: '2026-10-11', start: '21:00', end: '21:45', title: '放送タイトル', url: 'https://example.com/p/1' };
  const page = render([work([log({ program })])], 'work:w1');
  assert.ok(page.includes('NHK総合 2026-10-11 21:00–21:45 「放送タイトル」'));
  assert.ok(page.includes('<a href="https://example.com/p/1" rel="noopener noreferrer">番組ページ</a>'));
});

test('program urls that are not https are not linked', () => {
  const program = { channel: 'ch', date: '2026-10-11', url: 'javascript:alert(1)' };
  assert.ok(!render([work([log({ program })])], 'work:w1').includes('javascript:'));
});

const binge = work([
  log({ id: 'a', episode: 2, subtitle: '二夜', loggedAt: '2026-10-10', text: 'a' }),
  log({ id: 'b', episode: 3, episodeEnd: 5, subtitle: '夜の手紙', text: 'あ'.repeat(300) }),
  log({ id: 'c', author: 'そら', episode: 4, loggedAt: '2026-10-12' }),
]);

test('the log page shows the work, the episode label, the subtitle and the whole text', () => {
  const page = render([binge], 'log:w1/b');
  assert.match(page, /<p class="log-work"><a href="\/stash\/w\/1\/w1\/">テストドラマ<\/a><\/p>/);
  assert.match(page, /<h1>第3〜5話 夜の手紙<\/h1>/);
  assert.ok(page.includes('あ'.repeat(300)));
  assert.ok(!page.includes('続きを読む'));
  assert.match(page, /<title>テストドラマ 第3〜5話 夜の手紙 \| stash<\/title>/);
});

test('the log page links to the neighbouring logs of the work in viewing order', () => {
  const page = render([binge], 'log:w1/b');
  assert.match(page, /<a rel="prev" href="\/stash\/w\/1\/w1\/a\/">← 第2話 二夜 <span class="author">あお<\/span><\/a>/);
  assert.match(page, /<a rel="next" href="\/stash\/w\/1\/w1\/c\/">第4話 <span class="author">そら<\/span> →<\/a>/);
});

test('the first and last logs have only one neighbour', () => {
  assert.ok(!render([binge], 'log:w1/a').includes('rel="prev"'));
  assert.ok(!render([binge], 'log:w1/c').includes('rel="next"'));
});

test('a log without an episode is titled by its date', () => {
  const page = render([work([log({ text: '感想' })])], 'log:w1/l1');
  assert.match(page, /<h1>2026-10-11 の記録<\/h1>/);
});

test('a missing log or work has no page', () => {
  assert.equal(renderPage(site([binge]), 'log:w1/nope'), null);
  assert.equal(renderPage(site([binge]), 'log:nope/a'), null);
});

test('user text on the log page is escaped', () => {
  const page = render([work([log({ text: '<img src=x onerror=alert(1)>', subtitle: '<b>x</b>' })], { title: '<script>alert(1)</script>' })], 'log:w1/l1');
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!page.includes('<script>alert'));
  assert.ok(!page.includes('<b>x'));
});
