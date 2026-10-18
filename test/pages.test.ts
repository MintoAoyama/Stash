import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affectedPages, allPageKeys, outputFile, pageKeysForWork, pageUrl, safeSegment, workDataPath } from '../src/pages.ts';
import type { Work } from '../src/types.ts';

const work = (over: Partial<Work> = {}): Work => ({
  id: 'w1',
  type: 'movie',
  title: 'インセプション',
  path: 'movies/2026',
  tags: ['SF'],
  logs: [{ id: 'l1', author: 'alice', loggedAt: '2026-10-11', text: '' }],
  ...over,
});

test('safeSegment neutralizes path traversal and URL-breaking characters', () => {
  assert.equal(safeSegment('..'), '-.');
  assert.equal(safeSegment('_draft'), '-draft');
  assert.equal(safeSegment('  '), '-');
  assert.equal(safeSegment(' a/b?c#d '), 'a-b-c-d');
  assert.equal(safeSegment('ドラマ'), 'ドラマ');
});

test('pageKeysForWork covers the work, every ancestor dir, tags, months, weeks and type', () => {
  assert.deepEqual(
    [...pageKeysForWork(work())].sort(),
    ['dir:', 'dir:movies', 'dir:movies/2026', 'log:w1/l1', 'month:2026-10', 'tag:SF', 'tags', 'type:movie', 'week:2026-10-2', 'work:w1', 'year:2026'].sort(),
  );
});

test('a log with a program belongs to the month, week and year of its broadcast day', () => {
  const logs = [{ id: 'l1', author: 'alice', loggedAt: '2026-10-18', text: '', program: { channel: 'NHK総合', date: '2014-11-27' } }];
  const keys = pageKeysForWork(work({ logs }));
  for (const k of ['month:2014-11', 'week:2014-11-4', 'year:2014']) assert.ok(keys.has(k), k);
  for (const k of ['month:2026-10', 'week:2026-10-3', 'year:2026']) assert.ok(!keys.has(k), k);
});

test('every log of a work gets its own page key', () => {
  const logs = ['l1', 'l2', 'l3'].map((id) => ({ id, author: 'alice', loggedAt: '2026-10-11', text: '' }));
  const keys = pageKeysForWork(work({ logs }));
  for (const id of ['l1', 'l2', 'l3']) assert.ok(keys.has(`log:w1/${id}`), id);
});

test('a season adds its page and the season index; a work without one touches neither', () => {
  const keys = pageKeysForWork(work({ season: '2026-autumn' }));
  assert.ok(keys.has('season:2026-autumn'));
  assert.ok(keys.has('seasons'));
  for (const k of pageKeysForWork(work())) assert.ok(!k.startsWith('season'), k);
});

test('an unusable season adds no page', () => {
  for (const k of pageKeysForWork(work({ season: '../x' }))) assert.ok(!k.startsWith('season'), k);
});

test('affectedPages includes the season a work left as well as the one it joined', () => {
  const keys = affectedPages(work({ season: '2026-summer' }), work({ season: '2026-autumn' }));
  for (const k of ['season:2026-summer', 'season:2026-autumn', 'seasons']) assert.ok(keys.has(k), k);
});

test('a full build always considers the season index', () => {
  assert.ok(allPageKeys([]).has('seasons'));
});

test('affectedPages includes the page of a log that was removed', () => {
  const logs = ['l1', 'l2'].map((id) => ({ id, author: 'alice', loggedAt: '2026-10-11', text: '' }));
  const keys = affectedPages(work({ logs }), work({ logs: logs.slice(0, 1) }));
  assert.ok(keys.has('log:w1/l2'));
});

test('affectedPages includes pages the work left as well as pages it joined', () => {
  const keys = affectedPages(work(), work({ tags: ['ドラマ'], path: 'tv' }));
  for (const k of ['tag:SF', 'tag:ドラマ', 'dir:movies/2026', 'dir:tv']) assert.ok(keys.has(k), k);
});

test('affectedPages handles creation and deletion', () => {
  assert.ok(affectedPages(undefined, work()).has('work:w1'));
  assert.ok(affectedPages(work(), undefined).has('work:w1'));
});

test('outputFile and pageUrl', () => {
  assert.equal(outputFile('month:2026-10'), 'm/2026/10/index.html');
  assert.equal(outputFile('week:2026-08-1'), 'm/2026/08/w1/index.html');
  assert.equal(outputFile('dir:'), 'd/index.html');
  assert.equal(pageUrl('tag:ドラマ'), `t/${encodeURIComponent('ドラマ')}/`);
});

test('log pages live in a directory under their work', () => {
  assert.equal(outputFile('log:mgx3a1k/mgabd456k2'), 'w/k/mgx3a1k/mgabd456k2/index.html');
  assert.equal(pageUrl('log:mgx3a1k/mgabd456k2'), 'w/k/mgx3a1k/mgabd456k2/');
});

test('season pages live under s/', () => {
  assert.equal(outputFile('season:2026-autumn'), 's/2026-autumn/index.html');
  assert.equal(pageUrl('season:2026-autumn'), 's/2026-autumn/');
  assert.equal(outputFile('seasons'), 's/index.html');
});

test('work pages and data files are split by the last character of the id', () => {
  assert.equal(outputFile('work:mgx3a1k'), 'w/k/mgx3a1k/index.html');
  assert.equal(pageUrl('work:mgx3a1k'), 'w/k/mgx3a1k/');
  assert.equal(workDataPath('mgx3a1k'), 'k/mgx3a1k.json');
});
