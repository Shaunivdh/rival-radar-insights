# Scoutly — Go-Live Plan

> **Reviewed 21 Sep 2026** against branch `ui-improvements`.
> Since the plan was written on 8 Jun, the work that landed was quality and craft:
> the accuracy plan, a full test suite, the landing page, a theme and typography pass.
> The commercial layer (Stripe, deployment, monitoring) is still untouched.

## What Exists Today

| Area                  | Status                  | Detail                                                                                                                            |
| --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Domain                | `scoutly.io` configured | In layout.tsx, robots.ts, sitemap.ts. Not pointed at a host yet                                                                   |
| Branding              | Nearly done             | 3 user-visible "RivalRadar" strings left (see 2e). Internal names unchanged                                                       |
| Auth                  | Working                 | Supabase email/password, protected routes                                                                                         |
| Onboarding            | Working                 | Signup → add business → add competitors → auto-scan                                                                               |
| Crawling              | Working                 | Cloudflare + Inngest queue, fallback to direct fetch                                                                              |
| Scoring               | Working                 | 6 categories, overall score, trends                                                                                               |
| AI Actions            | Working                 | 27 rule templates + LLM fallback + validation layer. Accuracy plan phases 1 to 5 implemented, verification still open             |
| Competitor comparison | Working                 | Side-by-side scores, strengths/weaknesses                                                                                         |
| GBP monitoring        | Removed                 | OAuth flow, reviews and location deleted. GBP completeness still scored via Places API                                                                                                |
| AI mention tracking   | Working                 | Multi-prompt presence scoring                                                                                                     |
| Tests                 | Working                 | vitest + msw contracts, @inngest/test, Playwright e2e                                                                             |
| Landing page          | **Built**               | `/` renders `src/views/LandingPage.tsx`. Plus `/contact`, `/what-we-track`                                                        |
| Email template        | Built                   | WeeklyDigest.tsx + ContactMessage.tsx, `src/services/email.ts` wired to Resend                                                    |
| Email sending         | Not wired               | Contact form sends. No cron triggers the weekly digest                                                                            |
| Stripe/billing        | Nothing                 | No package, no env vars, no code, no gating                                                                                       |
| Analytics             | Nothing                 | No Sentry, PostHog, or Plausible                                                                                                  |
| Hosting               | Not deployed            | No Vercel project linked, `NEXT_PUBLIC_APP_URL` still localhost                                                                   |
| Resend FROM email     | Placeholder             | Still set to `noreply@yourdomain.com`                                                                                             |
| Branch state          | **Blocker**             | `origin/main` is 21 commits behind `ui-improvements`. Landing page, accuracy work and the whole test suite exist only on branches |

---

## Phase 0: Consolidate (do this first)

The landing page, accuracy improvements and test suite are not on `main`, so nothing
below can deploy from `main`.

- [ ] Merge `ui-improvements` into `main` (21 commits ahead)
- [ ] Decide what to do with `accuracy-improvement-plan`, `testing-setup`, `fix/scan-quality-and-action-plan` (merged already, or delete)
- [ ] Delete the broken ref `refs/heads/main 2`

---

## Phase 1: Validate (Days 1-3) — NOT STARTED

**Goal:** Prove the product gives correct advice before building anything else.

`TESTING_CHECKLIST.md` has 64 unchecked boxes and 0 ticked. This is still the real gate
on whether any of the rest is worth building.

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

### Carried over from the accuracy plan

`docs/accuracy-improvement-plan.md` (status 18 Sep) still has these open, and they
overlap with Phase 1:

- [ ] Verify against the live Anthropic API (nothing on that branch has hit it yet)
- [ ] Real ground-truth fixtures: 20 UK local-business homepages, hand-labelled
- [ ] A week of `[ai-event]` telemetry: parse failures, truncation, validation flags
- [ ] Close the open decisions: Sonnet 5 vs Opus 5, 8-page extraction cap, ChatGPT/Perplexity relabel

**Exit criteria:** You can look at every action for every business and say "yes, this is correct."

---

## Phase 2: Ship the Commercial Layer (Days 4-10)

### 2a. Deploy to Vercel (Day 4) — NOT STARTED

- [ ] Create Vercel account (if needed) and link repo
- [ ] Add all env vars from `.env.local` to Vercel project settings
- [ ] Deploy and verify the app works at the Vercel URL
- [ ] Connect `scoutly.io` domain to Vercel
- [ ] Update `NEXT_PUBLIC_APP_URL` to the production URL (OAuth callbacks depend on it)
- [ ] Verify HTTPS, robots.txt, sitemap work on production
- [ ] Set up Inngest on Vercel (add INNGEST_SIGNING_KEY + INNGEST_EVENT_KEY env vars)
- [ ] Verify a crawl works end-to-end on production

### 2b. Stripe Billing (Days 5-6) — NOT STARTED

Decide the price first: the plan says £29/mo with a 14-day trial, but
`src/components/marketing/Pricing.tsx` ships £12.99 as a placeholder with no trial
mentioned. The landing page and Stripe must agree before signups open.

- [ ] Settle on the price and trial terms, then update `Pricing.tsx`
- [ ] Create Stripe account at stripe.com
- [ ] Create product: "Scoutly" at the agreed price
- [ ] Add a price with the agreed free trial
- [ ] Install `stripe` npm package
- [ ] Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- [ ] Create `/api/stripe/checkout` — creates a Checkout Session after signup
- [ ] Create `/api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Add `stripe_customer_id` and `subscription_status` columns to users/projects table
- [ ] Gate dashboard access: redirect to checkout if no active subscription
- [ ] Add "Manage billing" link in Settings → opens Stripe Customer Portal
- [ ] Test: signup → trial starts → dashboard accessible → cancel → dashboard locked

### 2c. Landing Page (Day 7) — DONE

Built as `src/app/page.tsx` → `src/views/LandingPage.tsx`, with
`src/components/marketing/`: Navbar, HeroSection, HowItWorks, Dimensions, Pricing,
Manifesto, Footer, DashboardPreview.

- [x] Public route at `/`, no auth required
- [x] `/` shows the landing page for logged-out visitors
- [x] Hero
- [x] "How it works" section
- [x] Feature list (Dimensions: the six scoring categories)
- [x] Pricing section (price still a placeholder, see 2b)
- [x] CTA button → signup page
- [x] Footer with links
- [ ] Social proof section (waiting on Phase 1 case studies)

### 2d. Email Setup (Day 8) — HALF DONE

`src/services/email.ts` sends via Resend and the contact form uses it.
`src/emails/WeeklyDigest.tsx` is built but nothing calls it.

- [x] Resend wired up (`sendEmail` in `src/services/email.ts`)
- [x] WeeklyDigest template built
- [ ] Set up scoutly.io domain in Resend (DNS records for SPF/DKIM)
- [ ] Update `RESEND_FROM_EMAIL` to `hello@scoutly.io` or `noreply@scoutly.io` (and `SUPPORT_EMAIL`)
- [ ] Create Inngest cron function: runs every Monday 8am UTC, register it in `src/app/api/inngest/route.ts`
- [ ] For each active project: fetch latest scores, top action, competitor delta
- [ ] Send WeeklyDigest email via Resend
- [ ] Add unsubscribe link (legal requirement)
- [ ] Send a test email to yourself and verify it renders correctly

### 2e. Branding Cleanup (Day 9) — NEARLY DONE

89 `RivalRadar` references remain, but only three are user-visible.

- [x] Public copy, layout, robots and sitemap say Scoutly
- [ ] `src/app/unlock/page.tsx:31` — h1 still reads "RivalRadar"
- [ ] `src/emails/WeeklyDigest.tsx:130` and `:203` — header title and footer
- [ ] Inngest app id is `rival-radar` in `src/inngest/client.ts` (renaming it changes the Inngest app identity, so do it before production traffic or not at all)
- [ ] Optional, internal only: `useRivalRadarStore` / `@/store/rivalradar`, the `rival-radar-site-unlock` HMAC salt (changing the salt invalidates existing unlock cookies)
- [ ] Verify no "RivalRadar" appears anywhere in the UI

### 2f. Trust & Polish (Day 10) — MOSTLY DONE

- [x] "Last scanned" timestamp on dashboard
- [x] "Re-scan now" button, plus per-business rescan (`rescanAll` / `triggerSingleScan`)
- [x] Scan status per competitor
- [x] Empty state for new users waiting for first scan
- [ ] Test full flow on production: signup → add business → scan → dashboard → email (blocked on 2a)

---

## Phase 3: Monitoring & Pre-launch (Days 11-12) — NOT STARTED

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

## Phase 4: Beta Launch (Days 13-15) — NOT STARTED

### 4a. Seed Users

- [ ] Reach out to the 5 businesses you tested — offer 3 months free
- [ ] Prepare a cold outreach message with a screenshot of their score
- [ ] Cold email 20 local businesses with personalised screenshots
- [ ] Post in 2-3 local business Facebook groups or forums
- [ ] Offer founders rate (locked in) for first 10 paying users

### 4b. Go Live

- [ ] Remove any site password lock (`SITE_PASSWORD` env var, still active)
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
- [ ] Decide: settle the final price, or add tiers?

---

## Critical Path

The three things standing between here and taking money:

1. **Merge to main** (Phase 0), because nothing deploys from `main` as it stands
2. **Validate 5 businesses** (Phase 1), the gate on whether the advice is sellable
3. **Deploy, then Stripe** (2a, 2b)

Cheapest win available right now: the weekly email (2d). The template and the sender
both exist, it needs a cron function and an unsubscribe link.

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
