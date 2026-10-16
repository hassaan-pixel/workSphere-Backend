import { z } from 'zod';

const componentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(['EARNING', 'DEDUCTION']),
  amountCents: z.number().int().min(0).max(100_000_000),
});

const dateSchema = z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Must be a valid date string' });

export const salaryStructureSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveDate: dateSchema,
  basicSalaryCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  paymentFrequency: z.enum(['MONTHLY', 'BIWEEKLY', 'WEEKLY']).default('MONTHLY'),
  components: z.array(componentSchema).max(30).default([]),
});

export const payrollRunSchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema,
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
}).refine((value) => new Date(value.periodEnd) >= new Date(value.periodStart), {
  message: 'Payroll period end must be on or after the start date.',
  path: ['periodEnd'],
});

export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;
