/**
 * Prompt sent with every page to the AI extractor. Lives in its own module
 * (no Supabase import) so scripts and evals can use it outside Next.js.
 */
export const EXTRACTION_PROMPT =
  'Analyse the raw HTML of this page and return a JSON object with these exact keys. ' +
  'schemaMarkupTypes: look for <script type="application/ld+json"> tags in the raw HTML; extract the "@type" value from each and return as a string array (e.g. ["LocalBusiness","WebPage"]); return [] if none found. ' +
  'hasBlog: set hasBlog=true if (a) this page IS a blog/articles/news listing, OR (b) there is a nav/footer link whose href contains /blog, /articles, /news, /resources. ' +
  'hasFAQ: set hasFAQ=true if (a) this page IS a FAQ page, OR (b) there is a nav/footer/body link whose href contains /faq, /faqs, /help, /support. ' +
  'accreditations: string array of named regulatory or professional accreditations found anywhere on the page (e.g. "CQC registered", "ISO 9001", "UKAS accredited", "Care Quality Commission"); look for logos, badges, footer text, or "accredited by" phrases. ' +
  'certifications: string array of professional qualifications or certifications mentioned (e.g. "BTEC Level 4", "NVQ", "RGN", "NMC registered"); look for staff credentials, qualification badges, or "qualified" phrases. ' +
  'awardsAndMemberships: string array of industry awards, trade body memberships, or recognised schemes (e.g. "Which? Trusted Trader", "Feefo Gold Award", "British Dental Association member", "Investors in People"); look for badge images, footer logos, or "proud member of" / "award-winning" text. ' +
  'reviewPlatformsLinked: string array of review platform names linked from the page (e.g. "Trustpilot", "Google Reviews", "Feefo", "Checkatrade", "Trustist"); look for outbound links or embedded widgets. ' +
  'teamPageExists: true if the page IS a team/about-us/meet-the-team page, or if there is a prominent nav link to one (e.g. href contains /team, /aboutus, /about-us, /about, /meet-us, /our-team, /people). ' +
  'insuranceMentioned: true if any form of insurance is mentioned (public liability, professional indemnity, fully insured, etc.). ' +
  'guaranteesMentioned: string array of explicit guarantees or warranties mentioned (e.g. "30-day money-back guarantee", "12-month workmanship guarantee"). ' +
  'servicesListed: string array of every distinct service, treatment, or offering explicitly named on the page; look in nav menus, section headings (h2/h3), list items (li), pricing tables, service cards, and any block labelled "services", "treatments", "what we offer", "our work", or similar; use the exact names as written on the page (e.g. "Swedish Massage", "Gel Nails", "Boiler Service", "Wedding Photography"); return [] only if no services are mentioned anywhere. ' +
  'serviceAreasMentioned: string array of geographic locations, towns, counties, or regions explicitly mentioned as service areas; look in footer, "areas we cover", "we serve", address blocks, or page copy. ' +
  'Other keys: title (page title), metaDescription (meta description), h1Tags (array of h1 text), hasSitemap (bool), hasRobotsTxt (bool), internalLinkCount (number), canonicalTagsPresent (bool), altTagCoverage ("full"|"partial"|"none"), hasPortfolio (bool), portfolioItemCount (number), hasContactForm (bool — true if the page contains a <form> element with input fields, a "Contact Us" form, or any embedded form widget regardless of label), hasBookingSystem (bool), bookingProvider (string or null), hasCallToAction (bool), ctaText (string array), hasNewsletterSignup (bool), socialLinksPresent (string array), hasPhoneNumberProminent (bool), newServicesDetected (string array), removedServicesDetected (string array), newTechIntegrations (string array), recentAnnouncementsOrNews (array of {title,date,summary}), recentHiringSignals (string array), newLocationsOrExpansion (string array). ' +
  'sectorSpecific: an object containing sector-specific signals — only populate fields that are clearly evidenced on the page, leave others null or omit them. ' +
  'sectorSpecific.cqcRating: string or null — the CQC inspection rating if explicitly stated (e.g. "Outstanding", "Good", "Requires Improvement", "Inadequate"); look for CQC badge, rating banner, or inspection report link. ' +
  'sectorSpecific.ofstedRating: string or null — the Ofsted inspection rating if explicitly stated (e.g. "Outstanding", "Good", "Requires Improvement", "Inadequate"); look for Ofsted badge, rating text, or inspection report link. ' +
  'sectorSpecific.treatmentsListed: string array — named medical, cosmetic, or aesthetic treatments listed (e.g. "Botox", "dermal fillers", "HRT", "private GP consultation", "IV drip"); look in service lists, treatment menus, or pricing pages. ' +
  'sectorSpecific.consultationBookable: bool or null — true if the page offers a bookable consultation (online or phone); look for "book a consultation", "schedule a call", or a booking widget. ' +
  'sectorSpecific.gasSafeRegistered: bool or null — true if Gas Safe registration is mentioned or a Gas Safe logo/number is present. ' +
  'sectorSpecific.nicEicApproved: bool or null — true if NICEIC or EIC (Electrical Installation Certificate) approval is mentioned or their logo is present. ' +
  'sectorSpecific.trustmarkMember: bool or null — true if TrustMark membership or logo is present. ' +
  'sectorSpecific.dvsaApproved: bool or null — true if DVSA approval or an Approved Driving Instructor (ADI) badge is mentioned. ' +
  'sectorSpecific.passRates: string or null — any stated pass rate or first-time pass rate percentage (e.g. "72% first-time pass rate"); return the raw string as found. ' +
  'sectorSpecific.ageRangesCovered: string array — age ranges or year groups catered for, relevant to nurseries, childminders, or tutors (e.g. "0-5 years", "Key Stage 1", "6 weeks to 5 years").';
