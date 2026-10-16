import { z } from 'zod';

export const createDesignationSchema = z.object({
  code: z
    .string({ required_error: 'Designation code is required' })
    .min(1, 'Designation code is required')
    .max(20, 'Code must be at most 20 characters')
    .trim()
    .toUpperCase(),
  name: z
    .string({ required_error: 'Designation name is required' })
    .min(1, 'Designation name is required')
    .max(200, 'Name must be at most 200 characters')
    .trim(),
  description: z.string().max(500).trim().optional().nullable(),
  departmentId: z.string().uuid('Invalid department ID').optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateDesignationSchema = createDesignationSchema.partial();

export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
