import assert from 'node:assert/strict';
import { test } from 'node:test';
import { airtimeOrder } from '../src/airtime.ts';

const sorted = (slots: string[]) => [...slots].sort((a, b) => airtimeOrder(a)! - airtimeOrder(b)!);

test('slots go from Monday to Sunday, earliest first within a day', () => {
  assert.deepEqual(sorted(['日曜 19:00〜19:30', '月曜 21:00〜22:00', '月曜 05:45〜07:05', '木曜 20:00〜21:00']), [
    '月曜 05:45〜07:05',
    '月曜 21:00〜22:00',
    '木曜 20:00〜21:00',
    '日曜 19:00〜19:30',
  ]);
});

test('a slot before 05:00 belongs to the night before, as in a program guide', () => {
  assert.deepEqual(sorted(['月曜 01:25〜01:55', '日曜 22:30〜23:00', '月曜 05:45〜07:05', '水曜 01:29〜01:59', '火曜 23:00〜23:30']), [
    '月曜 05:45〜07:05',
    '火曜 23:00〜23:30',
    '水曜 01:29〜01:59',
    '日曜 22:30〜23:00',
    '月曜 01:25〜01:55',
  ]);
});

test('"平日" counts as Monday, and the day may be written without 曜', () => {
  assert.equal(airtimeOrder('平日 11:47〜13:50'), airtimeOrder('月曜 11:47〜13:50'));
  assert.equal(airtimeOrder('土 9:00'), airtimeOrder('土曜日 09:00'));
});

test('free text without a day and a time has no order', () => {
  assert.equal(airtimeOrder(''), undefined);
  assert.equal(airtimeOrder(undefined), undefined);
  assert.equal(airtimeOrder('不定期'), undefined);
  assert.equal(airtimeOrder('21:00〜'), undefined);
});
