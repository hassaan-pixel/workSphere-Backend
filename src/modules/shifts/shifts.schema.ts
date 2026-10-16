import { z } from 'zod';

export const createShiftSchema = z.object({
  code: z.string().min(1, 'Shift code is required').max(20).trim().toUpperCase(),
  name: z.string().min(1, 'Shift name is required').max(100).trim(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be in HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be in HH:mm format'),
  breakDurationMinutes: z.number().int().min(0).default(60),
  expectedHours: z.number().positive().optional(),
  applicableDays: z.string().default('MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY'),
  gracePeriodMinutes: z.number().int().min(0).default(15),
  isOvernight: z.boolean().optional(),
  isActive: z.boolean().default(true),
});

export const updateShiftSchema = createShiftSchema.partial();

export const assignShiftSchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  shiftId: z.string().uuid('Invalid shift ID'),
  startDate: z.string({ required_error: 'Effective start date is required' }),
  endDate: z.string().optional().nullable(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type AssignShiftInput = z.infer<typeof assignShiftSchema>;
