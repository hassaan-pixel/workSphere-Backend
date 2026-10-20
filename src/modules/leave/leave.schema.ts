import { z } from 'zod';
import { dateOnlySchema } from '../../common/utils/date.schema';

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().uuid().optional(), // If omitted, defaults to authenticated user's employeeId
  leaveTypeId: z.string().uuid('Leave type ID is required'),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
  documentUrl: z.string().url('Invalid document URL').optional().nullable(),
});

export const reviewLeaveRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().max(500).optional(),
});

export const cancelLeaveRequestSchema = z.object({
  reason: z.string().max(300).optional(),
});

export const createLeaveTypeSchema = z.object({
  code: z.string().min(1).max(20).trim().toUpperCase(),
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).optional().nullable(),
  defaultDaysPerYear: z.number().positive().default(14),
  isPaid: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
  color: z.string().default('#0d9488'),
  isActive: z.boolean().default(true),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const leaveFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  leaveTypeId: z.string().uuid().optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>;
export type CancelLeaveRequestInput = z.infer<typeof cancelLeaveRequestSchema>;
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;
export type LeaveFilterInput = z.infer<typeof leaveFilterSchema>;
