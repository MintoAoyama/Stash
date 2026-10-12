import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { generate, SCHEMA_FILE, TYPES_FILE } from '../scripts/gen-types.ts';
import { isValidWorkId } from '../src/pages.ts';

const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
const validate = new Ajv2020.default({ allErrors: true, strict: true }).compile(schema);

const valid = () => ({
  id: 'a1b2',
  type: 'movie',
  title: 'タイトル',
  path: 'movies/2026',
  tags: ['SF'],
  year: 2010,
  coverUrl: 'https://example.com/a.jpg',
  externalIds: { tmdb: 'movie/1' },
  logs: [
    { id: 'l1', author: 'alice', loggedAt: '2026-10-11', rating: 4, text: '', program: { channel: 'ch', date: '2026-10-11', start: '21:00' } },
    { id: 'l2', author: 'bob', loggedAt: '2026-10-12', rating: null, text: 'x', program: null },
  ],
});

test('generated types are in sync with the schema (run `npm run gen`)', async () => {
  assert.equal(readFileSync(TYPES_FILE, 'utf8'), await generate());
});

test('a complete work validates', () => {
  assert.ok(validate(valid()), JSON.stringify(validate.errors));
});

test('optional fields may be empty strings, as the producer writes them', () => {
  assert.ok(validate({ ...valid(), status: '', platform: '', coverUrl: '', creators: [], year: null }), JSON.stringify(validate.errors));
});

test('unknown properties and unknown media types are tolerated', () => {
  assert.ok(validate({ ...valid(), type: 'podcast', futureField: 1 }), JSON.stringify(validate.errors));
});

const invalid: [string, (w: ReturnType<typeof valid>) => unknown][] = [
  ['missing title', (w) => ({ ...w, title: '' })],
  ['unsafe id', (w) => ({ ...w, id: '../x' })],
  ['uppercase id', (w) => ({ ...w, id: 'A1b2' })],
  ['id ending with a hyphen', (w) => ({ ...w, id: 'a1b2-' })],
  ['id starting with a hyphen', (w) => ({ ...w, id: '-a1b2' })],
  ['missing logs', ({ logs: _, ...w }) => w],
  ['bad date', (w) => ({ ...w, logs: [{ ...w.logs[0], loggedAt: '2026/10/11' }] })],
  ['rating out of range', (w) => ({ ...w, logs: [{ ...w.logs[0], rating: 6 }] })],
  ['non-https cover', (w) => ({ ...w, coverUrl: 'http://example.com/a.jpg' })],
  ['program without channel', (w) => ({ ...w, logs: [{ ...w.logs[0], program: { date: '2026-10-11' } }] })],
];
for (const [name, mutate] of invalid) {
  test(`rejects: ${name}`, () => {
    assert.equal(validate(mutate(valid())), false);
  });
}

test('ids may be a single character or contain inner hyphens', () => {
  for (const id of ['a', '7', 'a-b', 'mgx3a1k']) assert.ok(validate({ ...valid(), id }), id);
});

test('isValidWorkId agrees with the schema', () => {
  for (const id of ['a', 'a-b', 'mgx3a1k', 'A1', 'ab-', '-ab', 'a_b', '', '../x']) {
    assert.equal(isValidWorkId(id), validate({ ...valid(), id }), id);
  }
});

test('every file under data/works validates', () => {
  const dir = join(import.meta.dirname, '../data/works');
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((n) => n.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    assert.ok(validate(data), `${name}: ${JSON.stringify(validate.errors)}`);
  }
});
