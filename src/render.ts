import { html, paragraphs, raw, type Raw } from './html.ts';
import { monthsOf, pageUrl, pathSegments, safeSegment, splitKey, type PageKey } from './pages.ts';
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
    case 'dir':
      return renderDir(site, arg === '' ? [] : arg.split('/'));
    case 'tags':
      return renderTagIndex(site);
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
    default:
      throw new Error(`unknown page key: ${key}`);
  }
}

function url(site: Site, key: PageKey): string {
  return site.config.basePath + pageUrl(key);
}

function layout(site: Site, title: string, body: Raw, styles?: string): string {
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
<a class="site-title" href="${base}">${site.config.title}</a>
<nav class="site-nav">
${MEDIA_TYPES.filter((t) => t !== 'other').map((t) => html`<a href="${url(site, `type:${t}`)}">${MEDIA_TYPE_LABELS[t]}</a>`)}
<a href="${url(site, 'dir:')}">ディレクトリ</a>
<a href="${url(site, 'tags')}">タグ</a>
</nav>
</header>
<main>
${body}
</main>
<footer class="site-footer">
<p>作品情報の一部は TMDB API を利用しています（This product uses the TMDB API but is not endorsed or certified by TMDB）</p>
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
  return (latestLog(b)?.loggedAt ?? '').localeCompare(latestLog(a)?.loggedAt ?? '');
}

function authorsOf(works: Work[]): string[] {
  return [...new Set(works.flatMap((w) => w.logs.map((l) => l.author)))].sort();
}

function cover(work: Work, size: 'thumb' | 'full'): Raw {
  if (!work.coverUrl) return html`<div class="cover cover--${size} cover--empty" aria-hidden="true">${MEDIA_TYPE_LABELS[work.type]}</div>`;
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
    return html`<li class="card" data-type="${w.type}" data-a="${a}">
<a href="${url(site, `work:${w.id}`)}">${cover(w, 'thumb')}<span class="card-title">${w.title}</span></a>
<span class="card-meta">${MEDIA_TYPE_LABELS[w.type]}${latest ? html` · <time datetime="${latest.loggedAt}">${latest.loggedAt}</time>` : ''} ${stars(latest?.rating)}</span>
</li>`;
  });

  return {
    body: html`<div class="filters">${typeFilter}${authorFilter}</div><ul class="cards">${cards}</ul>`,
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

function renderWork(site: Site, work: Work): string {
  const segs = pathSegments(work.path);
  const logs = [...work.logs].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const authors = authorsOf([work]);

  const logItem = (l: Log) => html`<li class="log">
<div class="log-head"><a href="${url(site, `month:${l.loggedAt.slice(0, 7)}`)}"><time datetime="${l.loggedAt}">${l.loggedAt}</time></a> <span class="author">${l.author}</span> ${stars(l.rating)}</div>
${l.program ? html`<div class="program">${l.program.channel} ${l.program.date} ${l.program.start ?? ''}${l.program.title && l.program.title !== work.title ? html` 「${l.program.title}」` : ''}</div>` : ''}
${paragraphs(l.text)}
</li>`;

  const logsBody =
    authors.length > 1
      ? html`<div class="logs logs--by-author">${authors.map(
          (a) => html`<section><h2>${a}</h2><ol class="log-list">${logs.filter((l) => l.author === a).map(logItem)}</ol></section>`,
        )}</div>`
      : html`<ol class="log-list">${logs.map(logItem)}</ol>`;

  const meta = [
    html`<a href="${url(site, `type:${work.type}`)}">${MEDIA_TYPE_LABELS[work.type]}</a>`,
    work.year ? html`${work.year}` : '',
    work.platform ? html`${work.platform}` : '',
    work.creators?.length ? html`${work.creators.join('、')}` : '',
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
</div>
</div>
${logsBody}
</article>`,
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

function logsInMonth(site: Site, month: string): { work: Work; log: Log }[] {
  const out: { work: Work; log: Log }[] = [];
  for (const w of site.works.values()) for (const l of w.logs) if (l.loggedAt.startsWith(month)) out.push({ work: w, log: l });
  return out.sort((a, b) => b.log.loggedAt.localeCompare(a.log.loggedAt));
}

function excerpt(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function renderMonth(site: Site, month: string): string | null {
  const entries = logsInMonth(site, month);
  if (entries.length === 0) return null;
  const [y, m] = month.split('-');
  return layout(
    site,
    `${y}年${Number(m)}月`,
    html`<nav class="breadcrumbs"><a href="${url(site, `year:${y}`)}">${y}年</a></nav>
<h1>${y}年${Number(m)}月</h1><p class="count">${entries.length} 件</p>
<ol class="timeline">${entries.map(
      ({ work, log }) => html`<li>
<time datetime="${log.loggedAt}">${log.loggedAt.slice(5)}</time>
<a href="${url(site, `work:${work.id}`)}">${work.title}</a> <span class="author">${log.author}</span> ${stars(log.rating)}
${log.text ? html`<p>${excerpt(log.text)}</p>` : ''}
</li>`,
    )}</ol>`,
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
<section class="on-this-day" hidden><h2>過去の今日</h2><ul></ul></section>
<section class="recent"><h2>最近の記録</h2><ol class="timeline"></ol></section>
<section class="years"><h2>年ごと</h2><ul class="months"></ul></section>`,
  );
}
