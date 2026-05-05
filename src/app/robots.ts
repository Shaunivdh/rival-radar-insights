import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/competitors', '/changes', '/settings', '/setup', '/api/'],
      },
    ],
    sitemap: 'https://scoutly.io/sitemap.xml',
  };
}
