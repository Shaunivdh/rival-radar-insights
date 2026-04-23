# AI Test Scripts

## Setup

```bash
bun add -d dotenv
```

## Commands

```bash
# Run all tests (priority actions + change summary + AI visibility)
bunx tsx scripts/test-ai.ts

# Run individually
bunx tsx scripts/test-ai.ts actions       # Week 1 & Week 2 priority actions
bunx tsx scripts/test-ai.ts changes       # Change summary (week1 → week2 diff)
bunx tsx scripts/test-ai.ts visibility    # AI visibility check (live API calls)
```

## Fixtures

- `fixtures/week1.json` — First scan data (Evolve IT vs 4 competitors)
- `fixtures/week2.json` — Simulated week 2 after following advice

### What changed in week 2

| Improvement | Before | After |
|---|---|---|
| Google reviews | 38 | 45 |
| Booking system | none | Calendly |
| Accreditations | Cyber Essentials, ICO | + ISO 27001 |
| Service areas | Bristol only | Bristol, Bath, South West, Somerset |
| Social links | FB, Twitter, LinkedIn | + Instagram |
| Guarantees | none | 30 day satisfaction guarantee |
| Overall score | 53 | 61 |

### Iterating on prompts

1. Run `bunx tsx scripts/test-ai.ts actions`
2. Review the advice — is it specific? Does it reference competitors?
3. Edit the prompt in `src/services/ai.ts` → `generatePriorityActions()`
4. Run again with same fixtures → compare output
5. Check week 2 stops repeating solved items from week 1

### Editing fixtures

Edit `fixtures/week2.json` directly to simulate different improvements. Key fields to tweak:

- `ownBusiness.googleData.reviewCount` — review growth
- `ownBusiness.signals.trust.accreditations` — added certs
- `ownBusiness.signals.engagement` — booking system, CTAs
- `ownBusiness.signals.content` — FAQ, portfolio, service areas
- `ownBusiness.aiScore` — updated scores to reflect changes
