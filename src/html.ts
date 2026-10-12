// Minimal HTML templating: interpolated values are escaped unless produced by `html` or `raw`.

export interface Raw {
  readonly __raw: string;
}

export function raw(s: string): Raw {
  return { __raw: s };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (typeof v === 'object' && '__raw' in v) return (v as Raw).__raw;
  return esc(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += renderValue(v) + (strings[i + 1] ?? '');
  });
  return raw(out);
}

export function paragraphs(text: string): Raw {
  const blocks = text.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).filter((b) => b.trim() !== '');
  return raw(blocks.map((b) => `<p>${b.split('\n').map(esc).join('<br>')}</p>`).join(''));
}
