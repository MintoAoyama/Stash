import MarkdownIt from 'markdown-it';
import { raw, type Raw } from './html.ts';

type Token = ReturnType<MarkdownIt['parse']>[number];

// Keep the options in step with the preview of the editor, so a log looks the same in both.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });

// Japanese is written without a space after a URL, so a bare URL ends at the first character that is not
// printable ASCII (and drops trailing punctuation), instead of running on into the sentence.
function asciiUrl(text: string, pos: number): number {
  const m = /^\/\/[!#-;=?-~]+/.exec(text.slice(pos));
  const url = m ? m[0].replace(/[.,;:!?'*_~)\]}]+$/, '') : '';
  return url.length > 2 ? url.length : 0;
}
md.linkify
  .set({ fuzzyLink: false, fuzzyEmail: false })
  .add('https:', { validate: asciiUrl })
  .add('http:', { validate: asciiUrl })
  .add('ftp:', null)
  .add('//', null);

// The page already has h1 (the work or the log) and h2 (the author), so "#" in a log becomes h3.
const HEADING_SHIFT = 2;
for (const rule of ['heading_open', 'heading_close'] as const) {
  md.renderer.rules[rule] = (tokens, idx, options, _env, self) => {
    const t = tokens[idx]!;
    t.tag = `h${Math.min(6, Number(t.tag.slice(1)) + HEADING_SHIFT)}`;
    return self.renderToken(tokens, idx, options);
  };
}

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx]!.attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx]!.attrSet('loading', 'lazy');
  return defaultImage(tokens, idx, options, env, self);
};

// A wide table scrolls inside its own box instead of widening the page.
md.renderer.rules.table_open = () => '<div class="md-table"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

export function markdown(text: string): Raw {
  return raw(md.render(text.replace(/\r\n?/g, '\n')));
}

function inlineText(children: Token[]): string {
  return children
    .map((c) => {
      if (c.type === 'softbreak' || c.type === 'hardbreak') return '\n';
      if (c.type === 'text' || c.type === 'code_inline' || c.type === 'image') return c.content;
      return '';
    })
    .join('');
}

// The text of a log without its markup, for excerpts: a paragraph per block, a line per list item
// ("・" first) and per table row (cells joined by spaces).
export function plainText(text: string): string {
  const parts: { text: string; kind: 'block' | 'item' | 'row' }[] = [];
  let lists = 0;
  let row: string[] | null = null;
  for (const t of md.parse(text.replace(/\r\n?/g, '\n'), {})) {
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') lists++;
    else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') lists--;
    else if (t.type === 'tr_open') row = [];
    else if (t.type === 'tr_close' && row) {
      parts.push({ text: row.join(' '), kind: 'row' });
      row = null;
    } else if (t.type === 'inline') {
      const s = inlineText(t.children ?? []);
      if (row) row.push(s);
      else parts.push(lists ? { text: `・${s}`, kind: 'item' } : { text: s, kind: 'block' });
    } else if (t.type === 'fence' || t.type === 'code_block') parts.push({ text: t.content.replace(/\n$/, ''), kind: 'block' });
  }
  return parts
    .filter((p) => p.text.trim() !== '')
    .map((p, i, all) => (i === 0 ? '' : p.kind !== 'block' && p.kind === all[i - 1]!.kind ? '\n' : '\n\n') + p.text)
    .join('');
}

// The start of a log as plain text, as the work page and the home page show it; the cut never lands inside the markup.
const DIGEST_CHARS = 140;

export function digest(text: string): { text: string; truncated: boolean } {
  const plain = plainText(text);
  const chars = Array.from(plain.trim());
  if (chars.length <= DIGEST_CHARS) return { text: plain, truncated: false };
  return { text: `${chars.slice(0, DIGEST_CHARS).join('').trimEnd()}…`, truncated: true };
}
