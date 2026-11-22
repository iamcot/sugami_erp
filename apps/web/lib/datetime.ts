const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86_400_000;
const VN = 7 * 3_600_000;

/** Whole Vietnam-time calendar days from `now` to `t` (0 = today, 1 = tomorrow, -1 = yesterday). */
export function dayDiff(t: Date, now = new Date()): number {
  const day = (d: Date) => Math.floor((d.getTime() + VN) / DAY);
  return day(t) - day(now);
}

const RELATIVE: Record<number, string> = {
  [-2]: 'Hôm kia',
  [-1]: 'Hôm qua',
  0: 'Hôm nay',
  1: 'Ngày mai',
  2: 'Ngày kia',
};

const hm = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dmy = (d: Date) => d.toLocaleDateString('vi-VN', { dateStyle: 'short', timeZone: TZ });

/**
 * "23:59 Ngày mai" for days close to today, the plain date ("23:59 03/12/2026") when far away.
 * Easier to picture than a date for deadlines and recent activity.
 */
export function formatRelativeDateTime(iso: string | Date | null | undefined, now = new Date()): string {
  if (!iso) return '–';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '–';
  const rel = RELATIVE[dayDiff(d, now)];
  return `${hm(d)} ${rel ?? dmy(d)}`;
}
