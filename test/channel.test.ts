import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelOf } from '../src/channel.ts';
import type { Work } from '../src/types.ts';

const onAir = (id: string, loggedAt: string, channel: string) => ({ id, author: 'あお', loggedAt, text: '', program: { channel, date: loggedAt } });
const work = (over: Partial<Work> = {}): Work => ({ id: 'w1', type: 'tv', title: 't', path: '', tags: [], logs: [], ...over });

test('the work\'s own channel wins over its logs', () => {
  assert.equal(channelOf(work({ channel: 'NHK総合', logs: [onAir('a', '2026-10-01', 'ＢＳ')] })), 'NHK総合');
});

test('without one, the channel its logs mention most often is used', () => {
  const logs = [onAir('a', '2026-10-01', 'ＢＳ'), onAir('b', '2026-10-02', 'NHK総合'), onAir('c', '2026-10-03', 'NHK総合'), onAir('d', '2026-10-04', 'ＢＳ'), onAir('e', '2026-10-05', 'NHK総合')];
  assert.equal(channelOf(work({ logs })), 'NHK総合');
});

test('on a tie the channel of the most recent log wins, whatever the order of the logs', () => {
  const logs = [onAir('b', '2026-10-09', 'ＢＳ'), onAir('a', '2026-10-02', 'NHK総合')];
  assert.equal(channelOf(work({ logs })), 'ＢＳ');
  assert.equal(channelOf(work({ logs: [...logs].reverse() })), 'ＢＳ');
});

test('logs without a program or a channel are ignored, and no channel gives an empty string', () => {
  const logs = [{ id: 'a', author: 'あお', loggedAt: '2026-10-01', text: '' }, onAir('b', '2026-10-02', '')];
  assert.equal(channelOf(work({ logs })), '');
  assert.equal(channelOf(work({ channel: '', logs: [...logs, onAir('c', '2026-10-03', 'TBS')] })), 'TBS');
});
