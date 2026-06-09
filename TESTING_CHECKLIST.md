# Scoutly — Business Testing Checklist

## How to Pick Your 5 Test Businesses

Choose businesses where you can **manually verify** the results. Ideal mix:

| # | Type | Why |
|---|------|-----|
| 1 | A business you personally use (your dentist, barber, local cafe) | You know their quality first-hand |
| 2 | A business with a strong online presence | Tests that Scoutly recognises good signals |
| 3 | A business with a weak online presence | Tests that Scoutly catches real problems |
| 4 | A trade business (plumber, electrician, builder) | Tests sector-specific signals (Gas Safe, TrustMark, etc.) |
| 5 | A service business (clinic, salon, accountant) | Tests different signal patterns |

**For each business, also add 2-3 of their real local competitors.**

---

## Per-Business Testing Sheet

Copy this for each of the 5 businesses.

### Business Details
- **Business name:**
- **Website URL:**
- **Google Maps listing:**
- **Category:**
- **Competitors added:**

---

### A. Crawl & Data Quality

- [ ] Scan completed successfully (no errors)
- [ ] Website title extracted correctly
- [ ] H1 tag detected (or correctly flagged as missing)
- [ ] Phone number found (check against real number)
- [ ] Address found (check against real address)
- [ ] Services/offerings detected
- [ ] Schema markup detected (if present)
- [ ] SSL/HTTPS detected correctly
- [ ] Mobile responsiveness flagged correctly
- [ ] Page count matches reality (do they have a blog? About page? Services page?)

**Manual check:** Open the actual website. Does Scoutly's data match what you see?

- [ ] YES — data matches reality
- [ ] NO — document what's wrong:

---

### B. Score Accuracy

For each score, compare Scoutly's rating against your manual assessment:

#### Website Quality Score
- [ ] Scoutly score: ___/100
- [ ] Manual assessment: Does this feel right? (open the site yourself)
- [ ] Any signals Scoutly missed?
- [ ] Any signals Scoutly got wrong?

#### Reputation Score (Reviews)
- [ ] Scoutly score: ___/100
- [ ] Actual Google rating: ___★ (___reviews)
- [ ] Does review count match Google Maps?
- [ ] Review sentiment analysis — does it match real reviews?

#### Local SEO Score
- [ ] Scoutly score: ___/100
- [ ] Google the business name — do they appear?
- [ ] Google "[service] near [location]" — do they rank?
- [ ] NAP consistency (name, address, phone) — is Scoutly checking this?

#### GBP Completeness Score
- [ ] Scoutly score: ___/100
- [ ] Check their actual GBP listing on Google Maps
- [ ] Hours listed? Photos? Description? Categories?
- [ ] Does Scoutly's assessment match what you see?

#### AI Visibility Score
- [ ] Scoutly score: ___/100
- [ ] Ask ChatGPT/Claude: "Who is the best [category] in [location]?"
- [ ] Does the business get mentioned?
- [ ] Does Scoutly's score reflect this accurately?

---

### C. Action Recommendations

Scoutly generates up to 5 priority actions. Review each:

#### Action 1
- **What Scoutly says:**
- [ ] Is this accurate? (the problem actually exists)
- [ ] Is this actionable? (a business owner could do this)
- [ ] Is the priority correct? (is this really the most important thing?)
- [ ] Is the effort estimate correct? (low/medium/high)

#### Action 2
- **What Scoutly says:**
- [ ] Accurate?
- [ ] Actionable?
- [ ] Priority correct?
- [ ] Effort correct?

#### Action 3
- **What Scoutly says:**
- [ ] Accurate?
- [ ] Actionable?
- [ ] Priority correct?
- [ ] Effort correct?

#### Action 4
- **What Scoutly says:**
- [ ] Accurate?
- [ ] Actionable?
- [ ] Priority correct?
- [ ] Effort correct?

#### Action 5
- **What Scoutly says:**
- [ ] Accurate?
- [ ] Actionable?
- [ ] Priority correct?
- [ ] Effort correct?

**Common failures to watch for:**
- [ ] Recommending something they already have (e.g., "add a phone number" when it's clearly on the site)
- [ ] Recommending something impossible (e.g., "improve your CQC rating" for a non-healthcare business)
- [ ] Generic advice that applies to everyone (e.g., "post more on social media")
- [ ] Contradicting the scores (e.g., "your reviews are strong" but score is 30/100)
- [ ] Referencing a competitor that doesn't exist in the data

---

### D. Competitor Comparison

- [ ] Competitor scores look reasonable relative to each other
- [ ] The "stronger" competitor actually has a better online presence (verify manually)
- [ ] Strengths/weaknesses make sense
- [ ] No competitor data is missing or obviously wrong

---

### E. Change Detection (if re-scanning)

Wait 3+ days, then re-scan:
- [ ] Changes detected are real (something actually changed)
- [ ] No false change alerts
- [ ] Score trends move in the right direction

---

## Results Summary

After testing all 5 businesses, fill this in:

| Business | Crawl OK? | Scores Accurate? | Actions Accurate? | Competitors OK? | Usable as case study? |
|----------|-----------|-------------------|--------------------|-----------------|-----------------------|
| 1.       |           |                   |                    |                 |                       |
| 2.       |           |                   |                    |                 |                       |
| 3.       |           |                   |                    |                 |                       |
| 4.       |           |                   |                    |                 |                       |
| 5.       |           |                   |                    |                 |                       |

### Patterns Found
- **Recurring false positives:**
- **Recurring false negatives:**
- **Signals that need fixing:**
- **Actions that need rewording:**

### Fixes Needed Before Beta
1.
2.
3.

### Best Case Study Candidates
1.
2.

---

## Tips

- **Screenshot everything** — before you fix issues, capture the current output for comparison
- **Test on mobile** — your beta users will check Scoutly on their phones
- **Time the full flow** — from signup to seeing results, how long does it take?
- **Try to break it** — enter a URL with a redirect, a site behind Cloudflare, a business with no reviews
- **Note your own confusion** — if you're confused by the UI, your users will be too
