import { z } from 'zod';

export const createDepartmentSchema = z.object({
  code: z
    .string({ required_error: 'Department code is required' })
    .min(1, 'Department code is required')
    .max(20, 'Code must be at most 20 characters')
    .trim()
    .toUpperCase(),
  name: z
    .string({ required_error: 'Department name is required' })
    .min(1, 'Department name is required')
    .max(200, 'Name must be at most 200 characters')
    .trim(),
  description: z.string().max(500).trim().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
