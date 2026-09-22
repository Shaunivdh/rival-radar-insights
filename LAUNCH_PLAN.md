# Scoutly — Go-Live Plan

## What Exists Today

| Area                  | Status                  | Detail                                                                            |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Domain                | `scoutly.io` configured | In layout.tsx, robots.ts, sitemap.ts                                              |
| Branding              | Partial                 | "Scoutly" in public files, "RivalRadar" still in some components                  |
| Auth                  | Working                 | Supabase email/password, protected routes                                         |
| Onboarding            | Working                 | Signup → add business → add competitors → auto-scan                               |
| Crawling              | Working                 | Cloudflare + Inngest queue, fallback to direct fetch                              |
| Scoring               | Working                 | 6 categories, overall score, trends                                               |
| AI Actions            | Working                 | 27 rule templates + LLM fallback + validation layer                               |
| Competitor comparison | Working                 | Side-by-side scores, strengths/weaknesses                                         |
| GBP monitoring        | Removed                 | OAuth flow/reviews/location deleted; GBP completeness still scored via Places API |
| AI mention tracking   | Working                 | Multi-prompt presence scoring                                                     |
| Email template        | Built                   | WeeklyDigest.tsx exists, Resend configured                                        |
| Email sending         | Not wired               | No cron/scheduler triggers it                                                     |
| Stripe/billing        | Nothing                 | No package, no env vars, no code                                                  |
| Landing page          | Nothing                 | Root redirects to login                                                           |
| Analytics             | Nothing                 | No Sentry, PostHog, or Plausible                                                  |
| Hosting               | Not deployed            | No Vercel project linked                                                          |
| Resend FROM email     | Placeholder             | Still set to `noreply@yourdomain.com`                                             |

---

## Phase 1: Validate (Days 1-3)

**Goal:** Prove the product gives correct advice before building anything else.

### Day 1: Test 5 businesses

- [ ] Pick 5 real local businesses (see TESTING_CHECKLIST.md for how to choose)
- [ ] Add each with 2-3 competitors
- [ ] Wait for scans to complete (~5 min each)
- [ ] Work through the testing checklist for each business

### Day 2: Fix what's broken

- [ ] Fix any false positive actions (recommending something that already exists)
- [ ] Fix any false negatives (missing obvious problems)
- [ ] Fix any crawl failures or incomplete data
- [ ] Re-scan fixed businesses to verify

### Day 3: Confidence check

- [ ] All 5 businesses produce advice you'd send to a paying customer
- [ ] Screenshot each dashboard — these are your case study material
- [ ] Note which 2-3 look best for marketing

**Exit criteria:** You can look at every action for every business and say "yes, this is correct."

---

## Phase 2: Ship the Commercial Layer (Days 4-10)

### 2a. Deploy to Vercel (Day 4)

- [ ] Create Vercel account (if needed) and link repo
- [ ] Add all env vars from `.env.local` to Vercel project settings
- [ ] Deploy and verify the app works at the Vercel URL
- [ ] Connect `scoutly.io` domain to Vercel
- [ ] Verify HTTPS, robots.txt, sitemap work on production
- [ ] Set up Inngest on Vercel (add INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY env vars)
- [ ] Verify a crawl works end-to-end on production

### 2b. Stripe Billing (Days 5-6)

- [ ] Create Stripe account at stripe.com
- [ ] Create product: "Scoutly" — £29/month
- [ ] Add a price with 14-day free trial
- [ ] Install `stripe` npm package
- [ ] Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- [ ] Create `/api/stripe/checkout` — creates a Checkout Session after signup
- [ ] Create `/api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Add `stripe_customer_id` and `subscription_status` columns to users/projects table
- [ ] Gate dashboard access: redirect to checkout if no active subscription
- [ ] Add "Manage billing" link in Settings → opens Stripe Customer Portal
- [ ] Test: signup → trial starts → dashboard accessible → cancel → dashboard locked

### 2c. Landing Page (Day 7)

- [ ] Create `/src/app/(public)/page.tsx` — public route, no auth required
- [ ] Move current setup redirect logic so `/` shows landing page for logged-out users
- [ ] Hero: "Know where your business stands. Know what to fix first."
- [ ] 3-step "How it works" section
- [ ] Feature list (weekly scorecard, competitor comparison, 3 actions, alerts)
- [ ] Pricing: £29/mo, 14-day free trial, no card required
- [ ] CTA button → signup page
- [ ] Social proof section (placeholder for case studies)
- [ ] Footer with basic links

### 2d. Email Setup (Day 8)

- [ ] Set up scoutly.io domain in Resend (DNS records for SPF/DKIM)
- [ ] Update `RESEND_FROM_EMAIL` to `hello@scoutly.io` or `noreply@scoutly.io`
- [ ] Create Inngest cron function: runs every Monday 8am UTC
- [ ] For each active project: fetch latest scores, top action, competitor delta
- [ ] Send WeeklyDigest email via Resend
- [ ] Add unsubscribe link (legal requirement)
- [ ] Send a test email to yourself and verify it renders correctly

### 2e. Branding Cleanup (Day 9)

- [ ] Search for all "RivalRadar" / "Rival Radar" references in codebase
- [ ] Replace with "Scoutly" everywhere
- [ ] Verify Inngest app name is "Scoutly"
- [ ] Update DemoBanner, PriorityActionsPanel, CompetitorComparisonCard, DashboardGreeting
- [ ] Update middleware unlock page references
- [ ] Update WeeklyDigest email template branding
- [ ] Verify no "RivalRadar" appears anywhere in the UI

### 2f. Trust & Polish (Day 10)

- [ ] Add "Last scanned" timestamp on dashboard
- [ ] Add "Re-scan now" button (calls existing `/api/crawl` POST with mode: incremental)
- [ ] Show scan status per competitor (success/failed/in-progress)
- [ ] Add empty state for new users waiting for first scan
- [ ] Test full flow on production: signup → add business → scan → dashboard → email

---

## Phase 3: Monitoring & Pre-launch (Days 11-12)

### 3a. Error Monitoring

- [ ] Set up Sentry free tier (sentry.io)
- [ ] Install `@sentry/nextjs`
- [ ] Add to `next.config.ts` and create `sentry.client.config.ts` / `sentry.server.config.ts`
- [ ] Verify errors from crawl failures appear in Sentry

### 3b. Analytics

- [ ] Add Vercel Analytics (free, one line) or Plausible
- [ ] Track: landing page views, signup starts, signup completions, first scan triggered

### 3c. Production Smoke Test

- [ ] Full flow test on scoutly.io with a fresh account
- [ ] Stripe checkout works with test card
- [ ] Crawl completes on production
- [ ] Scores render correctly
- [ ] Actions are accurate
- [ ] Weekly email sends (trigger manually for test)
- [ ] Mobile responsive check on landing page + dashboard

---

## Phase 4: Beta Launch (Days 13-15)

### 4a. Seed Users

- [ ] Reach out to the 5 businesses you tested — offer 3 months free
- [ ] Prepare a cold outreach message with a screenshot of their score
- [ ] Cold email 20 local businesses with personalised screenshots
- [ ] Post in 2-3 local business Facebook groups or forums
- [ ] Offer founders rate (£19/mo locked in) for first 10 paying users

### 4b. Go Live

- [ ] Remove any site password lock (`SITE_PASSWORD` env var)
- [ ] Open signups on landing page
- [ ] Share on LinkedIn with a case study screenshot
- [ ] Monitor Sentry for first 48 hours
- [ ] Respond to every user question within 4 hours

### 4c. First Week After Launch

- [ ] Check: are scans completing for all new signups?
- [ ] Check: are weekly emails delivering (Resend dashboard)?
- [ ] Check: are actions accurate for businesses you don't know?
- [ ] Ask 3 beta users for a 15-min feedback call
- [ ] Fix the #1 complaint immediately

---

## Phase 5: Iterate (Weeks 3-6)

- [ ] Collect feedback weekly
- [ ] Track: which actions do users act on?
- [ ] Track: do users return after week 1?
- [ ] Fix top 3 complaints
- [ ] Build 3 case studies with before/after data
- [ ] Decide: keep £29, adjust price, or add tiers?

---

## Key Metrics

| Metric                          | Target      |
| ------------------------------- | ----------- |
| Signup → first scan complete    | < 5 minutes |
| Scan success rate               | > 90%       |
| Action accuracy (manual review) | > 85%       |
| Weekly email open rate          | > 40%       |
| Trial → paid conversion         | > 15%       |
| Week 4 retention                | > 60%       |

---

## What NOT to Build Yet

- Multi-user / team accounts
- White-label / agency mode
- PDF export
- Slack / webhook integrations
- Additional data sources beyond Google
- Mobile app

---

## Security: Rotate These Keys

Your `.env.local` keys have been exposed in conversation. Before going live:

- [ ] Rotate Supabase anon key and service role key
- [ ] Rotate Anthropic API key
- [ ] Rotate Google API keys
- [ ] Rotate SERP API key
- [ ] Rotate Resend API key
- [ ] Rotate Cloudflare API token
- [ ] Update all env vars in Vercel after rotation
