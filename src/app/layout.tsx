import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import { JsonLd } from '@/components/JsonLd';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://scoutly.io'),
  title: {
    default: 'Scoutly — Local Competitor Intelligence',
    template: '%s | Scoutly',
  },
  description:
    'Track local competitors, monitor Google Business changes, and get actionable SEO insights. The intelligence tool built for local businesses.',
  keywords: [
    'competitor intelligence',
    'local SEO',
    'Google Business monitoring',
    'competitor tracking',
    'local business intelligence',
    'SEO tools',
  ],
  authors: [{ name: 'Scoutly' }],
  creator: 'Scoutly',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://scoutly.io',
    siteName: 'Scoutly',
    title: 'Scoutly — Local Competitor Intelligence',
    description:
      'Track local competitors, monitor Google Business changes, and get actionable SEO insights.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Scoutly — Local Competitor Intelligence',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Scoutly — Local Competitor Intelligence',
    description:
      'Track local competitors, monitor Google Business changes, and get actionable SEO insights.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://scoutly.io',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <JsonLd />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
