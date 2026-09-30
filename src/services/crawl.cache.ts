// Dev-only cache: speeds up local iteration by skipping re-crawls.
// In production (Vercel), the filesystem is ephemeral so this is a no-op;
// signals are persisted in Supabase (extracted_signals table) instead.
import fs from 'fs';
import path from 'path';
import type { RawCrawlResult } from '@/types';
import { logger } from '@/lib/logger';

const IS_VERCEL = !!process.env.VERCEL;
const CACHE_DIR = IS_VERCEL
  ? path.join('/tmp', '.crawl-cache')
  : path.join(process.cwd(), '.crawl-cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(url: string) {
  return url.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
}

export function saveToCache(url: string, data: RawCrawlResult) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, cacheKey(url));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  logger.info('crawl-cache', 'Saved', { file });
}

export function loadFromCache(url: string): RawCrawlResult | null {
  const file = path.join(CACHE_DIR, cacheKey(url));
  if (!fs.existsSync(file)) return null;
  logger.info('crawl-cache', 'Hit', { file });
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as RawCrawlResult;
}
