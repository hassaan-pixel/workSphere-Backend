import { z } from 'zod';

export const askAssistantSchema = z.object({
  question: z.string().trim().min(1, 'Enter a question.').max(2000, 'Question must be at most 2000 characters.'),
});

export type AskAssistantInput = z.infer<typeof askAssistantSchema>;