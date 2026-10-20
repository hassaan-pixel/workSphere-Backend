import { z } from 'zod';
import { dateOnlySchema, isoInstantSchema } from '../../common/utils/date.schema';

export const clockInSchema = z.object({
  employeeId: z.string().uuid().optional(), // If not provided, defaults to current user's employeeId
  notes: z.string().max(300).optional(),
});

export const clockOutSchema = z.object({
  employeeId: z.string().uuid().optional(),
  notes: z.string().max(300).optional(),
});

export const manualAttendanceSchema = z.object({
  employeeId: z.string().uuid('Employee ID is required'),
  workDate: dateOnlySchema,
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'APPROVED_LEAVE']).default('PRESENT'),
  shiftId: z.string().uuid().optional().nullable(),
  checkInTime: isoInstantSchema.optional().nullable(),
  checkOutTime: isoInstantSchema.optional().nullable(),
  workingHours: z.number().min(0).max(24).optional(),
  overtimeHours: z.number().min(0).max(12).default(0),
  correctionReason: z.string().min(3, 'Correction reason is required for manual adjustments').max(300),
  notes: z.string().max(300).optional().nullable(),
});

export const attendanceFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  startDate: dateOnlySchema.optional(),
  endDate: dateOnlySchema.optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'APPROVED_LEAVE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(25),
});

export type ClockInInput = z.infer<typeof clockInSchema>;
export type ClockOutInput = z.infer<typeof clockOutSchema>;
export type ManualAttendanceInput = z.infer<typeof manualAttendanceSchema>;
export type AttendanceFilterInput = z.infer<typeof attendanceFilterSchema>;
