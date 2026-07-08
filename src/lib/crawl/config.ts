/**
 * Single source of truth for the automatic crawl cadence.
 *
 * Every business is re-crawled once per interval. The daily health-check cron is the SOLE
 * scheduler — it re-queues any business whose `last_crawled_at` is older than the interval.
 * Because scheduling is staleness-based (not self-perpetuating per crawl), duplicate recurring
 * crawl chains are structurally impossible no matter how many manual re-scans happen.
 *
 * To change the cadence, edit CRAWL_INTERVAL_DAYS only.
 */
export const CRAWL_INTERVAL_DAYS = 7;
export const CRAWL_INTERVAL_MS = CRAWL_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

/** Window for deduplicating threat/change events — one crawl interval plus a day of slack. */
export const THREAT_DEDUP_MS = (CRAWL_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000;
