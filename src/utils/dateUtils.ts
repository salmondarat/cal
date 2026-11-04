// Calendar date strings must be derived from local components. toISOString()
// shifts by the UTC offset and can produce a different day (and duplicate
// React keys) in timezones ahead of UTC.
export function formatLocalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
