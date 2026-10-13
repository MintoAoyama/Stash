import { MEDIA_TYPES, type Work } from './types.ts';

// Pages are identified by string keys so that affected sets can be unioned cheaply:
//   home | work:<id> | log:<workId>/<logId> | dir:<a/b> (root is "dir:") | tags | tag:<t> | year:<yyyy> | month:<yyyy-MM> | type:<t>
export type PageKey = string;

const UNSAFE_SEGMENT = /[\/\\:*?"<>|#%\u0000-\u001f]/g;

// Jekyll does not serve names starting with "_" or ".".
export function safeSegment(raw: string): string {
  const s = raw.trim().replace(UNSAFE_SEGMENT, '-').replace(/^[._]/, '-');
  return s === '' ? '-' : s;
}

export function pathSegments(path: string): string[] {
  return path.split('/').filter((s) => s.trim() !== '').map(safeSegment);
}

// Same pattern as the id in schema/work.schema.json.
export function isValidWorkId(id: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(id);
}

// Mirrored by workLink in assets/site.js.
export function workShard(id: string): string {
  return id.slice(-1);
}

// Relative to data/works.
export function workDataPath(id: string): string {
  return `${workShard(id)}/${id}.json`;
}

export function logKey(workId: string, logId: string): PageKey {
  return `log:${workId}/${logId}`;
}

// The argument of a log key: [workId, logId].
export function splitLogArg(arg: string): [string, string] {
  const i = arg.indexOf('/');
  return [arg.slice(0, i), arg.slice(i + 1)];
}

export function monthsOf(work: Work): string[] {
  return [...new Set(work.logs.map((l) => l.loggedAt.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))];
}

export function pageKeysForWork(work: Work): Set<PageKey> {
  const keys = new Set<PageKey>([`work:${work.id}`, `type:${work.type}`, 'tags']);
  for (const log of work.logs) keys.add(logKey(work.id, log.id));
  const segs = pathSegments(work.path);
  for (let i = 0; i <= segs.length; i++) keys.add(`dir:${segs.slice(0, i).join('/')}`);
  for (const tag of work.tags) keys.add(`tag:${safeSegment(tag)}`);
  for (const month of monthsOf(work)) {
    keys.add(`month:${month}`);
    keys.add(`year:${month.slice(0, 4)}`);
  }
  return keys;
}

export function affectedPages(before: Work | undefined, after: Work | undefined): Set<PageKey> {
  const keys = new Set<PageKey>();
  for (const w of [before, after]) {
    if (w) for (const k of pageKeysForWork(w)) keys.add(k);
  }
  return keys;
}

export function allPageKeys(works: Iterable<Work>): Set<PageKey> {
  const keys = new Set<PageKey>(['home', 'dir:', 'tags']);
  for (const t of MEDIA_TYPES) keys.add(`type:${t}`);
  for (const w of works) for (const k of pageKeysForWork(w)) keys.add(k);
  return keys;
}

export function splitKey(key: PageKey): [string, string] {
  const i = key.indexOf(':');
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
}

export function outputFile(key: PageKey): string {
  const [kind, arg] = splitKey(key);
  switch (kind) {
    case 'home':
      return 'index.html';
    case 'work':
      return `w/${workShard(arg)}/${arg}/index.html`;
    case 'log': {
      const [workId, logId] = splitLogArg(arg);
      return `w/${workShard(workId)}/${workId}/${logId}/index.html`;
    }
    case 'dir':
      return arg === '' ? 'd/index.html' : `d/${arg}/index.html`;
    case 'tags':
      return 't/index.html';
    case 'tag':
      return `t/${arg}/index.html`;
    case 'year':
      return `m/${arg}/index.html`;
    case 'month':
      return `m/${arg.replace('-', '/')}/index.html`;
    case 'type':
      return `type/${arg}/index.html`;
    default:
      throw new Error(`unknown page key: ${key}`);
  }
}

// Relative to basePath, with a trailing slash.
export function pageUrl(key: PageKey): string {
  const file = outputFile(key);
  const dir = file.slice(0, -'index.html'.length);
  return dir.split('/').map(encodeURIComponent).join('/');
}
