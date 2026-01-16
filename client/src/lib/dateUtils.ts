import { format as dateFnsFormat, formatDistance as dateFnsFormatDistance, differenceInHours } from 'date-fns';

export function format(date: Date | string, formatStr: string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formatStr);
}

export function formatDistance(date: Date | string, baseDate: Date = new Date()): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormatDistance(dateObj, baseDate, { addSuffix: true });
}

export function isWithin24Hours(date: Date | string): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const hoursDiff = differenceInHours(dateObj, now);
  return hoursDiff >= 0 && hoursDiff <= 24;
}
