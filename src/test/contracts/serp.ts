/** Contract for SerpApi google_maps engine. */
import { z } from 'zod';

/** Query params we send. `ll` must be the 16z zoom idiom when present. */
export const SerpRequestQuery = z.object({
  q: z.string().min(1),
  engine: z.literal('google_maps'),
  api_key: z.string().min(1),
  gl: z.literal('gb'),
  hl: z.literal('en'),
  ll: z
    .string()
    .regex(/^@-?\d+(\.\d+)?,-?\d+(\.\d+)?,16z$/)
    .optional(),
});

export const SerpLocalResult = z
  .object({
    position: z.number().int().positive(),
    title: z.string().optional(),
    website: z.string().optional(),
    links: z.object({ website: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export const SerpResponse = z
  .object({
    local_results: z.array(SerpLocalResult).optional(),
    answer_box: z.object({ type: z.string().optional() }).passthrough().optional(),
    knowledge_graph: z.unknown().optional(),
    ads: z.array(z.unknown()).optional(),
    error: z.string().optional(),
  })
  .passthrough();
