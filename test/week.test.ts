import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weekDays, weekLabel, weekOf, weekRange } from '../src/week.ts';

test('a week runs Monday to Sunday and belongs to the month of its Thursday', () => {
  // 2026-08-01 is a Saturday: its week (7/27-8/2) has its Thursday in July.
  assert.equal(weekOf('2026-07-27'), '2026-07-5');
  assert.equal(weekOf('2026-08-02'), '2026-07-5');
  assert.equal(weekOf('2026-08-03'), '2026-08-1');
  assert.equal(weekOf('2026-08-09'), '2026-08-1');
  assert.equal(weekOf('2026-08-10'), '2026-08-2');
});

test('weeks across a year end belong to the year of their Thursday', () => {
  assert.equal(weekOf('2027-01-03'), '2026-12-5');
  assert.equal(weekOf('2027-01-04'), '2027-01-1');
  assert.equal(weekOf('2025-12-29'), '2026-01-1');
});

test('weekOf ignores what is not a date', () => {
  for (const bad of ['', '2026-02-30', '2026-13-01', '2026/08/03', 'x']) assert.equal(weekOf(bad), undefined, bad);
});

test('weekDays gives the Monday and the Sunday, and null for a week the month does not have', () => {
  assert.deepEqual(weekDays('2026-08-1'), { start: '2026-08-03', end: '2026-08-09' });
  assert.deepEqual(weekDays('2026-12-5'), { start: '2026-12-28', end: '2027-01-03' });
  assert.equal(weekDays('2026-08-5'), null);
  assert.equal(weekDays('2026-08'), null);
});

test('labels and ranges', () => {
  assert.equal(weekLabel('2026-08-1'), '2026年8月1週目');
  assert.equal(weekRange('2026-07-5'), '7/27〜8/2');
  assert.equal(weekRange('2025-01-6'), '');
});
