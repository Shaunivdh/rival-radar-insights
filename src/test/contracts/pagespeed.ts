/** Contract for PageSpeed Insights v5. */
import { z } from 'zod';

export const PsiRequestQuery = z.object({
  url: z.string().url(),
  strategy: z.enum(['mobile', 'desktop']),
  key: z.string().optional(),
});

const Audit = z.object({ numericValue: z.number().optional() }).passthrough();

export const PsiResponse = z
  .object({
    lighthouseResult: z
      .object({
        categories: z
          .object({
            performance: z.object({ score: z.number().min(0).max(1).nullable() }).passthrough(),
          })
          .passthrough(),
        audits: z.record(Audit),
      })
      .passthrough(),
  })
  .passthrough();
