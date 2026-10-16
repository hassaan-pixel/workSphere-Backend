import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Work email is required' })
    .email('Please enter a valid email address')
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((input) => input.newPassword === input.confirmPassword, {
  message: 'New password and confirmation do not match',
  path: ['confirmPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
