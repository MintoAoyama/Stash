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

test('truncation does not split a surrogate pair', () => {
  const page = render([work([log({ text: '😀'.repeat(141) })])], 'work:w1');
  assert.ok(page.includes(`${'😀'.repeat(140)}…`));
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(page));
});

const program = { channel: 'NHK総合', date: '2026-10-11', start: '21:00', end: '21:45', title: '放送タイトル', url: 'https://example.com/p/1' };

test('program info shows the time range and an https link to the official page', () => {
  const page = render([work([log({ program })])], 'log:w1/l1');
  assert.ok(page.includes('NHK総合 2026-10-11 21:00–21:45 「放送タイトル」 <a href="https://example.com/p/1" rel="noopener noreferrer">番組ページ</a>'));
});

test('on the work page a program on the work channel with an airtime shows only its date and link', () => {
  const page = render([work([log({ program })], { channel: 'NHK総合', airtime: '日曜 21:00〜21:45' })], 'work:w1');
  assert.ok(page.includes('<div class="program">2026-10-11 放送 · <a href="https://example.com/p/1" rel="noopener noreferrer">番組ページ</a></div>'));
});

test('on the work page a program on the work channel without an airtime drops only the channel', () => {
  const page = render([work([log({ program })], { channel: 'NHK総合' })], 'work:w1');
  assert.ok(page.includes('<div class="program">2026-10-11 21:00–21:45 「放送タイトル」 <a'));
});

test('on the work page a program on another channel is shown in full', () => {
  const page = render([work([log({ program: { ...program, channel: 'NHK BS' } })], { channel: 'NHK総合', airtime: '日曜 21:00〜21:45' })], 'work:w1');
  assert.ok(page.includes('NHK BS 2026-10-11 21:00–21:45 「放送タイトル」'));
});

test('a program with nothing left to show draws no line', () => {
  const page = render([work([log({ program: { channel: 'NHK総合', date: '' } })], { channel: 'NHK総合', airtime: '日曜 21:00' })], 'work:w1');
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
  assert.match(page, /<h1>第3〜5話 夜の手紙<\/h1>/);
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

test('the season page lists its works newest log first with their progress', () => {
  const works = [
    autumn('a1', { title: '古い作品' }),
    autumn('b2', { title: '新しい作品', logs: [log({ id: 'x', episode: 2, loggedAt: '2026-10-12' })], episodeCount: 12 }),
    autumn('c3', { season: '2026-summer', title: '別のシーズン' }),
  ];
  const page = render(works, 'season:2026-autumn');
  assert.match(page, /<h1>2026年秋<\/h1>/);
  assert.ok(page.indexOf('新しい作品') < page.indexOf('古い作品'));
  assert.ok(!page.includes('別のシーズン'));
  assert.ok(page.includes('1 / 12 話'));
  assert.match(page, /<a class="season-title" href="\/stash\/w\/2\/b2\/">新しい作品<\/a>/);
  assert.ok(page.includes('TV · <time datetime="2026-10-12">2026-10-12</time>'));
});

test('a season without works has no page', () => {
  assert.equal(renderPage(site([autumn('a1')]), 'season:2026-summer'), null);
});

test('the season index lists seasons newest first with their work counts', () => {
  const works = [autumn('a1', { season: '2025-autumn' }), autumn('b2'), autumn('c3'), autumn('d4', { season: '2026-summer' })];
  const page = render(works, 'seasons');
  const labels = ['2026年秋', '2026年夏', '2025年秋'].map((l) => page.indexOf(l));
  assert.deepEqual([...labels].sort((a, b) => a - b), labels);
  assert.match(page, /<a href="\/stash\/s\/2026-autumn\/">2026年秋<\/a> <span class="count">2<\/span>/);
});

test('there is no season index while no work has a season', () => {
  assert.equal(renderPage(site([work([log()])]), 'seasons'), null);
});

test('the work page links to its season', () => {
  const page = render([autumn('a1')], 'work:a1');
  assert.match(page, /<a href="\/stash\/s\/2026-autumn\/">2026年秋<\/a>/);
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
    assert.ok(footer.includes('TMDB'), key);
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
  assert.equal(text(meta), 'TV · 2026年秋 · NHK総合 · 日曜 21:00〜21:45 · 全12話 · 2026 · NHKプラス · 架空 太郎、架空 花子 · 公式サイト');
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

test('the season page shows the channel next to the type, with the same fallback', () => {
  const works = [
    autumn('a1', { channel: 'NHK総合' }),
    autumn('b2', { logs: [onAir('x', '2026-10-06', 'TBS', { episode: 1 })] }),
    autumn('c3'),
  ];
  const page = render(works, 'season:2026-autumn');
  assert.ok(page.includes('TV · NHK総合 · <time datetime="2026-10-05">'));
  assert.ok(page.includes('TV · TBS · <time datetime="2026-10-06">'));
  assert.equal(count(page, '<p class="work-meta">TV · <time'), 1);
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
  assert.ok(pages.season.includes('<a class="season-cover"'));
  assert.ok(pages.season.includes('class="cover cover--small"'));
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

test('season rows without a cover are plain text rows', () => {
  const page = render([autumn('a1'), withCover('c1')], 'season:2026-autumn');
  assert.equal(count(page, '<li class="season-work">'), 2);
  assert.equal(count(page, 'class="season-cover"'), 1);
});
