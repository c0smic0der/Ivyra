@AGENTS.md
# Caliber
A web app (installable PWA) to log real-life predictions with a probability +
resolution date, resolve them when the date arrives, and score calibration over
time. Core principle: **the LLM narrates, deterministic code grades.** AI works
only on the user's own data (semantic track-record matching, reasoning-vs-outcome
post-mortems, monthly pattern insights). The AI NEVER computes a score.

## Stack
Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres + Auth + RLS +
pgvector) · Drizzle ORM · Anthropic API (Haiku 4.5, structured output; streamed
where user-facing) · Vercel (+ Cron) · Resend · Recharts

## Data-flow idiom (deliberate, current App Router style)
- Server Components for reads (dashboard, insights) via Drizzle directly
- Server Actions for mutations (create prediction, resolve)
- Route handlers ONLY for cron/webhooks and the streaming post-mortem endpoint

## Key directories
- src/app/           routes (UI + route handlers)
- src/lib/scoring/   pure scoring functions (Brier, buckets, ECE, rolling) — FULLY TESTED
- src/lib/ai/        Anthropic calls, JSON schemas, validate-and-repair
- src/db/            Drizzle schema + migrations

## Release phasing (do not build ahead)
- v1: Brier layer only (per-prediction, running, rolling + progress chart),
  calibration curve with sample-size lock, track-record panel, post-mortem
- v2: Murphy decomposition (decompose(), identity test, Boldness), Wilson
  intervals, monthly AI insight w/ hedger-vs-miscalibrated profile

## Rules
- Scoring is deterministic and unit-tested. NEVER route scoring through the LLM.
- Every LLM call uses structured output and is logged to the ai_calls table
  (tokens, cost, latency). Per-user daily cap enforced in code.
- The post-mortem is a diff engine, not a therapist: every claim must anchor to
  text the user wrote. No motive speculation.
- Resolution criteria and reasoning FREEZE at creation. Never editable after.
- When two code paths must agree on a value or threshold, one MUST derive from
  the other — never rely on separate constants/formulas happening to be equal.
  (Hit three times: `resolvedNonVoid` vs an inline gate; `PROFILE_UNLOCK_N` vs
  `CATEGORY_UNLOCK_N`; `boldness()` vs `profileBoldness` — now one `boldnessRatio`
  with two gating policies.)
- Privacy: RLS on all user tables; prediction content never in URLs or logs;
  API keys server-side only.
- Write tests for scoring logic and server actions. Run `npm test` before
  declaring any task done. Show evidence (test output), don't claim success.