import { z } from 'zod';

export const createHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required').max(100).trim(),
  date: z.string({ required_error: 'Holiday date is required' }),
  endDate: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  holidayType: z.enum(['PUBLIC', 'COMPANY', 'OPTIONAL']).default('PUBLIC'),
  location: z.string().max(100).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
