/**
 * Worker-side business row helpers. These live outside `src/actions` on
 * purpose: they are called by the Inngest worker with no user session, so
 * they must NOT be exported from a 'use server' file (that would expose
 * them as unauthenticated public endpoints).
 */
import { supabaseAdmin } from '@/lib/supabase/server';
import { toJson } from '@/lib/supabase/mappers';
import type { Business, ChangeEvent } from '@/types';

export async function updateBusiness(
  businessId: string,
  partial: Partial<
    Pick<
      Business,
      | 'crawlStatus'
      | 'crawlJobId'
      | 'lastCrawledAt'
      | 'aiScore'
      | 'googleData'
      | 'serpData'
      | 'aiVisibility'
      | 'pagespeedData'
      | 'reviewSentiment'
    >
  >,
  extras?: { googlePlaceId?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (partial.crawlStatus !== undefined) row.crawl_status = partial.crawlStatus;
  if (partial.crawlJobId !== undefined) row.crawl_job_id = partial.crawlJobId;
  if (partial.lastCrawledAt !== undefined)
    row.last_crawled_at = partial.lastCrawledAt
      ? new Date(partial.lastCrawledAt).toISOString()
      : null;
  if (partial.aiScore !== undefined) row.ai_score = partial.aiScore;
  if (partial.googleData !== undefined) row.google_data = partial.googleData;
  if (partial.serpData !== undefined) row.serp_data = partial.serpData;
  if (partial.aiVisibility !== undefined) row.ai_visibility = partial.aiVisibility;
  if (partial.pagespeedData !== undefined) row.pagespeed_data = partial.pagespeedData;
  if (partial.reviewSentiment !== undefined) row.review_sentiment = partial.reviewSentiment;
  if (extras?.googlePlaceId !== undefined) row.google_place_id = extras.googlePlaceId;

  const { error } = await supabaseAdmin.from('businesses').update(row).eq('id', businessId);
  if (error) throw new Error(error.message);
}

export async function saveChangeEvent(businessId: string, event: ChangeEvent): Promise<void> {
  const { error } = await supabaseAdmin.from('change_events').insert({
    id: event.id,
    business_id: businessId,
    detected_at: new Date(event.detectedAt).toISOString(),
    severity: event.severity,
    summary: event.summary,
    changes: toJson(event.changes),
  });
  if (error) throw new Error(error.message);
}
