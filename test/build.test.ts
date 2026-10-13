import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from '../src/build.ts';
import { changesSince, loadWorks } from '../src/data.ts';
import { DataError } from '../src/validate.ts';

const root = join(import.meta.dirname, '..');
let repo: string;
let out: string;

function git(...args: string[]): void {
  execFileSync('git', ['-C', repo, '-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { stdio: 'ignore' });
}

function writeDataFile(relPath: string, content: string): void {
  const file = join(repo, 'data/works', relPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function writeWork(id: string, over: Record<string, unknown> = {}): void {
  const work = {
    id,
    type: 'movie',
    title: `作品 ${id}`,
    path: 'movies',
    tags: ['SF'],
    logs: [{ id: `${id}-l1`, author: 'alice', loggedAt: '2026-10-11', rating: 4, text: '面白かった' }],
    ...over,
  };
  writeDataFile(`${id.slice(-1)}/${id}.json`, JSON.stringify(work));
}

function commit(message: string): void {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'stash-repo-'));
  out = mkdtempSync(join(tmpdir(), 'stash-out-'));
  git('init', '-q');
  cpSync(join(root, 'assets'), join(repo, 'assets'), { recursive: true });
  writeFileSync(join(repo, 'site.config.json'), JSON.stringify({ title: 'stash', basePath: '/' }));
  mkdirSync(join(repo, 'data/works'), { recursive: true });
  writeWork('a1');
  writeWork('b2', { type: 'book', path: 'books', tags: ['エッセイ'] });
  commit('initial');
});

after(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('first build is full and renders every page', () => {
  const r = build(repo, out);
  assert.equal(r.mode, 'full');
  for (const f of ['index.html', 'w/1/a1/index.html', 'w/1/a1/a1-l1/index.html', 'w/2/b2/index.html', 'd/movies/index.html', 't/SF/index.html', 'm/2026/10/index.html', 'data/site.json', 'assets/site.css', '.source-sha']) {
    assert.ok(existsSync(join(out, f)), f);
  }
  const site = JSON.parse(readFileSync(join(out, 'data/site.json'), 'utf8'));
  assert.deepEqual(site.counts, { works: 2, logs: 2 });
});

test('editing one work re-renders only the pages it touches', () => {
  const untouched = readFileSync(join(out, 'w/2/b2/index.html'), 'utf8');
  writeWork('a1', { tags: ['ドラマ'] });
  commit('retag a1');

  const r = build(repo, out);
  assert.equal(r.mode, 'incremental');
  assert.ok(r.rendered < 15, `rendered ${r.rendered} pages`);
  assert.ok(!existsSync(join(out, 't/SF/index.html')), 'empty tag page removed');
  assert.ok(existsSync(join(out, 't/ドラマ/index.html')));
  assert.equal(readFileSync(join(out, 'w/2/b2/index.html'), 'utf8'), untouched);
});

test('deleting a work removes its page, its emptied shard directory and empty directory pages', () => {
  rmSync(join(repo, 'data/works/2/b2.json'));
  commit('delete b2');

  const r = build(repo, out);
  assert.equal(r.mode, 'incremental');
  assert.ok(!existsSync(join(out, 'w/2')));
  assert.ok(!existsSync(join(out, 'd/books')));
  const site = JSON.parse(readFileSync(join(out, 'data/site.json'), 'utf8'));
  assert.equal(site.counts.works, 1);
});

test('adding a work renders only its sharded page and leaves siblings in the same shard untouched', () => {
  const since = readFileSync(join(out, '.source-sha'), 'utf8').trim();
  const sibling = readFileSync(join(out, 'w/1/a1/index.html'), 'utf8');
  writeWork('c1', { path: 'others', tags: ['新規'] });
  commit('add c1');

  assert.deepEqual(changesSince(repo, since), { full: false, ids: new Set(['c1']) });
  const r = build(repo, out);
  assert.equal(r.mode, 'incremental');
  assert.ok(r.rendered < 15, `rendered ${r.rendered} pages`);
  assert.ok(existsSync(join(out, 'w/1/c1/index.html')));
  assert.equal(readFileSync(join(out, 'w/1/a1/index.html'), 'utf8'), sibling);
});

test('changes outside data/ trigger a full rebuild', () => {
  writeFileSync(join(repo, 'assets/site.css'), '/* changed */\n', { flag: 'a' });
  commit('tweak css');
  const r = build(repo, out);
  assert.equal(r.mode, 'full');
  assert.match(r.reason ?? '', /assets\/site\.css/);
});

test('user text is escaped', () => {
  writeWork('x9', { title: '<script>alert(1)</script>', logs: [{ id: 'x', author: 'a', loggedAt: '2026-01-01', text: '<img src=x onerror=alert(1)>' }] });
  commit('xss');
  build(repo, out);
  const page = readFileSync(join(out, 'w/9/x9/index.html'), 'utf8');
  assert.ok(!page.includes('<script>alert'));
  assert.ok(!page.includes('<img src=x'));
});

test('a schema violation stops the build, leaves the output untouched, and the next good build catches up', () => {
  const sha = readFileSync(join(out, '.source-sha'), 'utf8');
  const site = readFileSync(join(out, 'data/site.json'), 'utf8');

  writeWork('bad1', { title: '' });
  commit('break bad1');
  assert.throws(
    () => build(repo, out),
    (e: unknown) => e instanceof DataError && e.problems.some((p) => p.file === 'data/works/1/bad1.json' && p.message.startsWith('/title')),
  );
  assert.equal(readFileSync(join(out, '.source-sha'), 'utf8'), sha);
  assert.equal(readFileSync(join(out, 'data/site.json'), 'utf8'), site);
  assert.ok(!existsSync(join(out, 'w/1/bad1')));

  writeWork('bad1');
  commit('fix bad1');
  assert.equal(build(repo, out).mode, 'incremental');
  assert.ok(existsSync(join(out, 'w/1/bad1/index.html')));
});

const validBody = (id: string) => JSON.stringify({ id, type: 'movie', title: 't', path: '', tags: [], logs: [] });
const duplicateLogs = JSON.stringify({
  id: 'broken',
  type: 'movie',
  title: 't',
  path: '',
  tags: [],
  logs: [1, 2].map(() => ({ id: 'same', author: 'a', loggedAt: '2026-10-11', text: '' })),
});
const brokenFiles: [string, string, string, string][] = [
  ['unparsable JSON', 'n/broken.json', '{broken', 'invalid JSON'],
  ['id that differs from the file name', 'n/broken.json', validBody('other'), 'file path'],
  ['work file in a directory that is not the shard of its id', 'x/broken.json', validBody('broken'), 'file path'],
  ['work file directly under data/works', 'broken.json', validBody('broken'), 'file path'],
  ['work file nested deeper than the shard directory', 'n/sub/broken.json', validBody('broken'), 'file path'],
  ['log ids that are not unique within the work', 'n/broken.json', duplicateLogs, 'unique'],
];
for (const [name, relPath, content, expected] of brokenFiles) {
  test(`rejects ${name}`, () => {
    writeDataFile(relPath, content);
    commit('add broken');
    assert.throws(
      () => build(repo, out),
      (e: unknown) => e instanceof DataError && e.problems.some((p) => p.file === `data/works/${relPath}` && p.message.includes(expected)),
    );
    rmSync(join(repo, 'data/works', relPath));
    commit('remove broken');
    build(repo, out);
  });
}

test('unknown media types and extra properties do not stop the build', () => {
  writeWork('lenient1', { type: 'podcast', futureField: { a: 1 } });
  commit('add lenient1');
  build(repo, out);
  assert.match(readFileSync(join(out, 'w/1/lenient1/index.html'), 'utf8'), /その他/);
});

test('a missing data/works directory means no works', () => {
  const empty = mkdtempSync(join(tmpdir(), 'stash-empty-'));
  try {
    assert.equal(loadWorks(empty).size, 0);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

const episodeLog = (id: string, episode: number, over: Record<string, unknown> = {}) => ({
  id,
  author: 'alice',
  loggedAt: '2026-10-12',
  rating: 4,
  text: `第${episode}話の感想`,
  episode,
  subtitle: `サブタイトル${episode}`,
  ...over,
});

test('every log gets a page under its work', () => {
  writeWork('tv1', { type: 'tv', logs: [episodeLog('ep1', 1), episodeLog('ep2', 2)] });
  commit('add tv1');
  build(repo, out);
  const page = readFileSync(join(out, 'w/1/tv1/ep2/index.html'), 'utf8');
  assert.match(page, /第2話 サブタイトル2/);
  assert.match(page, /rel="prev" href="\/w\/1\/tv1\/ep1\/"/);
  assert.ok(existsSync(join(out, 'w/1/tv1/ep1/index.html')));
});

test('editing a work rewrites its log pages but not those of other works', () => {
  const other = readFileSync(join(out, 'w/1/lenient1/index.html'), 'utf8');
  writeWork('tv1', { type: 'tv', logs: [episodeLog('ep1', 1), episodeLog('ep2', 2), episodeLog('ep3', 3)] });
  commit('add an episode to tv1');
  const r = build(repo, out);
  assert.equal(r.mode, 'incremental');
  assert.match(readFileSync(join(out, 'w/1/tv1/ep3/index.html'), 'utf8'), /第3話 サブタイトル3/);
  assert.match(readFileSync(join(out, 'w/1/tv1/ep2/index.html'), 'utf8'), /rel="next" href="\/w\/1\/tv1\/ep3\/"/);
  assert.equal(readFileSync(join(out, 'w/1/lenient1/index.html'), 'utf8'), other);
});

test('removing a log removes its page and directory but keeps the work page', () => {
  writeWork('tv1', { type: 'tv', logs: [episodeLog('ep1', 1), episodeLog('ep3', 3)] });
  commit('remove ep2 from tv1');
  build(repo, out);
  assert.ok(!existsSync(join(out, 'w/1/tv1/ep2')));
  assert.ok(existsSync(join(out, 'w/1/tv1/ep3/index.html')));
  assert.ok(existsSync(join(out, 'w/1/tv1/index.html')));
  assert.match(readFileSync(join(out, 'w/1/tv1/ep3/index.html'), 'utf8'), /rel="prev" href="\/w\/1\/tv1\/ep1\/"/);
});

test('deleting a work removes its log pages too', () => {
  rmSync(join(repo, 'data/works/1/tv1.json'));
  commit('delete tv1');
  build(repo, out);
  assert.ok(!existsSync(join(out, 'w/1/tv1')));
});
