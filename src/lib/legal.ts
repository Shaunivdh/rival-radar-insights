/**
 * Details shown on /privacy and /terms. Server-only values (SUPPORT_EMAIL) are read
 * in the server components that import this.
 */

// TODO(legal): your full legal name as a sole trader, or the company name + number once incorporated.
export const LEGAL_ENTITY_NAME = 'Scoutly';

// TODO(legal): business or correspondence address. Optional for a sole trader; leave null to hide.
export const LEGAL_ADDRESS: string | null = null;

// TODO(legal): ICO data protection fee registration number (ico.org.uk/fee). Null hides the line.
export const ICO_REGISTRATION_NUMBER: string | null = null;

// TODO(legal): confirm against your Supabase plan's backup window before launch.
export const BACKUP_RETENTION_DAYS = 30;

// Bump whenever either page's wording changes.
export const LEGAL_LAST_UPDATED = '9 October 2026';

export function legalContactEmail(): string {
  // TODO(legal): set SUPPORT_EMAIL in every environment; the fallback is a placeholder.
  return process.env.SUPPORT_EMAIL || 'hello@scoutly.io';
}
