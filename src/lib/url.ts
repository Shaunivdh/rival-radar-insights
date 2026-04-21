/**
 * Normalize a user-supplied URL to a full https:// URL.
 * Handles: "mspdetails.co.uk", "www.mspdetails.co.uk",
 *          "https://mspdetails.co.uk", "https://www.mspdetails.co.uk"
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Check whether a user-supplied URL resolves to a valid https URL with a real hostname.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

/**
 * Extract the hostname from a URL, normalizing first so bare domains work.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname;
  } catch {
    return url.trim();
  }
}
