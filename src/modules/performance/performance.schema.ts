import { z } from 'zod';
import { dateOnlySchema } from '../../common/utils/date.schema';

const dateSchema = dateOnlySchema;
const optionalDateSchema = z.string().nullish()
  .transform((value) => (!value || value.trim() === '' ? undefined : value))
  .pipe(dateOnlySchema.optional());

export const cycleSchema = z.object({
  name: z.string().trim().min(3).max(100),
  startDate: dateSchema,
  endDate: dateSchema,
  frequency: z.enum(['QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).default('ANNUAL')
}).refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
  path: ['endDate'],
  message: 'End date must be on or after start date.'
});

export const goalSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().max(2000).optional(),
  target: z.string().max(500).optional(),
  dueDate: optionalDateSchema,
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  progress: z.number().int().min(0).max(100).optional()
});

export const goalUpdateSchema = goalSchema.omit({ employeeId: true }).partial();
export const reviewSchema = z.object({
  employeeId: z.string().uuid(),
  reviewCycleId: z.string().uuid(),
  reviewerId: z.string().uuid().optional()
});
export const selfAssessmentSchema = z.object({
  selfAssessment: z.string().trim().min(3).max(5000),
  employeeRating: z.number().int().min(1).max(5)
});
export const managerAssessmentSchema = z.object({
  managerAssessment: z.string().trim().min(3).max(5000),
  managerRating: z.number().int().min(1).max(5),
  complete: z.boolean().default(false)
});
