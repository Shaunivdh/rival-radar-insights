/**
 * Parse deterministic SEO signals directly from raw HTML.
 * More reliable than AI extraction for structured metadata fields.
 */
export function parseHtmlSignals(html: string, baseUrl?: string): Record<string, unknown> {
  const signals: Record<string, unknown> = {};
  // Strip HTML tags for content-based pattern matching (handles inline tags like <strong>ISO</strong> 9001)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    signals.title = titleMatch[1]
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
  }

  // Meta description
  const metaDescMatch =
    html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) ??
    html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  if (metaDescMatch) signals.metaDescription = metaDescMatch[1].trim();

  // H1 tags
  const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  const h1Tags = h1Matches
    .map(m => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(t => t && !/^email\s+protection$/i.test(t));
  if (h1Tags.length > 0) signals.h1Tags = h1Tags;

  // Canonical tag
  signals.canonicalTagsPresent = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html);

  // Schema markup types from ld+json (AI strips these, so parse here)
  const ldJsonMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const schemaTypes = new Set<string>();
  for (const match of ldJsonMatches) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      const graph = parsed['@graph'];
      const nodes = Array.isArray(graph) ? graph : [parsed];
      for (const node of nodes) {
        const t = (node as Record<string, unknown>)['@type'];
        if (Array.isArray(t)) t.forEach(v => typeof v === 'string' && schemaTypes.add(v));
        else if (typeof t === 'string') schemaTypes.add(t);
      }
    } catch { /* ignore malformed JSON */ }
  }
  if (schemaTypes.size > 0) signals.schemaMarkupTypes = [...schemaTypes];

  // Alt tag coverage
  const imgMatches = [...html.matchAll(/<img[^>]+>/gi)];
  if (imgMatches.length > 0) {
    const withAlt = imgMatches.filter(m => /\balt=["'][^"']+["']/i.test(m[0])).length;
    const ratio = withAlt / imgMatches.length;
    signals.altTagCoverage = ratio >= 0.9 ? 'full' : ratio >= 0.5 ? 'partial' : 'none';
  }

  // FAQ — link to /faq or /faqs anywhere in the HTML, or current page IS a FAQ page
  const hasFaqLink = /href=["'][^"']*\/faqs?(\/|["']|\?|$)/i.test(html);
  const hasFaqHeading = /<h[1-3][^>]*>[^<]*(?:faq|frequently asked)/i.test(html);
  if (hasFaqLink || hasFaqHeading) signals.hasFAQ = true;

  // Blog/articles — link to /blog, /articles, /news, /resources anywhere in the HTML
  const hasBlogLink = /href=["'][^"']*\/(blog|articles?|news|resources)(\/|["']|\?|$)/i.test(html);
  if (hasBlogLink) signals.hasBlog = true;

  // Team page — nav/footer link to /about, /team, /our-team, /meet-us, /people
  signals.teamPageExists = /href=["'][^"']*\/(about|about-us|aboutus|our-team|meet-the-team|meet-us|team|people)(\/|["'])/i.test(html);

  // Insurance mentioned
  signals.insuranceMentioned = /\b(public liability|professional indemnity|fully insured|insurance|indemnity cover)\b/i.test(text);

  // Review platforms linked
  const reviewPlatforms = [
    ['Trustpilot', /trustpilot\.com/i],
    ['Google Reviews', /google\.com\/(maps|search)|maps\.google/i],
    ['Feefo', /feefo\.com/i],
    ['Checkatrade', /checkatrade\.com/i],
    ['Trustist', /trustist\.com/i],
    ['Reviews\.io', /reviews\.io/i],
    ['Yell', /yell\.com/i],
    ['Bark', /bark\.com/i],
  ] as [string, RegExp][];
  const linkedPlatforms = reviewPlatforms.filter(([, re]) => re.test(html)).map(([name]) => name);
  if (linkedPlatforms.length > 0) signals.reviewPlatformsLinked = linkedPlatforms;

  // Accreditations — regulatory/professional bodies
  const accreditationPatterns: [string, RegExp][] = [
    // Health & social care
    ['CQC', /care quality commission|cqc[\s\-]?(?:registered|regulated|rated|approved|inspected)|cqc\.org\.uk/i],
    ['OFSTED', /ofsted[\s\-]?(registered|rated|approved|outstanding|good)/i],
    ['NHS', /nhs[\s\-]?(approved|accredited|framework|partner)/i],
    ['MHRA', /mhra[\s\-]?(approved|licensed|registered)|medicines\s+&?\s+healthcare/i],
    // Quality & data
    ['UKAS', /ukas[\s\-]?accredited|ukas\.com/i],
    ['Cyber Essentials', /cyber\s+essentials(\+)?/i],
    // Financial
    ['FCA', /fca[\s\-]?(regulated|authorised|registered)|financial conduct authority/i],
    ['ICO', /ico[\s\-]?registered|information commissioner/i],
    // Government / procurement
    ['CCS', /crown commercial service|ccs[\s\-]?supplier/i],
    ['G-Cloud', /g[\s\-]cloud[\s\-]?(supplier|approved|listed)/i],
    // Dental
    ['CQC (Dental)', /cqc[\s\-]?(registered|rated)[\s\S]{0,60}dent/i],
    ['GDC Practice', /gdc[\s\-]?(registered\s+)?practice|registered\s+with\s+the\s+gdc/i],
    // Veterinary
    ['RCVS', /rcvs[\s\-]?(accredited|registered|practice\s+standards)|royal\s+college\s+of\s+veterinary/i],
    // ISO / quality management — allow &nbsp; and other HTML entity separators
    ['ISO 9001', /iso(?:[\s\-]|&nbsp;|&#160;)?9001/i],
    ['ISO 27001', /iso(?:[\s\-]|&nbsp;|&#160;)?27001/i],
    ['ISO 13485', /iso(?:[\s\-]|&nbsp;|&#160;)?13485/i],
    ['ISO 45001', /iso(?:[\s\-]|&nbsp;|&#160;)?45001/i],
    ['ISO 14001', /iso(?:[\s\-]|&nbsp;|&#160;)?14001/i],
    // Ecommerce / tech
    ['Shopify Partner', /shopify[\s\-]?(plus\s+)?partner/i],
    ['Shopify Plus', /shopify\s+plus/i],
    ['WooCommerce Expert', /woocommerce[\s\-]?(expert|agency|certified)/i],
    ['Google Partner', /google[\s\-]?(premier\s+)?partner/i],
    ['Meta Business Partner', /meta\s+business\s+partner|facebook\s+marketing\s+partner/i],
    ['Microsoft Partner', /microsoft[\s\-]?(gold\s+|silver\s+)?partner/i],
  ];
  const foundAccreditations = accreditationPatterns.filter(([, re]) => re.test(html) || re.test(text)).map(([name]) => name);
  if (foundAccreditations.length > 0) signals.accreditations = foundAccreditations;

  // Awards & memberships
  const awardPatterns: [string, RegExp][] = [
    // Consumer trust schemes
    ['Which? Trusted Trader', /which\??\s+trusted\s+trader/i],
    ['Trading Standards Approved', /trading\s+standards\s+approved/i],
    ['Checkatrade Approved', /checkatrade[\s\-]?(approved|member)/i],
    // Quality / workplace
    ['Investors in People', /investors\s+in\s+people/i],
    ['Feefo Gold', /feefo\s+gold/i],
    // Health sector insurers / networks
    ['BUPA Approved', /bupa[\s\-]?(approved|recognised|registered)/i],
    ['AXA Health', /axa[\s\-]?(ppp|health)[\s\-]?(approved|recognised)/i],
    ['Vitality', /vitality[\s\-]?(approved|recognised|partner)/i],
    ['Aviva', /aviva[\s\-]?(approved|recognised)/i],
    ['WPA', /wpa[\s\-]?(approved|recognised)/i],
    // Health & wellbeing awards
    ['Health and Protection Award', /health\s+(?:and|&amp;)\s+protection\s+award/i],
    ['WSB Health and Wellbeing Award', /wsb[\s\S]{0,80}health\s+(?:and|&amp;)\s+wellbeing|health\s+(?:and|&amp;)\s+wellbeing\s+provider\s+of\s+the\s+year/i],
    ['UK Business Awards', /uk\s+business\s+awards/i],
    ['Best Wellbeing Provider', /best\s+wellbeing\s+provider/i],
    // Dental specific
    ['BDA Good Practice', /bda[\s\-]?good\s+practice/i],
    ['Denplan', /denplan[\s\-]?(accredited|member|practice)/i],
    ['Invisalign Provider', /invisalign[\s\-]?(provider|platinum|diamond|elite)/i],
    // Vet specific
    ['RCVS Accredited Practice', /rcvs[\s\-]?accredited\s+practice|practice\s+standards\s+scheme/i],
    ['ISFM Cat Friendly', /isfm|cat\s+friendly\s+(clinic|practice|gold)/i],
    // Ecommerce / agency
    ['Shopify Plus Partner', /shopify\s+plus\s+partner/i],
    ['Klaviyo Partner', /klaviyo[\s\-]?(partner|master)/i],
    ['Yotpo Partner', /yotpo[\s\-]?partner/i],
  ];
  const foundAwards = awardPatterns.filter(([, re]) => re.test(html) || re.test(text)).map(([name]) => name);
  // Generic: capture named awards/prizes/commendations near "winner"/"commended"/"finalist"
  const namedAwardMatches = text.match(/(?:winner|commended|finalist|awarded)[^.]{0,80}?([A-Z][A-Za-z0-9\s&,]+(?:Award|Prize|Trophy|Recognition|Provider of the Year|Agency of the Year))/g);
  if (namedAwardMatches) foundAwards.push(...namedAwardMatches.map(s => s.replace(/^(winner|commended|finalist|awarded)[^A-Z]*/i, '').trim()).slice(0, 5));
  if (foundAwards.length > 0) signals.awardsAndMemberships = [...new Set(foundAwards)];

  // Certifications — professional qualifications
  const certPatterns: [string, RegExp][] = [
    // General health
    ['NMC', /nmc[\s\-]?registered|nursing\s+(?:and\s+)?midwifery\s+council/i],
    ['GMC', /gmc[\s\-]?registered|general\s+medical\s+council/i],
    ['GPhC', /gphc[\s\-]?registered|general\s+pharmaceutical\s+council/i],
    ['HCPC', /hcpc[\s\-]?registered|health\s+(?:care\s+)?professions?\s+council/i],
    ['BACP', /bacp[\s\-]?(accredited|member)/i],
    ['BPS', /bps[\s\-]?(chartered|accredited)/i],
    // Dental
    ['GDC', /gdc[\s\-]?registered|general\s+dental\s+council/i],
    ['BACD', /bacd[\s\-]?(member|accredited)|british\s+academy\s+of\s+cosmetic\s+dentistry/i],
    ['BSDHT', /bsdht|british\s+society\s+of\s+dental\s+hygiene/i],
    ['BDA Member', /bda[\s\-]?member|british\s+dental\s+association\s+member/i],
    // Veterinary
    ['RCVS', /rcvs[\s\-]?registered|royal\s+college\s+of\s+veterinary\s+surgeons/i],
    ['BVA', /bva[\s\-]?member|british\s+veterinary\s+association/i],
    ['BVHA', /bvha|british\s+veterinary\s+hospitals?\s+association/i],
    // Building & construction
    ['CSCS', /cscs[\s\-]?(card|certified|registered)/i],
    ['Gas Safe', /gas\s+safe[\s\-]?(registered|engineer|certificate)/i],
    ['NICEIC', /niceic[\s\-]?(approved|registered|contractor)/i],
    ['NAPIT', /napit[\s\-]?(registered|approved)/i],
    ['ECA Member', /eca[\s\-]?(member|approved)|electrical\s+contractors\s+association/i],
    ['CHAS', /chas[\s\-]?(accredited|registered|approved)/i],
    ['Safe Contractor', /safe\s*contractor[\s\-]?(approved|accredited)/i],
    ['SSIP', /ssip[\s\-]?(accredited|member)/i],
    ['RICS', /rics[\s\-]?(qualified|member|chartered)|royal\s+institution\s+of\s+chartered\s+surveyors/i],
    ['CIAT', /ciat[\s\-]?(member|chartered)|chartered\s+institute\s+of\s+architectural/i],
    ['ARB', /arb[\s\-]?registered|architects\s+registration\s+board/i],
    ['RIBA', /riba[\s\-]?(chartered|member)|royal\s+institute\s+of\s+british\s+architects/i],
    ['FGAS Certified', /f[\s\-]?gas[\s\-]?(certified|qualified|registered)/i],
    ['CITB', /citb[\s\-]?(registered|approved)/i],
    // Interior design
    ['BIID', /biid[\s\-]?(member|registered)|british\s+institute\s+of\s+interior\s+design/i],
    // Hairdressing & beauty
    ['NVQ Hairdressing', /nvq[\s\-]?(level\s+[23][\s\-])?hairdressing/i],
    ['City & Guilds', /city\s+(?:&|and)\s+guilds[\s\-]?(qualified|certified|trained)?/i],
    ['VTCT', /vtct[\s\-]?(qualified|certified)/i],
    ['Wella Professional', /wella[\s\-]?professionals?[\s\-]?(certified|trained|educator)/i],
    ["L'Oréal Certified", /l'?or[eé]al[\s\-]?(professionnel|certified|trained)/i],
    ['Schwarzkopf Certified', /schwarzkopf[\s\-]?(certified|trained|professional)/i],
    // Nail salons
    ['CND Certified', /cnd[\s\-]?(certified|shellac|vinylux)/i],
    ['OPI Certified', /opi[\s\-]?(certified|trained)/i],
    ['NVQ Beauty', /nvq[\s\-]?(level\s+[23][\s\-])?beauty\s+therapy/i],
    // Hospitality
    ['Food Hygiene Level 2', /food\s+hygiene[\s\-]?(level\s+2|certificate)/i],
    ['Food Hygiene Level 3', /food\s+hygiene[\s\-]?level\s+3/i],
    ['WSET', /wset[\s\-]?(level\s+[1-4]|award|diploma|certified)/i],
    ['Cask Marque', /cask\s+marque[\s\-]?(accredited|award)?/i],
    ['AA Rosette', /aa[\s\-]?rosette|[1-5][\s\-]aa[\s\-]?rosette/i],
    ['Allergen Trained', /allergen[\s\-]?(trained|awareness|certified)/i],
    // Ecommerce / digital
    ['Google Ads Certified', /google\s+ads\s+certif/i],
    ['Meta Certified', /meta[\s\-]?certified/i],
    ['CIM', /cim[\s\-]?(qualified|member)|chartered\s+institute\s+of\s+marketing/i],
    ['CIMA', /cima[\s\-]?(qualified|member)/i],
  ];
  const foundCerts = certPatterns.filter(([, re]) => re.test(html) || re.test(text)).map(([name]) => name);
  if (foundCerts.length > 0) signals.certifications = foundCerts;

  // Guarantees
  const guaranteeMatches = [...text.matchAll(/(\d+[\s\-](?:day|month|year)[\s\-](?:money[\s\-]back\s+)?guarantee|satisfaction\s+guarantee|workmanship\s+guarantee)/gi)];
  const guarantees = [...new Set(guaranteeMatches.map(m => m[0].trim()))];
  if (guarantees.length > 0) signals.guaranteesMentioned = guarantees;

  // Internal link count
  let baseHostname: string | null = null;
  if (baseUrl) {
    try { baseHostname = new URL(baseUrl).hostname; } catch { /* ignore */ }
  }
  const allHrefs = [...html.matchAll(/href=["']([^"'#][^"']*?)["']/gi)].map(m => m[1]);
  const internalLinks = allHrefs.filter(href => {
    if (/^(mailto|tel|javascript):/i.test(href)) return false;
    if (/^https?:\/\//i.test(href)) {
      if (!baseHostname) return false;
      try { return new URL(href).hostname === baseHostname; } catch { return false; }
    }
    return true; // relative paths like /page, ./page, ../page
  });
  signals.internalLinkCount = internalLinks.length;

  return signals;
}
