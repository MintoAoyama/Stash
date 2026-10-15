import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSeasons, seasonLabel, seasonOf } from '../src/season.ts';
import type { Work } from '../src/types.ts';

const work = (season?: string): Work => ({ id: 'w1', type: 'tv', title: 't', path: '', tags: [], season, logs: [] });

test('seasons sort newest first: year descending, then autumn, summer, spring, winter', () => {
  const sorted = ['2025-autumn', '2026-spring', '2026-autumn', '2026-winter', '2026-summer'].sort(compareSeasons);
  assert.deepEqual(sorted, ['2026-autumn', '2026-summer', '2026-spring', '2026-winter', '2025-autumn']);
});

test('seasons are labelled by year and season', () => {
  assert.equal(seasonLabel('2026-autumn'), '2026秋');
  assert.equal(seasonLabel('2026-winter'), '2026冬');
  assert.equal(seasonLabel('2026-spring'), '2026春');
  assert.equal(seasonLabel('2026-summer'), '2026夏');
});

test('seasonOf ignores empty and malformed values', () => {
  assert.equal(seasonOf(work('2026-autumn')), '2026-autumn');
  for (const bad of [undefined, '', '2026-fall', 'autumn-2026', '../x']) assert.equal(seasonOf(work(bad)), undefined, String(bad));
});
