import { z } from 'zod';

export const createJobOpeningSchema = z.object({
  title: z.string().min(2, 'Job title is required').max(200).trim(),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
  positionsCount: z.number().int().positive().default(1),
  openingDate: z.string().optional(),
  closingDate: z.string().optional().nullable(),
  hiringManagerId: z.string().uuid().optional().nullable(),
  status: z.enum(['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED']).default('OPEN'),
});

export const updateJobOpeningSchema = createJobOpeningSchema.partial();

export const createCandidateSchema = z.object({
  jobOpeningId: z.string().uuid('Job opening ID is required'),
  fullName: z.string().min(2, 'Full name is required').max(100).trim(),
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  phone: z.string().max(30).optional().nullable(),
  resumeUrl: z.string().url('Invalid resume URL').optional().nullable(),
  source: z.string().max(50).default('WEBSITE'),
  notes: z.string().max(1000).optional().nullable(),
});

export const transitionStageSchema = z.object({
  toStage: z.enum(['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED']),
  comment: z.string().max(500).optional(),
  scheduledDate: z.string().optional().nullable(),
  interviewerNotes: z.string().max(1000).optional().nullable(),
});

export const hireCandidateSchema = z.object({
  employeeCode: z.string().min(1, 'Employee code is required').max(20).trim(),
  hireDate: z.string({ required_error: 'Hire date is required' }),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  workLocation: z.string().default('Headquarters'),
  employmentStatus: z.enum(['ACTIVE', 'PROBATION']).default('PROBATION'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
});

export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>;
export type UpdateJobOpeningInput = z.infer<typeof updateJobOpeningSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type TransitionStageInput = z.infer<typeof transitionStageSchema>;
export type HireCandidateInput = z.infer<typeof hireCandidateSchema>;
