export function JsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Scoutly',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Local competitor intelligence and SEO monitoring tool. Track competitors, monitor Google Business changes, and get actionable insights.',
    url: 'https://scoutly.io',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free trial available',
    },
  };

  return <script type="application/ld+json">{JSON.stringify(schema)}</script>;
}
