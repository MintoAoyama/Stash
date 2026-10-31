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
  assert.match(page, /<a class="log-title" href="\/stash\/w\/1\/w1\/l1\/"><span class="log-ep">第3話<\/span> <span class="log-sub">夜の手紙<\/span><\/a>/);
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
  const order = ['/w1/c/', '/w1/b/', '/w1/a/'].map((p) => page.indexOf(`class="log-title" href="/stash/w/1${p}"`));
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

test('a short text is rendered as Markdown on the work page; a long one is cut as plain text', () => {
  const page = render([work([log({ text: '**良かった**\n\n- 一\n- 二' }), log({ id: 'l2', text: `**${'あ'.repeat(150)}** [リンク](https://example.com/)` })])], 'work:w1');
  assert.ok(page.includes('<div class="log-text"><p><strong>良かった</strong></p>\n<ul>\n<li>一</li>\n<li>二</li>\n</ul>\n</div>'));
  assert.ok(page.includes(`<div class="log-text"><p>${'あ'.repeat(140)}…</p></div>`));
  assert.ok(!page.includes('**'));
});

test('the log page renders the whole text as Markdown', () => {
  const page = render([work([log({ text: `# 感想\n\n**${'あ'.repeat(150)}**` })])], 'log:w1/l1');
  assert.ok(page.includes(`<div class="log-text"><h3>感想</h3>\n<p><strong>${'あ'.repeat(150)}</strong></p>\n</div>`));
});

test('a log without text has no text block', () => {
  assert.ok(!render([work([log({ text: '' })])], 'work:w1').includes('log-text'));
  assert.ok(!render([work([log({ text: '  \n' })])], 'log:w1/l1').includes('log-text'));
});

test('timelines show the text without its markup', () => {
  const page = render([work([log({ text: '**太字**と[リンク](https://example.com/)' })])], 'month:2026-10');
  assert.ok(page.includes('<p>太字とリンク</p>'));
});

test('truncation does not split a surrogate pair', () => {
  const page = render([work([log({ text: '😀'.repeat(141) })])], 'work:w1');
  assert.ok(page.includes(`${'😀'.repeat(140)}…`));
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(page));
});

const program = { channel: 'NHK総合', date: '2026-10-11', start: '21:00', end: '21:45', title: '放送タイトル', url: 'https://example.com/p/1' };

test('program info shows the time range and an https link to the official page', () => {
  const page = render([work([log({ program })])], 'log:w1/l1');
  assert.ok(page.includes('NHK総合 21:00–21:45 放送 「放送タイトル」 <a href="https://example.com/p/1" rel="noopener noreferrer">番組ページ</a>'));
});

const regular = { channel: 'NHK総合', airtime: '日曜 21:00〜21:45' };

test('on the work page a program on the work channel with an airtime, watched the day it aired, is only a link at the end of the log heading', () => {
  const page = render([work([log({ program, rating: 4 })], regular)], 'work:w1');
  assert.match(page, /<div class="log-head">[^\n]*★☆<\/span><span class="program"> · <a href="https:\/\/example.com\/p\/1" rel="noopener noreferrer">番組ページ<\/a><\/span><\/div>/);
  assert.ok(!page.includes('<div class="program">'));
});

test('on the work page a program watched later is dated by its broadcast day, with the day it was watched after it, without the year when it is the same', () => {
  const later = render([work([log({ program, loggedAt: '2026-10-13' })], regular)], 'work:w1');
  assert.ok(later.includes('<time datetime="2026-10-11">2026-10-11</time>'));
  assert.ok(!later.includes('2026-10-13'));
  assert.ok(later.includes('<span class="program"> · 10-13 鑑賞 · <a'));
  const nextYear = render([work([log({ program, loggedAt: '2027-01-02' })], regular)], 'work:w1');
  assert.ok(nextYear.includes('<span class="program"> · 2027-01-02 鑑賞 · <a'));
});

test('on the work page a program on the work channel without an airtime drops only the channel', () => {
  const page = render([work([log({ program })], { channel: 'NHK総合' })], 'work:w1');
  assert.ok(page.includes('<div class="program">21:00–21:45 放送 「放送タイトル」 <a'));
});

test('on the work page a program on another channel keeps its channel', () => {
  const page = render([work([log({ program: { ...program, channel: 'NHK BS' }, loggedAt: '2026-10-13' })], regular)], 'work:w1');
  assert.ok(page.includes('NHK BS 10-11 21:00–21:45 放送 「放送タイトル」 · 10-13 鑑賞'));
  const nextYear = render([work([log({ program: { ...program, channel: 'NHK BS' }, loggedAt: '2027-01-02' })], regular)], 'work:w1');
  assert.ok(nextYear.includes('NHK BS 2026-10-11 21:00–21:45 放送 「放送タイトル」 · 2027-01-02 鑑賞'));
});

test('the log page is dated by the broadcast day and names the day it was watched', () => {
  const page = render([work([log({ program, loggedAt: '2026-10-13' })])], 'log:w1/l1');
  assert.ok(page.includes('<a href="/stash/m/2026/10/"><time datetime="2026-10-11">2026-10-11</time></a>'));
  assert.ok(page.includes('NHK総合 2026-10-11 21:00–21:45 放送 「放送タイトル」 · 2026-10-13 鑑賞 <a'));
  const old = render([work([log({ program: { ...program, date: '2014-11-27' }, loggedAt: '2026-10-13' })])], 'log:w1/l1');
  assert.ok(old.includes('<a href="/stash/m/2014/11/"><time datetime="2014-11-27">2014-11-27</time></a>'));
  assert.ok(old.includes('<title>テストドラマ 2014-11-27 | stash</title>'));
});

test('a log without a program keeps the day it was logged', () => {
  const page = render([work([log({ loggedAt: '2026-10-13' })])], 'log:w1/l1');
  assert.ok(page.includes('<time datetime="2026-10-13">2026-10-13</time>'));
  assert.ok(!page.includes('鑑賞'));
});

test('logs on the work page are ordered by their broadcast day, not the day they were watched', () => {
  const caught = log({ id: 'a', episode: 1, loggedAt: '2026-10-18', program: { ...program, date: '2026-10-04' } });
  const live = log({ id: 'b', episode: 2, loggedAt: '2026-10-18', program: { ...program, date: '2026-10-11' } });
  const at = (page: string, id: string): number => page.indexOf(`class="log-title" href="/stash/w/1/w1/${id}/"`);
  const page = render([work([caught, live])], 'work:w1');
  assert.ok(at(page, 'b') >= 0 && at(page, 'b') < at(page, 'a'));
  const older = log({ id: 'c', episode: 3, loggedAt: '2026-10-19', program: { ...program, date: '2014-11-27' } });
  const reordered = render([work([caught, live, older])], 'work:w1');
  assert.ok(at(reordered, 'a') >= 0 && at(reordered, 'a') < at(reordered, 'c'));
});

test('the month, week and year pages place a log on its broadcast day and name the day it was watched', () => {
  const old = log({ loggedAt: '2026-10-18', program: { ...program, date: '2014-11-27' } });
  const w = work([old, log({ id: 'l2', loggedAt: '2026-10-18', text: '映画' })]);
  const month = render([w], 'month:2014-11');
  assert.ok(month.includes('<time datetime="2014-11-27">11-27</time>'));
  assert.ok(month.includes('<span class="watched">2026-10-18 鑑賞</span>'));
  assert.ok(render([w], 'week:2014-11-4').includes('2026-10-18 鑑賞'));
  assert.ok(render([w], 'year:2014').includes('<a href="/stash/m/2014/11/">11月</a>'));
  const current = render([w], 'month:2026-10');
  assert.ok(current.includes('1 件'));
  assert.ok(!current.includes('鑑賞'));
});

test('the cards of a list show the broadcast day of the latest log, and a work is as new as that', () => {
  const old = work([log({ id: 'o', loggedAt: '2026-10-18', program: { ...program, date: '2014-11-27' } })], { id: 'old', title: '古い録画' });
  const fresh = work([log({ id: 'n', loggedAt: '2026-10-05' })], { id: 'new', title: '新しい作品' });
  const page = render([old, fresh], 'type:tv');
  assert.ok(page.includes('<time datetime="2014-11-27">2014-11-27</time>'));
  assert.ok(page.indexOf('新しい作品') < page.indexOf('古い録画'));
});

test('a program with nothing left to show draws no line', () => {
  const page = render([work([log({ program: { channel: 'NHK総合', date: '2026-10-11' } })], regular)], 'work:w1');
  assert.ok(!page.includes('class="program"'));
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
  assert.match(page, /<h1><span class="log-ep">第3〜5話<\/span> <span class="log-sub">夜の手紙<\/span><\/h1>/);
  assert.ok(page.includes('あ'.repeat(300)));
  assert.ok(!page.includes('続きを読む'));
  assert.match(page, /<title>テストドラマ 第3〜5話 夜の手紙 \| stash<\/title>/);
});

test('the log page links to the neighbouring logs of the same author, without the author name', () => {
  const page = render([binge], 'log:w1/b');
  assert.match(page, /<a rel="prev" href="\/stash\/w\/1\/w1\/a\/">← 第2話 二夜<\/a>/);
  assert.ok(!page.includes('rel="next"'));
});

test('the first and last logs of an author have only one neighbour', () => {
  assert.ok(!render([binge], 'log:w1/a').includes('rel="prev"'));
  assert.ok(render([binge], 'log:w1/a').includes('rel="next"'));
  assert.ok(!render([binge], 'log:w1/c').includes('rel="prev"'));
  assert.ok(!render([binge], 'log:w1/c').includes('rel="next"'));
});

test('the log page links to the other authors\' logs of the same episodes', () => {
  assert.match(render([binge], 'log:w1/b'), /<p class="log-same">同じ話の記録: <a href="\/stash\/w\/1\/w1\/c\/" title="2026-10-12">そら（第4話）<\/a><\/p>/);
  assert.match(render([binge], 'log:w1/c'), /同じ話の記録: <a href="\/stash\/w\/1\/w1\/b\/" title="2026-10-11">あお（第3〜5話）<\/a>/);
});

test('same-episode links name only the author when the episode is the same', () => {
  const w = work([log({ id: 'a', episode: 3 }), log({ id: 'b', author: 'そら', episode: 3 }), log({ id: 'c', author: 'ぬし', episode: 3 })]);
  assert.match(render([w], 'log:w1/a'), /同じ話の記録: <a href="[^"]*" title="[^"]*">そら<\/a> <a href="[^"]*" title="[^"]*">ぬし<\/a>/);
});

test('there is no same-episode line for a log without an episode or without company', () => {
  assert.ok(!render([binge], 'log:w1/a').includes('log-same'));
  assert.ok(!render([work([log({ text: '感想' }), log({ id: 'o', author: 'そら', episode: 1 })])], 'log:w1/l1').includes('log-same'));
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

const count = (page: string, needle: string): number => page.split(needle).length - 1;

const watched = work(
  [
    ...[1, 2, 3].map((n) => log({ id: `a${n}`, episode: n, loggedAt: `2026-10-1${n}` })),
    ...[1, 2].map((n) => log({ id: `s${n}`, author: 'そら', episode: n, loggedAt: `2026-10-0${n}` })),
  ],
  { episodeCount: 10 },
);

test('the work page draws one row of cells per author, filled where the episode is logged', () => {
  const page = render([watched], 'work:w1');
  assert.equal(count(page, 'class="progress-row"'), 2);
  assert.equal(count(page, 'class="ep ep--seen"'), 5);
  assert.equal(count(page, 'class="ep"'), 15);
  assert.ok(page.includes('3 / 10 話'));
  assert.ok(page.includes('2 / 10 話'));
  assert.ok(page.indexOf('あお') < page.indexOf('そら'));
});

test('filled cells link to the log page and are titled with the episode and date', () => {
  const page = render([watched], 'work:w1');
  assert.ok(page.includes('<a class="ep ep--seen" href="/stash/w/1/w1/a3/" title="第3話 2026-10-13" aria-label="第3話 2026-10-13"></a>'));
  assert.ok(page.includes('<span class="ep" title="第4話"></span>'));
});

test('a log covering several episodes fills all of them and links each to that log', () => {
  const page = render([work([log({ id: 'b', episode: 3, episodeEnd: 5 })], { episodeCount: 6 })], 'work:w1');
  assert.equal(count(page, 'class="ep ep--seen"'), 3);
  assert.equal(count(page, 'href="/stash/w/1/w1/b/" title="第'), 3);
  assert.ok(page.includes('3 / 6 話'));
});

test('without an episode count the summary has no total and the grid ends at the highest episode', () => {
  const page = render([work([log({ episode: 3 })])], 'work:w1');
  assert.ok(page.includes('1 話'));
  assert.ok(!page.includes(' / '));
  assert.equal(count(page, 'class="ep"') + count(page, 'class="ep ep--seen"'), 3);
});

test('episode 0 is not drawn', () => {
  const page = render([work([log({ episode: 0 })], { episodeCount: 3 })], 'work:w1');
  assert.equal(count(page, 'class="ep ep--seen"'), 0);
  assert.equal(count(page, 'class="ep"'), 3);
  assert.ok(page.includes('0 / 3 話'));
});

test('a work without episode numbers has no grid', () => {
  assert.ok(!render([work([log()], { episodeCount: 10 })], 'work:w1').includes('class="progress"'));
});

test('a long-running work shows only the summary', () => {
  const page = render([work([log({ episode: 3 })], { episodeCount: 2000 })], 'work:w1');
  assert.ok(!page.includes('progress-cells'));
  assert.ok(page.includes('1 / 2000 話'));
});

const autumn = (id: string, over: Partial<Work> = {}): Work =>
  work([log({ id: `${id}-1`, episode: 1, loggedAt: '2026-10-05' })], { id, title: `作品${id}`, season: '2026-autumn', ...over });

test('the season page lists its works as cards with their channel, slot and progress', () => {
  const works = [
    autumn('a1', { title: '古い作品' }),
    autumn('b2', { title: '新しい作品', logs: [log({ id: 'x', episode: 2, loggedAt: '2026-10-12' })], episodeCount: 12, channel: 'NHK総合', airtime: '日曜 21:00〜21:45' }),
    autumn('c3', { season: '2026-summer', title: '別のシーズン' }),
  ];
  const page = render(works, 'season:2026-autumn');
  assert.match(page, /<h1>2026秋<\/h1>/);
  assert.ok(page.indexOf('新しい作品') < page.indexOf('古い作品'));
  assert.ok(!page.includes('別のシーズン'));
  assert.ok(page.includes('1 / 12 話'));
  assert.ok(page.includes('<ul class="cards cards--text cards--season">'));
  assert.match(page, /<a href="\/stash\/w\/2\/b2\/"><span class="card-title">新しい作品<\/span><\/a>/);
  assert.ok(page.includes('<span class="card-meta">NHK総合 · 日曜 21:00〜21:45'));
  assert.ok(!page.includes('<time'));
});

test('the season page goes by the slot through the week, then the works without one newest log first', () => {
  const works = [
    autumn('a1', { title: '日曜の夜', airtime: '日曜 22:30〜23:00' }),
    autumn('b2', { title: '月曜の深夜', airtime: '月曜 01:25〜01:55' }),
    autumn('c3', { title: '月曜の朝', airtime: '月曜 05:45〜07:05' }),
    autumn('d4', { title: '枠なし・古い' }),
    autumn('e5', { title: '枠なし・新しい', logs: [log({ id: 'x', loggedAt: '2026-10-12' })] }),
  ];
  const page = render(works, 'season:2026-autumn');
  const order = ['月曜の朝', '日曜の夜', '月曜の深夜', '枠なし・新しい', '枠なし・古い'].map((t) => page.indexOf(`>${t}<`));
  assert.ok(order.every((i) => i >= 0));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
});

test('a season without works has no page', () => {
  assert.equal(renderPage(site([autumn('a1')]), 'season:2026-summer'), null);
});

test('the season index lists seasons newest first with their work counts', () => {
  const works = [autumn('a1', { season: '2025-autumn' }), autumn('b2'), autumn('c3'), autumn('d4', { season: '2026-summer' })];
  const page = render(works, 'seasons');
  const labels = ['2026秋', '2026夏', '2025秋'].map((l) => page.indexOf(l));
  assert.deepEqual([...labels].sort((a, b) => a - b), labels);
  assert.match(page, /<a href="\/stash\/s\/2026-autumn\/">2026秋<\/a> <span class="count">2<\/span>/);
});

test('there is no season index while no work has a season', () => {
  assert.equal(renderPage(site([work([log()])]), 'seasons'), null);
});

test('the work page links to its season', () => {
  const page = render([autumn('a1')], 'work:a1');
  assert.match(page, /<a href="\/stash\/s\/2026-autumn\/">2026秋<\/a>/);
});

const nav = (page: string): string => /<nav class="site-nav">[\s\S]*?<\/nav>/.exec(page)?.[0] ?? '';

test('the navigation lists every type and the seasons, hidden until site.js reveals the ones that have records', () => {
  const html = nav(render([], 'tags'));
  for (const t of ['tv', 'movie', 'streaming', 'music', 'book', 'other']) assert.ok(html.includes(`data-nav-type="${t}" hidden`), t);
  assert.ok(html.includes('data-nav-seasons hidden'));
  assert.match(html, /<a href="\/stash\/d\/">ディレクトリ<\/a>\n<a href="\/stash\/t\/">タグ<\/a>/);
  assert.ok(html.indexOf('data-nav-type="tv"') < html.indexOf('data-nav-type="movie"'));
});

test('no page embeds what exists elsewhere: the navigation and the home page do not depend on the works', () => {
  const works = [autumn('a1'), work([log({ episode: 1 })], { id: 'b2', type: 'movie' })];
  assert.equal(nav(render(works, 'tags')), nav(render([], 'tags')));
  assert.equal(render(works, 'home'), render([], 'home'));
});

const NHK_CREDIT = 'ＮＨＫ番組の情報提供:ＮＨＫ';
const nhk = { channel: 'NHK総合', date: '2026-10-11', source: 'nhk', url: 'https://example.com/p/1' };
const manual = { channel: 'ch', date: '2026-10-11', source: 'manual', url: '' };

test('a page that shows NHK program information carries the NHK credit in its footer', () => {
  const w = work([log({ program: nhk })]);
  for (const key of ['work:w1', 'log:w1/l1']) {
    const footer = /<footer[\s\S]*<\/footer>/.exec(render([w], key))?.[0] ?? '';
    assert.ok(footer.includes(`<p>${NHK_CREDIT}</p>`), key);
  }
});

test('program information from other sources needs no NHK credit', () => {
  const w = work([log({ program: manual }), log({ id: 'l2', program: null })]);
  for (const key of ['work:w1', 'log:w1/l1']) assert.ok(!render([w], key).includes(NHK_CREDIT), key);
});

test('the credit belongs to the page that shows the program: other logs and other pages do not carry it', () => {
  const w = work([log({ program: nhk }), log({ id: 'l2', program: manual })], { season: '2026-autumn' });
  assert.ok(render([w], 'work:w1').includes(NHK_CREDIT));
  assert.ok(render([w], 'log:w1/l1').includes(NHK_CREDIT));
  assert.ok(!render([w], 'log:w1/l2').includes(NHK_CREDIT));
  for (const key of ['home', 'tags', 'type:tv', 'season:2026-autumn', 'seasons', 'month:2026-10', 'year:2026', 'dir:']) {
    assert.ok(!render([w], key).includes(NHK_CREDIT), key);
  }
});

const TMDB_CREDIT = '作品情報の一部は TMDB API を利用しています';
const fromTmdb = (id: string, over: Partial<Work> = {}): Work => work([log({ episode: 1 })], { id, type: 'movie', title: `映画${id}`, season: '2026-autumn', externalIds: { tmdb: 'movie/1' }, ...over });

test('a page that shows a work from TMDB carries the TMDB credit in its footer', () => {
  const w = fromTmdb('m1', { path: 'movies', tags: ['SF'] });
  for (const key of ['work:m1', 'log:m1/l1', 'type:movie', 'dir:movies', 'tag:SF', 'season:2026-autumn', 'year:2026']) {
    assert.ok(render([w], key).includes(TMDB_CREDIT), key);
  }
});

test('a cover from TMDB is TMDB data too, whatever the ids say', () => {
  const w = work([log()], { coverUrl: 'https://image.tmdb.org/t/p/w342/x.jpg' });
  assert.ok(render([w], 'work:w1').includes(TMDB_CREDIT));
  assert.ok(!render([work([log()], { coverUrl: 'https://example.com/c.jpg' })], 'work:w1').includes(TMDB_CREDIT));
});

test('a page that shows no TMDB work has no TMDB credit, not even beside TMDB works elsewhere', () => {
  const own = work([log()], { id: 'own', path: 'tv' });
  const other = fromTmdb('m1', { path: 'movies' });
  for (const key of ['work:own', 'log:own/l1', 'dir:tv', 'month:2026-10', 'week:2026-10-2', 'tags', 'seasons', 'home']) {
    assert.ok(!render([own, other], key).includes(TMDB_CREDIT), key);
  }
  assert.ok(!render([own, other], 'type:tv').includes(TMDB_CREDIT));
});

test('a list that includes a TMDB work among others carries the credit', () => {
  assert.ok(render([work([log()], { id: 'own' }), fromTmdb('m1', { type: 'tv' })], 'type:tv').includes(TMDB_CREDIT));
});

const metaOf = (page: string): string => /<p class="work-meta">([\s\S]*?)<\/p>/.exec(page)?.[1] ?? '';
const text = (fragment: string): string => fragment.replace(/<[^>]+>/g, '');

test('the work meta line lists type, season, channel, airtime, episode count, year, platform and creators, then the official site', () => {
  const w = autumn('a1', {
    channel: 'NHK総合',
    airtime: '日曜 21:00〜21:45',
    episodeCount: 12,
    year: 2026,
    platform: 'NHKプラス',
    creators: ['架空 太郎', '架空 花子'],
    officialUrl: 'https://example.com/drama/',
  });
  const meta = metaOf(render([w], 'work:a1'));
  assert.equal(text(meta), 'TV · 2026秋 · NHK総合 · 日曜 21:00〜21:45 · 全12話 · 2026 · NHKプラス · 架空 太郎、架空 花子 · 公式サイト');
  assert.ok(meta.includes('<a href="https://example.com/drama/" rel="noopener noreferrer">公式サイト</a>'));
});

test('the meta line leaves out what is not set, for any type', () => {
  const meta = metaOf(render([work([log()], { type: 'movie', channel: 'ＢＳ', officialUrl: '' })], 'work:w1'));
  assert.equal(text(meta), '映画 · ＢＳ');
});

test('an official url that is not https is not linked', () => {
  const meta = metaOf(render([work([log()], { officialUrl: 'javascript:alert(1)' })], 'work:w1'));
  assert.ok(!meta.includes('javascript:'));
  assert.ok(!meta.includes('公式サイト'));
});

const onAir = (id: string, loggedAt: string, channel: string, over: Partial<Log> = {}): Log => log({ id, loggedAt, program: { channel, date: loggedAt }, ...over });

test('without a channel on the work, the meta line uses the most frequent channel of its logs but no airtime', () => {
  const w = work([onAir('a', '2026-10-01', 'ＢＳ'), onAir('b', '2026-10-02', 'NHK総合'), onAir('c', '2026-10-03', 'NHK総合')]);
  assert.equal(text(metaOf(render([w], 'work:w1'))), 'TV · NHK総合');
});

test('the season cards show the channel, with the same fallback', () => {
  const works = [
    autumn('a1', { channel: 'NHK総合' }),
    autumn('b2', { logs: [onAir('x', '2026-10-06', 'TBS', { episode: 1 })] }),
    autumn('c3'),
  ];
  const page = render(works, 'season:2026-autumn');
  assert.ok(page.includes('<span class="card-meta">NHK総合 '));
  assert.ok(page.includes('<span class="card-meta">TBS '));
  assert.equal(count(page, '<span class="card-meta"> '), 1);
});

const withCover = (id: string, over: Partial<Work> = {}): Work =>
  work([log({ id: `${id}-1`, loggedAt: '2026-10-05' })], { id, title: `作品${id}`, season: '2026-autumn', coverUrl: 'https://example.com/c.jpg', ...over });
const pagesOf = (works: Work[]) => ({
  work: render(works, `work:${works[0]!.id}`),
  log: render(works, `log:${works[0]!.id}/${works[0]!.logs[0]!.id}`),
  season: render(works, 'season:2026-autumn'),
  list: render(works, 'type:tv'),
});

test('a work without a cover has no cover element on any page, not even a placeholder', () => {
  const pages = pagesOf([autumn('a1')]);
  for (const [name, page] of Object.entries(pages)) {
    assert.ok(!page.includes('class="cover'), name);
    assert.ok(!page.includes('cover--empty'), name);
    assert.ok(!page.includes('season-cover'), name);
  }
});

test('a work with a cover keeps its image on every page', () => {
  const pages = pagesOf([withCover('c1')]);
  assert.ok(pages.work.includes('<img class="cover cover--full" src="https://example.com/c.jpg"'));
  assert.ok(pages.log.includes('<img class="cover cover--small" src="https://example.com/c.jpg"'));
  assert.ok(pages.season.includes('<img class="cover cover--thumb" src="https://example.com/c.jpg"'));
  assert.ok(pages.list.includes('<img class="cover cover--thumb" src="https://example.com/c.jpg"'));
});

test('a list of works without covers is a grid of text cards with the title, type, latest date and rating', () => {
  const page = render([autumn('a1'), autumn('b2')], 'type:tv');
  assert.ok(page.includes('<ul class="cards cards--text">'));
  assert.equal(count(page, '<li class="card card--text"'), 2);
  assert.match(page, /<a href="\/stash\/w\/1\/a1\/"><span class="card-title">作品a1<\/span><\/a>/);
  assert.ok(page.includes('TV · <time datetime="2026-10-05">2026-10-05</time>'));
});

test('in a mixed list only the works without a cover are text cards', () => {
  const page = render([withCover('c1'), autumn('b2')], 'type:tv');
  assert.ok(page.includes('<ul class="cards">'));
  assert.equal(count(page, 'card--text'), 1);
  assert.equal(count(page, 'class="cover cover--thumb"'), 1);
});

test('in a season only the works without a cover are text cards', () => {
  const page = render([autumn('a1'), withCover('c1')], 'season:2026-autumn');
  assert.ok(page.includes('<ul class="cards cards--season">'));
  assert.equal(count(page, 'card--text'), 1);
  assert.equal(count(page, 'class="cover cover--thumb"'), 1);
});

// 2026-08-01 is a Saturday: 8/1 and 8/2 are in the last week of July, 8/3 starts the first week of August.
const aroundAugust = work([
  log({ id: 'a', loggedAt: '2026-07-30', text: '七月の回' }),
  log({ id: 'b', loggedAt: '2026-08-01', text: '八月一日の回' }),
  log({ id: 'c', loggedAt: '2026-08-04', text: '八月四日の回' }),
  log({ id: 'd', loggedAt: '2026-08-05' }),
]);

test('the month page lists the weeks of its logs, naming a week of the month next to it in full', () => {
  const page = render([aroundAugust], 'month:2026-08');
  assert.match(page, /<a href="\/stash\/m\/2026\/07\/w5\/">7月5週目<\/a> <span class="range">（7\/27〜8\/2）<\/span> <span class="count">1<\/span>/);
  assert.match(page, /<a href="\/stash\/m\/2026\/08\/w1\/">1週目<\/a> <span class="range">（8\/3〜8\/9）<\/span> <span class="count">2<\/span>/);
  assert.ok(page.indexOf('7月5週目') < page.indexOf('>1週目'));
});

test('the week page lists the logs of that week across the month end and links the months they are in', () => {
  const page = render([aroundAugust], 'week:2026-07-5');
  assert.match(page, /<h1>2026年7月5週目<\/h1><p class="count">7\/27〜8\/2 · 2 件<\/p>/);
  assert.ok(page.includes('七月の回') && page.includes('八月一日の回') && !page.includes('八月四日の回'));
  assert.match(page, /<nav class="breadcrumbs"><a href="\/stash\/m\/2026\/07\/">2026年7月<\/a> · <a href="\/stash\/m\/2026\/08\/">2026年8月<\/a><\/nav>/);
  assert.equal(renderPage(site([aroundAugust]), 'week:2026-08-2'), null);
});
