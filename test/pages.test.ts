import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affectedPages, outputFile, pageKeysForWork, pageUrl, safeSegment, workDataPath } from '../src/pages.ts';
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

test('pageKeysForWork covers the work, every ancestor dir, tags, months and type', () => {
  assert.deepEqual(
    [...pageKeysForWork(work())].sort(),
    ['dir:', 'dir:movies', 'dir:movies/2026', 'month:2026-10', 'tag:SF', 'tags', 'type:movie', 'work:w1', 'year:2026'].sort(),
  );
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
  assert.equal(outputFile('dir:'), 'd/index.html');
  assert.equal(pageUrl('tag:ドラマ'), `t/${encodeURIComponent('ドラマ')}/`);
});

test('work pages and data files are split by the last character of the id', () => {
  assert.equal(outputFile('work:mgx3a1k'), 'w/k/mgx3a1k/index.html');
  assert.equal(pageUrl('work:mgx3a1k'), 'w/k/mgx3a1k/');
  assert.equal(workDataPath('mgx3a1k'), 'k/mgx3a1k.json');
});
