import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { buildSiteData } from './aggregate.ts';
import { changesSince, headCommit, loadWorks, workAtCommit } from './data.ts';
import { affectedPages, allPageKeys, outputFile, type PageKey } from './pages.ts';
import { renderPage, type Site } from './render.ts';
import type { SiteConfig } from './types.ts';
import { annotation, DataError } from './validate.ts';

// What a full build clears; anything else in the output (pagefind/ etc.) is left alone.
const GENERATED_ROOTS = ['index.html', 'w', 'd', 't', 'm', 'type', 'assets', 'data'];
const SOURCE_SHA_FILE = '.source-sha';

function loadConfig(repoDir: string): SiteConfig {
  const raw = JSON.parse(readFileSync(join(repoDir, 'site.config.json'), 'utf8')) as Partial<SiteConfig>;
  let basePath = process.env.BASE_PATH ?? raw.basePath ?? '/';
  if (!basePath.startsWith('/')) basePath = `/${basePath}`;
  if (!basePath.endsWith('/')) basePath = `${basePath}/`;
  return { title: raw.title ?? 'stash', basePath, cname: raw.cname };
}

function writeIfChanged(file: string, content: string): boolean {
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

function removePage(outDir: string, rel: string): boolean {
  const file = join(outDir, rel);
  if (!existsSync(file)) return false;
  rmSync(file);
  let dir = dirname(file);
  while (resolve(dir) !== resolve(outDir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
    dir = dirname(dir);
  }
  return true;
}

export interface BuildResult {
  mode: 'full' | 'incremental';
  reason?: string;
  rendered: number;
  written: number;
  removed: number;
}

export function build(repoDir: string, outDir: string, opts: { full?: boolean } = {}): BuildResult {
  const config = loadConfig(repoDir);
  const sinceFile = join(outDir, SOURCE_SHA_FILE);
  const since = existsSync(sinceFile) ? readFileSync(sinceFile, 'utf8').trim() : undefined;
  const changes = opts.full ? ({ full: true, reason: '--full' } as const) : changesSince(repoDir, since);

  const works = loadWorks(repoDir);
  const site: Site = { config, works };

  let keys: Set<PageKey>;
  if (changes.full) {
    for (const r of GENERATED_ROOTS) rmSync(join(outDir, r), { recursive: true, force: true });
    keys = allPageKeys(works.values());
  } else {
    keys = new Set();
    for (const id of changes.ids) {
      for (const k of affectedPages(workAtCommit(repoDir, since!, id), works.get(id))) keys.add(k);
    }
  }

  let written = 0;
  let removed = 0;
  for (const key of keys) {
    const page = renderPage(site, key);
    const rel = outputFile(key);
    if (page === null) {
      if (removePage(outDir, rel)) removed++;
    } else if (writeIfChanged(join(outDir, rel), page)) {
      written++;
    }
  }

  // Depends on every work, so it is rewritten on every build.
  writeIfChanged(join(outDir, 'data/site.json'), `${JSON.stringify(buildSiteData(works.values()))}\n`);
  if (changes.full) cpSync(join(repoDir, 'assets'), join(outDir, 'assets'), { recursive: true });
  // Only when the output is the root of its own Pages site.
  if (config.cname) {
    writeIfChanged(join(outDir, '.nojekyll'), '');
    writeIfChanged(join(outDir, 'CNAME'), `${config.cname}\n`);
  }
  writeFileSync(sinceFile, `${headCommit(repoDir)}\n`);

  return {
    mode: changes.full ? 'full' : 'incremental',
    reason: changes.full ? changes.reason : undefined,
    rendered: keys.size,
    written,
    removed,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'out' }, full: { type: 'boolean', default: false } } });
  mkdirSync(values.out, { recursive: true });
  try {
    console.log(JSON.stringify(build(process.cwd(), values.out, { full: values.full })));
  } catch (e) {
    if (!(e instanceof DataError)) throw e;
    for (const p of e.problems) console.error(process.env.GITHUB_ACTIONS ? annotation(p) : `${p.file}: ${p.message}`);
    process.exitCode = 1;
  }
}
