import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(2, 'Template name is required').max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
  items: z.array(
    z.object({
      title: z.string().min(2).max(200),
      description: z.string().max(500).optional().nullable(),
      defaultDueDays: z.number().int().min(0).default(7),
      category: z.string().default('GENERAL'),
      order: z.number().int().default(0),
    })
  ).optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const createTaskSchema = z.object({
  employeeId: z.string().uuid('Employee ID is required'),
  title: z.string().min(2, 'Task title is required').max(200).trim(),
  description: z.string().max(500).optional().nullable(),
  category: z.string().default('GENERAL'),
  assignedOwnerId: z.string().uuid().optional().nullable(),
  dueDate: z.string({ required_error: 'Due date is required (YYYY-MM-DD)' }),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).default('PENDING'),
  notes: z.string().max(500).optional().nullable(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']),
  notes: z.string().max(500).optional().nullable(),
});

export const generateTasksSchema = z.object({
  templateId: z.string().uuid().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
