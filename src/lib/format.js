export const MONTHS = ['Janwari', 'Farwari', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_HI = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never UTC, so late-night entries land on the right day). */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());

export function dateFromOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function monthRange(year, month) {
  const next = month === 11 ? { y: year + 1, m: 0 } : { y: year, m: month + 1 };
  return { start: `${year}-${pad(month + 1)}-01`, end: `${next.y}-${pad(next.m + 1)}-01` };
}

/** "Aaj", "Kal", "Parso" or "12 September". */
export function dayLabel(iso) {
  if (iso === today()) return 'Aaj';
  if (iso === dateFromOffset(-1)) return 'Kal';
  if (iso === dateFromOffset(-2)) return 'Parso';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function weekdayHi(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('hi-IN', { weekday: 'long' });
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'सुप्रभात';
  if (h < 17) return 'नमस्ते';
  return 'शुभ संध्या';
}
