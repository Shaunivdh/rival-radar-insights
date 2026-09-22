const SITEMAP_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];
const PEEK_BYTES = 2048;
const TIMEOUT_MS = 8000;

const HEADERS = {
  'User-Agent': 'RivalRadar/1.0 (+https://rivalradar.com/bot)',
  Accept: 'text/plain, application/xml, text/xml, */*;q=0.5',
};

/**
 * GET and read only the first few KB of the body, then abort. HEAD returns
 * 403/405 on many hosts (WordPress security plugins, some CDNs), which cost
 * 10 health points for a sitemap that exists; a GET with an early abort costs
 * one round-trip and no more bandwidth than HEAD plus a small body.
 */
async function peek(url: string): Promise<{
  ok: boolean;
  contentType: string;
  body: string;
} | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: HEADERS,
      redirect: 'follow',
    });
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    let body = '';
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (body.length < PEEK_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => undefined);
    } else {
      body = await res.text().catch(() => '');
    }
    return { ok: res.ok, contentType, body: body.slice(0, PEEK_BYTES) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A real robots.txt is text/plain or at least contains a User-agent directive — SPA catch-alls return 200 HTML. */
function isRobotsTxt(r: NonNullable<Awaited<ReturnType<typeof peek>>>): boolean {
  if (!r.ok) return false;
  if (r.contentType.includes('text/plain')) return true;
  return /^\s*user-agent\s*:/im.test(r.body);
}

/** A real sitemap is XML — by content-type or by body — never an HTML fallback page. */
function isSitemap(r: NonNullable<Awaited<ReturnType<typeof peek>>>): boolean {
  if (!r.ok) return false;
  const body = r.body.trimStart();
  if (/<(urlset|sitemapindex)\b/i.test(body)) return true;
  if (/^<\?xml/i.test(body) && !/<html/i.test(body)) return true;
  return r.contentType.includes('xml') && !/<html/i.test(body);
}

export async function checkDirectSignals(url: string): Promise<{
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
}> {
  try {
    const base = new URL(url).origin;

    const [robots, ...sitemaps] = await Promise.all([
      peek(`${base}/robots.txt`),
      ...SITEMAP_PATHS.map((p) => peek(`${base}${p}`)),
    ]);

    const hasRobotsTxt = robots != null && isRobotsTxt(robots);
    let hasSitemap = sitemaps.some((s) => s != null && isSitemap(s));

    // robots.txt may point at a sitemap living somewhere else
    if (!hasSitemap && hasRobotsTxt && robots && /^\s*sitemap\s*:/im.test(robots.body)) {
      hasSitemap = true;
    }

    return { hasRobotsTxt, hasSitemap };
  } catch {
    return { hasRobotsTxt: false, hasSitemap: false };
  }
}
