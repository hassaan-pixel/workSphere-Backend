export interface ZonedCalendarDate {
  year: number;
  month: number;
  day: number;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function calendarDateInZone(instant: Date, timeZone: string): ZonedCalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  };
}

export function calendarDateStringInZone(instant: Date, timeZone: string): string {
  const { year, month, day } = calendarDateInZone(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateOnlyUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Expected a calendar date in YYYY-MM-DD format.');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function monthInZone(instant: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.get('year')), month: Number(values.get('month')) };
}