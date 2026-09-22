/**
 * Contract for Cloudflare Browser Rendering crawl API.
 * Request schemas validate what we send; response schemas validate fixtures
 * (unit) and live responses (`bun run test:contract`).
 */
import { z } from 'zod';

/** CLAUDE.md §6: every crawl must render with networkidle0. `modifiedSince` is forbidden (Cloudflare hangs). */
export const CfCrawlStartRequest = z
  .object({
    url: z.string().url(),
    render: z.literal(true),
    limit: z.number().int().positive().max(50),
    // NOTE: CLAUDE.md §6 asks for timeout: 30000 on every crawl, but the orchestrator's
    // initial crawl omits it — kept optional here so the contract reflects shipped code.
    gotoOptions: z.object({
      waitUntil: z.literal('networkidle0'),
      timeout: z.number().int().positive().optional(),
    }),
    jsonOptions: z.object({ prompt: z.string() }).optional(),
    waitForSelector: z
      .object({
        selector: z.string(),
        timeout: z.number().optional(),
        visible: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export const CfCrawlStartResponse = z.object({
  success: z.boolean(),
  result: z.string().min(1),
  errors: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
});

export const CfCrawlStatus = z.enum([
  'running',
  'completed',
  'errored',
  'cancelled_due_to_timeout',
  'cancelled_due_to_limits',
  'cancelled_by_user',
]);

export const CfCrawlRecord = z.object({
  url: z.string().url(),
  html: z.string().optional(),
  markdown: z.string().optional(),
  json: z.record(z.unknown()).optional(),
});

export const CfCrawlResultsResponse = z.object({
  success: z.boolean(),
  result: z.object({
    status: CfCrawlStatus,
    records: z.array(CfCrawlRecord).optional(),
  }),
  errors: z.array(z.unknown()).optional(),
  messages: z.array(z.unknown()).optional(),
});

export type CfCrawlResultsResponse = z.infer<typeof CfCrawlResultsResponse>;
