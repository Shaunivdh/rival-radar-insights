/** Recorded-shape Cloudflare Browser Rendering responses (trimmed). */
export const CF_JOB_ID = 'job_test_0001';

export const cfStartResponse = { success: true, result: CF_JOB_ID, errors: [], messages: [] };

export const cfRunningResponse = {
  success: true,
  result: { status: 'running', records: [] },
  errors: [],
  messages: [],
};

export const cfSampleHtml = `<!doctype html><html lang="en"><head>
<title>Acme Plumbing | Emergency Plumbers in Bristol</title>
<meta name="description" content="Gas Safe registered plumbers in Bristol. 24/7 emergency callouts, boiler repair and bathroom installs.">
<link rel="canonical" href="https://acme-plumbing.test/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Acme Plumbing"}</script>
</head><body>
<h1>Acme Plumbing Bristol</h1>
<nav><a href="/services">Services</a><a href="/about">About us</a><a href="/contact">Contact</a><a href="/blog">Blog</a><a href="/pricing">Pricing</a></nav>
<p>Gas Safe registered. Fully insured. 5-star rated on Google and Trustpilot.</p>
<img src="/van.jpg" alt="Acme Plumbing van"><img src="/team.jpg">
<a href="https://g.page/acme-plumbing">Google reviews</a>
<footer>© Acme Plumbing Ltd</footer>
</body></html>`;

export const cfCompletedResponse = {
  success: true,
  result: {
    status: 'completed',
    records: [
      { url: 'https://acme-plumbing.test/', html: cfSampleHtml },
      {
        url: 'https://acme-plumbing.test/services',
        html: '<!doctype html><html><head><title>Services | Acme Plumbing</title></head><body><h1>Our services</h1><p>Boiler repair, bathroom installation, emergency plumbing.</p></body></html>',
      },
    ],
  },
  errors: [],
  messages: [],
};

export const cfErroredResponse = {
  success: true,
  result: { status: 'errored', records: [] },
  errors: [],
  messages: [],
};
