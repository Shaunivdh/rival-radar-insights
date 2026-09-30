/**
 * Synthetic HTML fixtures for crawl parsing and orchestrator decision tests.
 *
 * Hand-written for fictional businesses on `.test` domains — never captured
 * from a real competitor's site. Each fixture targets one branch of the
 * crawl pipeline described in CLAUDE.md §6: an empty render, a bot challenge,
 * a dismissable overlay, and a fully-rendered page with ld+json.
 */

/** Under the 500-char usability floor and under diagnosePage's 300-char `empty_html` threshold. */
export const nearEmptyHtml =
  `<!doctype html><html lang="en"><head><title>Northwind Dental</title></head>` +
  `<body><div id="root"></div><script src="/app.js"></script></body></html>`;

/**
 * Cloudflare interstitial: the challenge overwrites <title> and owns the only
 * <h1>, so anything parsed from it is the blocker's content, not the site's.
 * `og:title` survives, which is what stripPopupOverlays restores from.
 */
export const cloudflareChallengeHtml = `<!doctype html><html lang="en"><head>
<title>Just a moment...</title>
<meta property="og:title" content="Northwind Dental — Chester">
</head><body>
<div id="challenge-running">
<h1>Checking your browser before accessing northwind-dental.test</h1>
<p>This process is automatic. Your browser will redirect shortly.</p>
</div>
<div id="cf-wrapper"><p>DDoS protection by Cloudflare</p></div>
</body></html>`;

/**
 * Real content behind a cookie-consent overlay. The page is usable as-is —
 * diagnosePage should flag popup signals without marking it unusable — and the
 * overlay div matches STRIP_PATTERNS so stripping leaves the content intact.
 * Padded past the 500-char floor so it survives the usability check.
 */
export const cookieOverlayHtml = `<!doctype html><html lang="en"><head>
<title>Northwind Dental | Private Dentist in Chester</title>
<meta name="description" content="Private dental practice in Chester offering implants, whitening and hygiene appointments.">
<link rel="canonical" href="https://northwind-dental.test/">
</head><body>
<div class="cookie-banner"><p>We use cookies to improve your experience.</p><button>Accept all</button></div>
<h1>Private Dentistry in Chester</h1>
<nav>
<a href="/treatments">Treatments</a><a href="/about">About us</a><a href="/team">Our team</a>
<a href="/fees">Fees</a><a href="/contact">Contact</a><a href="/blog">Blog</a>
</nav>
<p>GDC registered clinicians. Same-day emergency appointments available across Cheshire.</p>
<p>Our Chester practice has cared for families in the area for over twenty years, offering
routine hygiene visits through to full implant restorations in a single location.</p>
<a href="https://northwind-dental.test/fees">See our fees</a>
<a href="https://www.trustpilot.com/review/northwind-dental.test">Trustpilot reviews</a>
<a href="tel:01244555123">01244 555123</a>
<footer>© Northwind Dental Ltd, Chester</footer>
</body></html>`;

/**
 * Fully-rendered page carrying ld+json in both shapes the parser handles:
 * an `@graph` array and a node with an array-valued `@type`.
 */
export const schemaRichHtml = `<!doctype html><html lang="en"><head>
<title>Northwind Dental | Implants &amp; Whitening</title>
<meta name="description" content="Implants, whitening and hygiene in Chester.">
<link rel="canonical" href="https://northwind-dental.test/treatments">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
{"@type":"Dentist","name":"Northwind Dental"},
{"@type":["WebSite","Organization"],"name":"Northwind Dental"},
{"@type":"Service","name":"Dental Implants"},
{"@type":"Service","name":"Teeth Whitening"}
]}
</script>
<script type="application/ld+json">{ this is not valid json </script>
</head><body>
<h1>Treatments</h1>
<nav><a href="/">Home</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
<a href="https://northwind-dental.test/fees">Fees</a>
<a href="https://partner-lab.test/">Our partner lab</a>
<a href="mailto:hello@northwind-dental.test">Email us</a>
<img src="/implant.jpg" alt="Dental implant diagram"><img src="/decor.jpg">
</body></html>`;
