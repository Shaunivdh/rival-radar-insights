export async function checkDirectSignals(url: string): Promise<{
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
}> {
  try {
    const base = new URL(url).origin;
    const headers = {
      'User-Agent': 'RivalRadar/1.0 (+https://rivalradar.com/bot)',
    };

    const [robotsRes, sitemapRes] = await Promise.allSettled([
      fetch(`${base}/robots.txt`, {
        signal: AbortSignal.timeout(8000),
        headers,
      }),
      fetch(`${base}/sitemap.xml`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8000),
        headers,
      }),
    ]);

    const hasRobotsTxt =
      robotsRes.status === 'fulfilled' && robotsRes.value.ok;

    let hasSitemap =
      sitemapRes.status === 'fulfilled' && sitemapRes.value.ok;

    // If sitemap.xml not found, check robots.txt body for Sitemap: directive
    if (!hasSitemap && robotsRes.status === 'fulfilled' && robotsRes.value.ok) {
      try {
        const robotsBody = await robotsRes.value.text();
        if (/^sitemap:/im.test(robotsBody)) hasSitemap = true;
      } catch {
        // ignore
      }
    }

    return { hasRobotsTxt, hasSitemap };
  } catch {
    return { hasRobotsTxt: false, hasSitemap: false };
  }
}
