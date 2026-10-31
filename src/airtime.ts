const DAYS = '月火水木金土日';
// Program guides start the day at 05:00: "月曜 01:25" is the end of Sunday night.
const DAY_STARTS_AT = 5 * 60;

// Minutes from Monday 05:00 to the start of a slot such as "日曜 21:00〜21:45", or undefined if the free text has no
// day and time. "平日" counts as Monday.
export function airtimeOrder(airtime: string | undefined): number | undefined {
  const m = /^\s*(平日|[月火水木金土日])曜?日?\s*(\d{1,2}):(\d{2})/.exec(airtime ?? '');
  if (!m) return undefined;
  const day = m[1] === '平日' ? 0 : DAYS.indexOf(m[1]!);
  const minutes = day * 24 * 60 + Number(m[2]) * 60 + Number(m[3]) - DAY_STARTS_AT;
  return (minutes + 7 * 24 * 60) % (7 * 24 * 60);
}
