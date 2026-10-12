import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isValidWorkId, workDataPath } from './pages.ts';
import { MEDIA_TYPES, type Log, type MediaType, type Work } from './types.ts';
import { DataError, validateWorkFile, type DataProblem } from './validate.ts';

export const WORKS_DIR = 'data/works';

// Mirrors paths-ignore in .github/workflows/build.yml (plus .github/ itself).
const IGNORED_PREFIXES = ['schema/', 'scripts/', 'test/', 'docs/', '.github/', 'README.md', '.gitignore'];

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function parseLog(v: unknown): Log | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const loggedAt = asString(o.loggedAt);
  if (!o.id || !/^\d{4}-\d{2}-\d{2}$/.test(loggedAt)) return null;
  const program = typeof o.program === 'object' && o.program !== null ? (o.program as Log['program']) : null;
  return {
    id: String(o.id),
    author: asString(o.author) || '?',
    loggedAt,
    rating: typeof o.rating === 'number' ? o.rating : null,
    text: asString(o.text),
    program,
  };
}

export function parseWork(json: string, source: string): Work | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(json);
  } catch (e) {
    console.warn(`skip ${source}: invalid JSON (${(e as Error).message})`);
    return null;
  }
  const id = asString(o.id);
  if (!isValidWorkId(id) || !asString(o.title)) {
    console.warn(`skip ${source}: missing or invalid id/title`);
    return null;
  }
  const type = (MEDIA_TYPES as readonly string[]).includes(asString(o.type)) ? (o.type as MediaType) : 'other';
  const logs = Array.isArray(o.logs) ? o.logs.map(parseLog).filter((l): l is Log => l !== null) : [];
  return {
    id,
    type,
    title: asString(o.title),
    path: asString(o.path),
    tags: Array.isArray(o.tags) ? o.tags.map(String).filter((t) => t.trim() !== '') : [],
    status: asString(o.status) || undefined,
    platform: asString(o.platform) || undefined,
    year: typeof o.year === 'number' ? o.year : null,
    creators: Array.isArray(o.creators) ? o.creators.map(String) : [],
    coverUrl: /^https:\/\//.test(asString(o.coverUrl)) ? asString(o.coverUrl) : undefined,
    externalIds: typeof o.externalIds === 'object' && o.externalIds !== null ? (o.externalIds as Record<string, string>) : {},
    logs,
  };
}

export function loadWorks(repoDir: string): Map<string, Work> {
  const dir = join(repoDir, WORKS_DIR);
  const works = new Map<string, Work>();
  const problems: DataProblem[] = [];
  // Git drops the directory once its last work is deleted.
  if (!existsSync(dir)) return works;
  for (const relPath of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (!relPath.endsWith('.json')) continue;
    const json = readFileSync(join(dir, relPath), 'utf8');
    const found = validateWorkFile(json, relPath);
    problems.push(...found.map((p) => ({ ...p, file: `${WORKS_DIR}/${relPath}` })));
    const work = found.length === 0 ? parseWork(json, relPath) : null;
    if (work) works.set(work.id, work);
  }
  if (problems.length > 0) throw new DataError(problems);
  return works;
}

function git(repoDir: string, args: string[], quiet = false): string {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'],
  });
}

export type ChangeSet = { full: true; reason: string } | { full: false; ids: Set<string> };

export function changesSince(repoDir: string, since: string | undefined): ChangeSet {
  if (!since) return { full: true, reason: 'no previous build' };
  try {
    git(repoDir, ['cat-file', '-e', `${since}^{commit}`], true);
  } catch {
    return { full: true, reason: `previous build commit ${since} not found` };
  }
  const files = git(repoDir, ['diff', '--name-only', '--no-renames', since, 'HEAD']).split('\n').filter(Boolean);
  const ids = new Set<string>();
  for (const f of files) {
    if (f.startsWith(`${WORKS_DIR}/`) && f.endsWith('.json')) ids.add(basename(f, '.json'));
    else if (!IGNORED_PREFIXES.some((p) => f.startsWith(p))) return { full: true, reason: `${f} changed` };
  }
  return { full: false, ids };
}

export function workAtCommit(repoDir: string, sha: string, id: string): Work | undefined {
  try {
    return parseWork(git(repoDir, ['show', `${sha}:${WORKS_DIR}/${workDataPath(id)}`], true), `${sha}:${id}`) ?? undefined;
  } catch {
    return undefined; // did not exist at that commit
  }
}

export function headCommit(repoDir: string): string {
  return git(repoDir, ['rev-parse', 'HEAD']).trim();
}
