import { z } from 'zod';

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Must be a real calendar date in YYYY-MM-DD format');

export const optionalDateOnlySchema = dateOnlySchema.nullish();

export const isoInstantSchema = z.string().datetime({ offset: true });