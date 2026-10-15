import { channelOf } from './channel.ts';
import { compareNewestFirst, coveringLog, episodeLabel, logHeading, neighbours, progressOf, sameEpisodeLogs, type ProgressRow } from './episodes.ts';
import { html, paragraphs, raw, type Raw } from './html.ts';
import { logKey, monthsOf, pageUrl, pathSegments, safeSegment, splitKey, splitLogArg, type PageKey } from './pages.ts';
import { weekLabel, weekOf, weekRange } from './week.ts';
import { compareSeasons, seasonLabel, seasonOf } from './season.ts';
import { MEDIA_TYPE_LABELS, MEDIA_TYPES, type Log, type MediaType, type SiteConfig, type Work } from './types.ts';

export interface Site {
  config: SiteConfig;
  works: Map<string, Work>;
}

// Returns the page HTML, or null when the page has no content and should be removed.
export function renderPage(site: Site, key: PageKey): string | null {
  const [kind, arg] = splitKey(key);
  switch (kind) {
    case 'home':
      return renderHome(site);
    case 'work': {
      const work = site.works.get(arg);
      return work ? renderWork(site, work) : null;
    }
    case 'log':
      return renderLog(site, arg);
    case 'dir':
      return renderDir(site, arg === '' ? [] : arg.split('/'));
    case 'tags':
      return renderTagIndex(site);
    case 'seasons':
      return renderSeasonIndex(site);
    case 'season':
      return renderSeason(site, arg);
    case 'tag':
      return renderList(site, `#${arg}`, [...site.works.values()].filter((w) => w.tags.some((t) => safeSegment(t) === arg)));
    case 'type': {
      const type = arg as MediaType;
      const works = [...site.works.values()].filter((w) => w.type === type);
      return works.length === 0 ? null : renderList(site, MEDIA_TYPE_LABELS[type] ?? arg, works);
    }
    case 'year':
      return renderYear(site, arg);
    case 'month':
      return renderMonth(site, arg);
    case 'week':
      return renderWeek(site, arg);
    default:
      throw new Error(`unknown page key: ${key}`);
  }
}

function url(site: Site, key: PageKey): string {
  return site.config.basePath + pageUrl(key);
}

// footer holds notices that only apply to this page's own content.
function layout(site: Site, title: string, body: Raw, styles?: string, footer?: Raw): string {
  const base = site.config.basePath;
  const fullTitle = title === site.config.title ? title : `${title} | ${site.config.title}`;
  return html`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="stash-base" content="${base}">
<title>${fullTitle}</title>
<link rel="stylesheet" href="${base}assets/site.css">
<script type="module" src="${base}assets/site.js"></script>
${styles ? raw(`<style>${styles}</style>`) : ''}
</head>
<body>
<header class="site-header">
<a class="site-title" href="${base}"><picture>
<source srcset="${base}assets/stash_logo_dark.svg" media="(prefers-color-scheme: dark)">
<img class="site-logo" src="${base}assets/stash_logo_light.svg" alt="${site.config.title}" width="99" height="28">
</picture></a>
<nav class="site-nav">
${MEDIA_TYPES.map((t) => html`<a href="${url(site, `type:${t}`)}" data-nav-type="${t}" hidden>${MEDIA_TYPE_LABELS[t]}</a>`)}
<a href="${url(site, 'seasons')}" data-nav-seasons hidden>シーズン</a>
<a href="${url(site, 'dir:')}">ディレクトリ</a>
<a href="${url(site, 'tags')}">タグ</a>
</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
<p>作品情報の一部は TMDB API を利用しています（This product uses the TMDB API but is not endorsed or certified by TMDB）</p>
${footer ?? ''}
</footer>
</body>
</html>
`.__raw;
}

function stars(rating: number | null | undefined): Raw {
  if (!rating) return raw('');
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return html`<span class="rating" aria-label="評価 ${r} / 5">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
}

function latestLog(work: Work): Log | undefined {
  return work.logs.reduce<Log | undefined>((a, l) => (!a || l.loggedAt > a.loggedAt ? l : a), undefined);
}

function byLatestDesc(a: Work, b: Work): number {
  return (latestLog(b)?.loggedAt ?? '').localeCompare(latestLog(a)?.loggedAt ?? '') || a.id.localeCompare(b.id);
}

function authorsOf(works: Work[]): string[] {
  return [...new Set(works.flatMap((w) => w.logs.map((l) => l.author)))].sort();
}

function cover(work: Work, size: 'small' | 'thumb' | 'full'): Raw {
  if (!work.coverUrl) return raw('');
  return html`<img class="cover cover--${size}" src="${work.coverUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" style="view-transition-name: cover-${work.id}">`;
}

function cardList(site: Site, works: Work[]): { body: Raw; styles: string } {
  const sorted = [...works].sort(byLatestDesc);
  const types = MEDIA_TYPES.filter((t) => sorted.some((w) => w.type === t));
  const authors = authorsOf(sorted);
  const rules: string[] = [];
  for (const t of types) rules.push(`body:has(#ft-${t}:checked) .card:not([data-type="${t}"]){display:none}`);
  authors.forEach((_, i) => rules.push(`body:has(#fa-${i}:checked) .card:not([data-a~="a${i}"]){display:none}`));

  const typeFilter =
    types.length > 1
      ? html`<fieldset class="filter"><legend>種類</legend>
<label><input type="radio" name="ft" id="ft-all" checked>すべて</label>
${types.map((t) => html`<label><input type="radio" name="ft" id="ft-${t}">${MEDIA_TYPE_LABELS[t]}</label>`)}
</fieldset>`
      : '';
  const authorFilter =
    authors.length > 1
      ? html`<fieldset class="filter"><legend>書いた人</legend>
<label><input type="radio" name="fa" id="fa-all" checked>全員</label>
${authors.map((a, i) => html`<label><input type="radio" name="fa" id="fa-${i}">${a}</label>`)}
</fieldset>`
      : '';

  const cards = sorted.map((w) => {
    const latest = latestLog(w);
    const a = [...new Set(w.logs.map((l) => `a${authors.indexOf(l.author)}`))].join(' ');
    return html`<li class="card${w.coverUrl ? '' : ' card--text'}" data-type="${w.type}" data-a="${a}">
<a href="${url(site, `work:${w.id}`)}">${cover(w, 'thumb')}<span class="card-title">${w.title}</span></a>
<span class="card-meta">${MEDIA_TYPE_LABELS[w.type]}${latest ? html` · <time datetime="${latest.loggedAt}">${latest.loggedAt}</time>` : ''} ${stars(latest?.rating)}</span>
</li>`;
  });

  return {
    body: html`<div class="filters">${typeFilter}${authorFilter}</div><ul class="cards${sorted.some((w) => w.coverUrl) ? '' : ' cards--text'}">${cards}</ul>`,
    styles: rules.join('\n'),
  };
}

function renderList(site: Site, title: string, works: Work[], lead?: Raw): string | null {
  if (works.length === 0) return null;
  const list = cardList(site, works);
  return layout(site, title, html`<h1>${title}</h1>${lead ?? ''}<p class="count">${works.length} 件</p>${list.body}`, list.styles);
}

function breadcrumbs(site: Site, segs: string[]): Raw {
  const items = [html`<a href="${url(site, 'dir:')}">/</a>`];
  segs.forEach((s, i) => items.push(html`<a href="${url(site, `dir:${segs.slice(0, i + 1).join('/')}`)}">${s}</a>`));
  return html`<nav class="breadcrumbs">${items.map((it, i) => (i < 2 ? it : html` / ${it}`))}</nav>`;
}

const EXCERPT_CHARS = 140;
// Beyond this the cells say nothing at a glance, so only the summary is shown.
const MAX_GRID_EPISODES = 500;

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return { text, truncated: false };
  return { text: `${chars.slice(0, max).join('').trimEnd()}…`, truncated: true };
}

function programInfo(log: Log, work: Work, onWorkPage: boolean): { brief: boolean; html: Raw } {
  const program = log.program;
  if (!program) return { brief: false, html: raw('') };
  const sameChannel = onWorkPage && program.channel === channelOf(work);
  const brief = sameChannel && !!work.airtime;
  let date = program.date ?? '';
  if (onWorkPage && date === log.loggedAt) date = '';
  else if (onWorkPage && date.slice(0, 4) === log.loggedAt.slice(0, 4)) date = date.slice(5);
  const link = program.url?.startsWith('https://') ? html`<a href="${program.url}" rel="noopener noreferrer">番組ページ</a>` : '';

  if (brief) {
    const parts = [date ? `${date} 放送` : '', link].filter(Boolean);
    return { brief, html: parts.length ? html`<span class="program"> · ${parts.map((p, i) => html`${i ? ' · ' : ''}${p}`)}</span>` : raw('') };
  }
  const time = program.start ? `${program.start}${program.end ? `–${program.end}` : ''}` : '';
  const title = program.title && program.title !== work.title ? `「${program.title}」` : '';
  const text = [sameChannel ? '' : program.channel, date, time, title].filter(Boolean).join(' ');
  if (!text && !link) return { brief, html: raw('') };
  return { brief, html: html`<div class="program">${text}${text && link ? ' ' : ''}${link}</div>` };
}

// NHK's terms require this credit wherever its program information is shown.
function nhkCredit(logs: Log[]): Raw {
  return logs.some((l) => l.program?.source === 'nhk') ? html`<p>ＮＨＫ番組の情報提供:ＮＨＫ</p>` : raw('');
}

function progressCells(site: Site, work: Work, row: ProgressRow, total: number): Raw {
  return html`<span class="progress-cells">${Array.from({ length: total }, (_, i) => {
    const episode = i + 1;
    const log = coveringLog(row, episode);
    if (!log) return html`<span class="ep" title="第${episode}話"></span>`;
    const label = `第${episode}話 ${log.loggedAt}`;
    return html`<a class="ep ep--seen" href="${url(site, logKey(work.id, log.id))}" title="${label}" aria-label="${label}"></a>`;
  })}</span>`;
}

// One row per author: which episodes they have logged, as filled cells that link to the log.
function progressGrid(site: Site, work: Work): Raw {
  const progress = progressOf(work);
  if (!progress) return raw('');
  const cells = (row: ProgressRow) => (progress.total <= MAX_GRID_EPISODES ? progressCells(site, work, row, progress.total) : '');
  const summary = (row: ProgressRow) => `${row.count}${progress.countKnown ? ` / ${progress.total}` : ''} 話`;
  const rows = progress.rows.map(
    (row) => html`<li class="progress-row"><span class="progress-author">${row.author}</span>${cells(row)}<span class="progress-count">${summary(row)}</span></li>`,
  );
  return html`<ul class="progress" aria-label="視聴の進み具合">${rows}</ul>`;
}

// logHeading with the episode and the subtitle as their own elements.
function headingHtml(log: Log): Raw {
  const ep = episodeLabel(log);
  const parts = [ep ? html`<span class="log-ep">${ep}</span>` : '', log.subtitle ? html`<span class="log-sub">${log.subtitle}</span>` : ''];
  return html`${parts.filter((p) => p !== '').map((p, i) => (i === 0 ? p : html` ${p}`))}`;
}

function renderWork(site: Site, work: Work): string {
  const segs = pathSegments(work.path);
  const logs = [...work.logs].sort(compareNewestFirst);
  const authors = authorsOf([work]);

  const logItem = (l: Log) => {
    const href = url(site, logKey(work.id, l.id));
    const heading = logHeading(l);
    const excerpt = truncate(l.text, EXCERPT_CHARS);
    const date = html`<time datetime="${l.loggedAt}">${l.loggedAt}</time>`;
    const head = heading
      ? html`<a class="log-title" href="${href}">${headingHtml(l)}</a><a href="${url(site, `month:${l.loggedAt.slice(0, 7)}`)}">${date}</a>`
      : html`<a href="${href}">${date}</a>`;
    const program = programInfo(l, work, true);
    return html`<li class="log">
<div class="log-head">${head} <span class="author">${l.author}</span> ${stars(l.rating)}${program.brief ? program.html : ''}</div>
${program.brief ? '' : program.html}
${paragraphs(excerpt.text)}
${excerpt.truncated ? html`<p class="log-more"><a href="${href}">続きを読む</a></p>` : ''}
</li>`;
  };

  const logsBody =
    authors.length > 1
      ? html`<div class="logs logs--by-author">${authors.map(
          (a) => html`<section><h2>${a}</h2><ol class="log-list">${logs.filter((l) => l.author === a).map(logItem)}</ol></section>`,
        )}</div>`
      : html`<ol class="log-list">${logs.map(logItem)}</ol>`;

  const season = seasonOf(work);
  const meta = [
    html`<a href="${url(site, `type:${work.type}`)}">${MEDIA_TYPE_LABELS[work.type]}</a>`,
    season ? html`<a href="${url(site, `season:${season}`)}">${seasonLabel(season)}</a>` : '',
    channelOf(work),
    work.airtime ?? '',
    work.episodeCount ? `全${work.episodeCount}話` : '',
    work.year ? html`${work.year}` : '',
    work.platform ? html`${work.platform}` : '',
    work.creators?.length ? html`${work.creators.join('、')}` : '',
    work.officialUrl?.startsWith('https://') ? html`<a href="${work.officialUrl}" rel="noopener noreferrer">公式サイト</a>` : '',
  ].filter((m) => m !== '');

  return layout(
    site,
    work.title,
    html`<article class="work">
${breadcrumbs(site, segs)}
<div class="work-head">
${cover(work, 'full')}
<div>
<h1>${work.title}</h1>
<p class="work-meta">${meta.map((m, i) => (i === 0 ? m : html` · ${m}`))}</p>
${work.tags.length ? html`<ul class="tags">${work.tags.map((t) => html`<li><a href="${url(site, `tag:${safeSegment(t)}`)}">#${t}</a></li>`)}</ul>` : ''}
${progressGrid(site, work)}
</div>
</div>
${logsBody}
</article>`,
    undefined,
    nhkCredit(work.logs),
  );
}

function logNav(site: Site, work: Work, log: Log): Raw {
  const { prev, next } = neighbours(work, log);
  const link = (rel: 'prev' | 'next', l: Log) => {
    const label = logHeading(l) || l.loggedAt;
    return html`<a rel="${rel}" href="${url(site, logKey(work.id, l.id))}">${rel === 'prev' ? `← ${label}` : `${label} →`}</a>`;
  };
  return html`<nav class="log-nav" aria-label="前後の記録">${prev ? link('prev', prev) : ''}${next ? link('next', next) : ''}</nav>`;
}

// Links to what the other authors wrote about the same episode.
function sameEpisode(site: Site, work: Work, log: Log): Raw {
  const others = sameEpisodeLogs(work, log);
  if (others.length === 0) return raw('');
  const label = (l: Log) => (episodeLabel(l) === episodeLabel(log) ? l.author : `${l.author}（${episodeLabel(l)}）`);
  const links = others.map((l) => html`<a href="${url(site, logKey(work.id, l.id))}" title="${l.loggedAt}">${label(l)}</a>`);
  return html`<p class="log-same">同じ話の記録: ${links.map((a, i) => (i === 0 ? a : html` ${a}`))}</p>`;
}

function renderLog(site: Site, arg: string): string | null {
  const [workId, logId] = splitLogArg(arg);
  const work = site.works.get(workId);
  const log = work?.logs.find((l) => l.id === logId);
  if (!work || !log) return null;
  const heading = logHeading(log);
  return layout(
    site,
    `${work.title} ${heading || log.loggedAt}`,
    html`<article class="log-page">
<div class="log-page-head">
${cover(work, 'small')}
<div>
<p class="log-work"><a href="${url(site, `work:${work.id}`)}">${work.title}</a></p>
<h1>${heading ? headingHtml(log) : `${log.loggedAt} の記録`}</h1>
<p class="work-meta"><a href="${url(site, `month:${log.loggedAt.slice(0, 7)}`)}"><time datetime="${log.loggedAt}">${log.loggedAt}</time></a> <span class="author">${log.author}</span> ${stars(log.rating)}</p>
</div>
</div>
${programInfo(log, work, false).html}
${paragraphs(log.text)}
${sameEpisode(site, work, log)}
${logNav(site, work, log)}
</article>`,
    undefined,
    nhkCredit([log]),
  );
}

function renderDir(site: Site, segs: string[]): string | null {
  const prefix = segs.join('/');
  const direct: Work[] = [];
  const children = new Map<string, number>();
  for (const w of site.works.values()) {
    const ws = pathSegments(w.path);
    if (ws.slice(0, segs.length).join('/') !== prefix) continue;
    if (ws.length === segs.length) direct.push(w);
    else {
      const child = ws[segs.length]!;
      children.set(child, (children.get(child) ?? 0) + 1);
    }
  }
  if (direct.length === 0 && children.size === 0 && segs.length > 0) return null;

  const title = segs.length ? `/${prefix}` : 'ディレクトリ';
  const childList = [...children].sort(([a], [b]) => a.localeCompare(b, 'ja'));
  const list = direct.length ? cardList(site, direct) : null;
  return layout(
    site,
    title,
    html`${breadcrumbs(site, segs)}<h1>${title}</h1>
${childList.length ? html`<ul class="dirs">${childList.map(([c, n]) => html`<li><a href="${url(site, `dir:${[...segs, c].join('/')}`)}">${c}/</a> <span class="count">${n}</span></li>`)}</ul>` : ''}
${list ? list.body : ''}`,
    list?.styles,
  );
}

function renderTagIndex(site: Site): string {
  const counts = new Map<string, { label: string; n: number }>();
  for (const w of site.works.values()) {
    for (const t of new Set(w.tags)) {
      const k = safeSegment(t);
      counts.set(k, { label: t, n: (counts.get(k)?.n ?? 0) + 1 });
    }
  }
  const tags = [...counts].sort(([, a], [, b]) => b.n - a.n || a.label.localeCompare(b.label, 'ja'));
  return layout(
    site,
    'タグ',
    html`<h1>タグ</h1><ul class="tag-cloud">${tags.map(([k, { label, n }]) => html`<li><a href="${url(site, `tag:${k}`)}">#${label}</a> <span class="count">${n}</span></li>`)}</ul>`,
  );
}

function renderSeasonIndex(site: Site): string | null {
  const counts = new Map<string, number>();
  for (const w of site.works.values()) {
    const season = seasonOf(w);
    if (season) counts.set(season, (counts.get(season) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const seasons = [...counts].sort(([a], [b]) => compareSeasons(a, b));
  return layout(
    site,
    'シーズン',
    html`<h1>シーズン</h1><ul class="seasons">${seasons.map(([s, n]) => html`<li><a href="${url(site, `season:${s}`)}">${seasonLabel(s)}</a> <span class="count">${n}</span></li>`)}</ul>`,
  );
}

function seasonWork(site: Site, work: Work): Raw {
  const href = url(site, `work:${work.id}`);
  const latest = latestLog(work);
  return html`<li class="season-work">
${work.coverUrl ? html`<a class="season-cover" href="${href}" tabindex="-1" aria-hidden="true">${cover(work, 'small')}</a>` : ''}
<div>
<a class="season-title" href="${href}">${work.title}</a>
<p class="work-meta">${[MEDIA_TYPE_LABELS[work.type], channelOf(work)].filter(Boolean).join(' · ')}${latest ? html` · <time datetime="${latest.loggedAt}">${latest.loggedAt}</time>` : ''}</p>
${progressGrid(site, work)}
</div>
</li>`;
}

function renderSeason(site: Site, season: string): string | null {
  const works = [...site.works.values()].filter((w) => seasonOf(w) === season).sort(byLatestDesc);
  if (works.length === 0) return null;
  const label = seasonLabel(season);
  return layout(
    site,
    label,
    html`<nav class="breadcrumbs"><a href="${url(site, 'seasons')}">シーズン</a></nav>
<h1>${label}</h1><p class="count">${works.length} 件</p>
<ul class="season-works">${works.map((w) => seasonWork(site, w))}</ul>`,
  );
}

function logsWhere(site: Site, keep: (log: Log) => boolean): { work: Work; log: Log }[] {
  const out: { work: Work; log: Log }[] = [];
  for (const w of site.works.values()) for (const l of w.logs) if (keep(l)) out.push({ work: w, log: l });
  return out.sort((a, b) => b.log.loggedAt.localeCompare(a.log.loggedAt));
}

function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function timeline(site: Site, entries: { work: Work; log: Log }[]): Raw {
  return html`<ol class="timeline">${entries.map(
    ({ work, log }) => html`<li>
<time datetime="${log.loggedAt}">${log.loggedAt.slice(5)}</time>
<a href="${url(site, `work:${work.id}`)}">${work.title}</a> <span class="author">${log.author}</span> ${stars(log.rating)}
${log.text ? html`<p>${excerpt(log.text)}</p>` : ''}
</li>`,
  )}</ol>`;
}

function renderMonth(site: Site, month: string): string | null {
  const entries = logsWhere(site, (l) => l.loggedAt.startsWith(month));
  if (entries.length === 0) return null;
  const [y, m] = month.split('-');
  // Every week with a log of this month, also one that belongs to the month next to it.
  const weeks = new Map<string, number>();
  for (const { log } of entries) {
    const w = weekOf(log.loggedAt);
    if (w) weeks.set(w, (weeks.get(w) ?? 0) + 1);
  }
  const weekName = (w: string): string => (w.startsWith(`${month}-`) ? `${w.slice(8)}週目` : weekLabel(w).replace(/^\d+年/, ''));
  return layout(
    site,
    `${y}年${Number(m)}月`,
    html`<nav class="breadcrumbs"><a href="${url(site, `year:${y}`)}">${y}年</a></nav>
<h1>${y}年${Number(m)}月</h1><p class="count">${entries.length} 件</p>
<ul class="months weeks">${[...weeks].sort(([a], [b]) => a.localeCompare(b)).map(
      ([w, n]) => html`<li><a href="${url(site, `week:${w}`)}">${weekName(w)}</a> <span class="range">（${weekRange(w)}）</span> <span class="count">${n}</span></li>`,
    )}</ul>
${timeline(site, entries)}`,
  );
}

function renderWeek(site: Site, week: string): string | null {
  const entries = logsWhere(site, (l) => weekOf(l.loggedAt) === week);
  if (entries.length === 0) return null;
  // The months its logs fall in: a week across a month end may have no log in the month it belongs to.
  const months = [...new Set(entries.map(({ log }) => log.loggedAt.slice(0, 7)))].sort();
  const label = weekLabel(week);
  return layout(
    site,
    label,
    html`<nav class="breadcrumbs">${months.map((mo, i) => html`${i > 0 ? ' · ' : ''}<a href="${url(site, `month:${mo}`)}">${mo.slice(0, 4)}年${Number(mo.slice(5))}月</a>`)}</nav>
<h1>${label}</h1><p class="count">${weekRange(week)} · ${entries.length} 件</p>
${timeline(site, entries)}`,
  );
}

function renderYear(site: Site, year: string): string | null {
  const works = [...site.works.values()].filter((w) => monthsOf(w).some((m) => m.startsWith(year)));
  if (works.length === 0) return null;
  const months = new Map<string, number>();
  for (const w of works) for (const l of w.logs) if (l.loggedAt.startsWith(year)) months.set(l.loggedAt.slice(0, 7), (months.get(l.loggedAt.slice(0, 7)) ?? 0) + 1);
  const lead = html`<ul class="months">${[...months].sort(([a], [b]) => a.localeCompare(b)).map(
    ([mo, n]) => html`<li><a href="${url(site, `month:${mo}`)}">${Number(mo.slice(5))}月</a> <span class="count">${n}</span></li>`,
  )}</ul>`;
  return renderList(site, `${year}年`, works, lead);
}

function renderHome(site: Site): string {
  return layout(
    site,
    site.config.title,
    html`<h1 class="visually-hidden">${site.config.title}</h1>
<section class="stats" aria-label="記録の数"><span data-stat="works">-</span> 作品 · <span data-stat="logs">-</span> 件の記録</section>
<section class="watching" hidden><h2>視聴中</h2><ul class="timeline"></ul></section>
<section class="on-this-day" hidden><h2>過去の今日</h2><ul></ul></section>
<section class="recent"><h2>最近の記録</h2><ol class="timeline"></ol></section>
<section class="years"><h2>年ごと</h2><ul class="months"></ul></section>`,
  );
}
