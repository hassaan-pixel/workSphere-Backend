import { z } from 'zod';
import { dateOnlySchema, optionalDateOnlySchema } from '../../common/utils/date.schema';

export const createEmployeeSchema = z.object({
  roleId: z.string().uuid('Invalid role ID').optional(),
  permissionCodes: z.array(z.string().min(1)).max(200).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
  employeeCode: z
    .string({ required_error: 'Employee code is required' })
    .min(1, 'Employee code is required')
    .max(20, 'Employee code must be at most 20 characters')
    .trim(),
  firstName: z
    .string({ required_error: 'First name is required' })
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters')
    .trim(),
  middleName: z.string().max(100).trim().optional().nullable(),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters')
    .trim(),
  workEmail: z
    .string({ required_error: 'Work email is required' })
    .email('Please enter a valid email address')
    .trim()
    .toLowerCase(),
  personalEmail: z.string().email('Invalid personal email').trim().toLowerCase().optional().nullable(),
  phone: z.string().max(30).trim().optional().nullable(),
  dateOfBirth: optionalDateOnlySchema,
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional().nullable(),
  hireDate: dateOnlySchema,
  employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'PROBATION', 'TERMINATED', 'RESIGNED']).default('ACTIVE'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
  departmentId: z.string().uuid('Invalid department ID').optional().nullable(),
  designationId: z.string().uuid('Invalid designation ID').optional().nullable(),
  reportingManagerId: z.string().uuid('Invalid manager ID').optional().nullable(),
  workLocation: z.string().max(200).trim().default('Headquarters'),
  employmentEndDate: optionalDateOnlySchema,
  avatarUrl: z.string().url('Invalid avatar URL').optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
