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
 * Extract the hostname from a URL, normalizing first so bare domains work.
 */
export function extractDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname;
  } catch {
    return url.trim();
  }
}
