import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Validate input with zod; failures become 400 with the issue messages. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}
