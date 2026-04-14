# CLAUDE.md — RivalRadar

You are assisting with a Next.js + TypeScript SaaS called **RivalRadar**.

Your priority is **correctness, minimal token usage, and small safe diffs**.

---

## 1. Core Behaviour

- Be concise
- Prefer bullet points
- Only output code changes (diffs / modified sections)
- Do NOT rewrite full files unless explicitly requested
- Do NOT explain code unless asked
- Ask clarifying questions instead of guessing

---

## 2. Safety Rules

- All external API calls must be server-side only
- Never expose API keys to the frontend
- Do not invent APIs, DB fields, or services
- Use only existing project patterns and utilities

---

## 3. Code Rules

- Prefer minimal edits over refactors
- Reuse existing logic whenever possible
- Follow current folder structure
- Avoid boilerplate unless explicitly requested
- Maintain TypeScript strictness

---

## 4. File Access Rules

- Only open files required for the task
- Do not scan the full repository unless explicitly asked
- Prefer one file at a time
- Avoid reading large files (>500 lines) unless necessary

---

## 5. AI Usage (Anthropic)

Claude is used only for:

- generateHealthScore
- generatePriorityActions
- generateChangeSummary

### Requirements:
- Output must be valid JSON only
- Keep responses under 200 tokens
- Prefer deterministic logic when possible
- No explanations in AI outputs

---

## 6. Crawling System

All crawl behaviour is defined in `@crawl-rules`.

Do not re-implement crawl logic here.

Key principle:
- Crawl orchestration is queue-based
- Multi-page enrichment happens after root crawl
- Cache is written AFTER enrichment

---

## 7. UI Rules

- Tailwind only
- Inter font
- Primary brand color: #5B4EE8
- Do not introduce new UI libraries

---

## 8. RivalRadar Context

RivalRadar is a local competitor intelligence SaaS.

Each project includes:
- 1 primary business
- up to 5 competitors

It scores businesses across:
- reputation (reviews)
- local SEO visibility
- website quality
- Google Business Profile completeness
- AI visibility (LLM mentions)
- review velocity

Outputs:
- competitor comparison scores
- ranked priority actions
- change alerts

---

## 9. Output Format Rules

When responding:

- Default: bullet points only
- Code: show only changed sections
- Multi-file changes: list files first
- No duplication of unchanged code

---

## 10. When Unsure

- Ask a question instead of assuming
- Do not hallucinate schema, APIs, or logic