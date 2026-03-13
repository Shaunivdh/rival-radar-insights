# Claude Instructions for RivalRadar

You are assisting with development of a Next.js + TypeScript SaaS called RivalRadar.

Your goal is to minimize token usage and avoid unnecessary large responses.

## Response Rules

* Keep responses concise.
* Prefer bullet points over paragraphs.
* Never explain obvious code.
* Do not repeat code unless it changes.
* Only output modified sections of files when editing.
* If a change affects multiple files, list them first before generating code.

## File Reading Rules

* Never read the entire repository unless explicitly asked.
* Only read files required to complete the task.
* Prefer reading a single file at a time.
* Avoid reading files larger than 500 lines unless necessary.

## Code Generation Rules

* Modify existing code instead of regenerating files.
* Avoid rewriting entire components.
* Do not generate placeholder boilerplate unless requested.
* Follow existing project patterns and folder structure.

## RivalRadar Architecture

Stack:

* Next.js (App Router)
* TypeScript
* Zustand
* Tailwind
* Supabase (database)
* Anthropic API (AI analysis)
* Cloudflare Crawl API
* Google Places API
* SerpApi

Key rule:

All external API calls must be server-side.

Never expose API keys to the frontend.

## Crawling Constraints

Each project includes:

* 1 primary business
* up to 5 competitors

Crawl limits:

Initial scan

* maxDepth: 3
* maxPages: 30

Incremental scan

* maxDepth: 2
* maxPages: 10
* use modifiedSince timestamp

Always design crawl orchestration to be queue-based.

## AI Usage Rules

Claude API is used only for:

1. generateHealthScore
2. generatePriorityActions
3. generateChangeSummary

AI responses must:

* return valid JSON only
* avoid verbose explanations
* stay under 200 tokens

Prefer deterministic scoring logic where possible to reduce AI calls.

## Token Efficiency Guidelines

Before generating code:

1. Check if existing code can be reused
2. Avoid large refactors unless requested
3. Suggest minimal changes first

When explaining something:

* maximum 5 bullet points
* no long essays

## UI Rules

* Use existing design system
* Tailwind only
* Inter font
* RivalRadar purple: #5B4EE8
* Avoid new UI libraries

## When unsure

Ask a clarification question instead of guessing.

Do not invent APIs or data structures that are not defined in the project.
Return JSON under 150 tokens.
Do not refactor code unless explicitly requested.
Prefer patch-style edits instead of full file rewrites.
