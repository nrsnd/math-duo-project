import { z } from 'zod';

export const submitSchema = z.object({
  attempt_id: z.string().uuid(),
  answers: z.array(z.object({
    problem_id: z.number().int().positive(),
    option_id: z.number().int().positive().optional(),
    value: z.string().max(64).optional()
  })).min(1)
});
