function toLocalISO(d: Date): string {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return toLocalISO(new Date());
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toLocalISO(d);
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}

/** Monday-start weekday index: 0 = Monday ... 6 = Sunday */
export function weekdayIndex(dateISO: string): number {
  const jsDay = new Date(dateISO + 'T00:00:00').getDay(); // 0 = Sunday
  return (jsDay + 6) % 7;
}

export function startOfWeekISO(dateISO: string): string {
  return addDaysISO(dateISO, -weekdayIndex(dateISO));
}

export function startOfMonthISO(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDayLabel(dateISO: string): string {
  return new Date(dateISO + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export { WEEKDAY_LABELS };
