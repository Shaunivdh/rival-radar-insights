/**
 * Row → domain mappers for the tables with jsonb columns.
 *
 * Postgres hands jsonb back as `Json`; it cannot tell us what shape it stored.
 * Every narrowing from `Json` to a domain interface in this app funnels through
 * `fromJson` below, so the unchecked cast exists in exactly one place instead of
 * being sprinkled across call sites.
 */
import type { Database, Json } from '@/types/database';
import type {
  AIHealthScore,
  AIVisibility,
  Business,
  Change,
  ChangeEvent,
  ExtractedSignals,
  GoogleData,
  PageSpeedData,
  ReviewSentiment,
  SerpData,
} from '@/types';

type Tables = Database['public']['Tables'];
export type BusinessRow = Tables['businesses']['Row'];
export type ChangeEventRow = Tables['change_events']['Row'];
export type SignalsRow = Tables['extracted_signals']['Row'];

/** The one place a jsonb value is asserted to be a domain shape. */
function fromJson<T>(value: Json | null | undefined): T | null {
  if (value == null) return null;
  // jsonb occasionally arrives double-encoded as a JSON string. Treat an
  // unparseable one as "unknown" rather than throwing — these run inside page
  // loads and crawl steps, where null is recoverable and an exception is not.
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      console.warn('[mappers] discarding unparseable jsonb value:', value.slice(0, 80));
      return null;
    }
  }
  return value as T;
}

/**
 * Domain objects are plain JSON-serialisable structs — they are valid `Json` at
 * runtime and only fail the type because interfaces have no index signature.
 */
export function toJson<T>(value: T): Json {
  return value as Json;
}

/** Narrow a single jsonb column read straight off a row, where no full mapper fits. */
export const jsonColumn = fromJson;

/** The four jsonb columns of extracted_signals, as selected by callers. */
type SignalsColumns = Pick<SignalsRow, 'seo' | 'trust' | 'content' | 'engagement'>;

export function rowToSignals(sig: SignalsColumns | null | undefined): ExtractedSignals | null {
  if (!sig?.seo) return null;
  return rowToSignalsUnchecked(sig);
}

/**
 * Same mapping, for extracted_signals rows the caller already knows carry a
 * payload (the crawl diff path). Kept separate rather than throwing so those
 * call sites behave exactly as they did before they shared this mapper.
 */
export function rowToSignalsUnchecked(sig: SignalsColumns): ExtractedSignals {
  return {
    seo: fromJson(sig.seo),
    trust: fromJson(sig.trust),
    content: fromJson(sig.content),
    engagement: fromJson(sig.engagement),
  } as ExtractedSignals;
}

/** Callers select these five columns; business_id is not part of the domain type. */
type ChangeEventColumns = Pick<
  ChangeEventRow,
  'id' | 'detected_at' | 'severity' | 'summary' | 'changes'
>;

export function rowToChangeEvent(e: ChangeEventColumns): ChangeEvent {
  return {
    id: e.id,
    detectedAt: new Date(e.detected_at).getTime(),
    severity: e.severity as ChangeEvent['severity'],
    summary: e.summary,
    changes: fromJson<Change[]>(e.changes) ?? [],
  };
}

/**
 * The jsonb half of a businesses row. Split out because several queries select
 * only these columns, so they cannot be fed through the full `rowToBusiness`.
 */
export function businessJson(b: Partial<BusinessRow>) {
  return {
    googleData: fromJson<GoogleData>(b.google_data),
    serpData: fromJson<SerpData>(b.serp_data),
    aiScore: fromJson<AIHealthScore>(b.ai_score),
    aiVisibility: fromJson<AIVisibility>(b.ai_visibility),
    pagespeedData: fromJson<PageSpeedData>(b.pagespeed_data),
    reviewSentiment: fromJson<ReviewSentiment>(b.review_sentiment),
    enrichmentErrors: fromJson<Business['enrichmentErrors']>(b.enrichment_errors),
  };
}

export function rowToBusiness(
  b: BusinessRow,
  signals: ExtractedSignals | null = null,
  changeEvents: ChangeEvent[] = [],
): Business {
  return {
    id: b.id,
    name: b.name,
    url: b.url,
    domain: b.domain,
    lastCrawledAt: b.last_crawled_at ? new Date(b.last_crawled_at).getTime() : null,
    crawlJobId: b.crawl_job_id,
    crawlStatus: (b.crawl_status as Business['crawlStatus']) ?? 'idle',
    signals,
    ...businessJson(b),
    previousSignals: null,
    changeEvents,
  };
}
