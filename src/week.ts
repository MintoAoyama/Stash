// Weeks run Monday to Sunday and belong to the month of their Thursday; a key is "yyyy-MM-n" (n from 1).
const DAY = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK = /^(\d{4})-(\d{2})-([1-5])$/;

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (t: number): string => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
// Monday 0 .. Sunday 6.
const weekday = (t: number): number => (new Date(t).getUTCDay() + 6) % 7;

function parseDate(date: string): number | null {
  const m = DATE.exec(date);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return iso(t) === date ? t : null;
}

// "2026-08-05" -> "2026-08-1"; undefined for anything that is not a date.
export function weekOf(date: string): string | undefined {
  const t = parseDate(date.slice(0, 10));
  if (t === null) return undefined;
  const thursday = new Date(t + (3 - weekday(t)) * DAY);
  return `${thursday.getUTCFullYear()}-${pad(thursday.getUTCMonth() + 1)}-${Math.floor((thursday.getUTCDate() - 1) / 7) + 1}`;
}

// The Monday and the Sunday of the week, or null for a key that names no week.
export function weekDays(week: string): { start: string; end: string } | null {
  const m = WEEK.exec(week);
  if (!m) return null;
  const first = Date.UTC(Number(m[1]), Number(m[2]) - 1, 1);
  const firstThursday = first + ((3 - weekday(first) + 7) % 7) * DAY;
  const monday = firstThursday - 3 * DAY + (Number(m[3]) - 1) * 7 * DAY;
  return weekOf(iso(monday)) === week ? { start: iso(monday), end: iso(monday + 6 * DAY) } : null;
}

// "2026-08-1" -> "2026年8月1週目"
export function weekLabel(week: string): string {
  const m = WEEK.exec(week);
  return m ? `${m[1]}年${Number(m[2])}月${m[3]}週目` : week;
}

// "8/3〜8/9"
export function weekRange(week: string): string {
  const days = weekDays(week);
  const md = (d: string): string => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return days ? `${md(days.start)}〜${md(days.end)}` : '';
}
