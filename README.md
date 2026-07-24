# Aftercast

**Find out if your gut is actually right.** Aftercast is an installable web app (PWA) for logging real-life predictions with a confidence percentage and a resolution date, resolving them when the date arrives, and scoring your calibration over time with proper, deterministic math — while AI works only on _your own_ accumulating data to surface your track record, diff your frozen reasoning against outcomes, and narrate the patterns.

---

## The wedge

The space splits cleanly, and the middle is unclaimed:

- **Fatebook** keeps a rigorous Brier score but captures **no reasoning** — it's manual, rationalist-coded, pre-AI.
- **Decision Log / Decira / DecideIQ** capture reasoning and coach the decision but keep **no real score** — nothing measures whether your judgment is any good.

**Aftercast is the combination neither side ships: a decision journal with an un-fakeable measurement core** — reasoning capture + proper scoring + AI post-mortems.

> _"Decision Log helps you make a decision; Aftercast measures whether your judgment is any good — and shows you exactly where it fails."_

---

## Three design principles

1. **Static UI for what users can do themselves; AI only for what they can't.** You can write a precise prediction after seeing two examples, so capture guidance is static templates and placeholders — **not** an AI rewriter. What you _can't_ do is semantically search your own memory of 40 past predictions or spot patterns in how you reason — that's where AI goes.
2. **Freeze everything pre-outcome.** Resolution criteria and reasoning lock at creation. This defeats hindsight bias twice: the score can't be fudged (criteria frozen) and the post-mortem can't be contaminated (reasoning frozen).
3. **The AI is a diff engine, not a therapist.** Every analytical claim it makes must trace to something you wrote. No speculation about motives, no invented causes.

---

## Architecture: the LLM narrates, deterministic code grades

Every number that judges you — Brier score, calibration curve, bias score, hit rates — is exact math the AI **never touches**. The AI works only on your own corpus: semantic matching against your history, diffing your pre-outcome reasoning against outcomes, and (v2) clustering your reasoning styles. That split is the whole point.

```
Scoring (src/lib/scoring/)        AI (src/lib/ai/)
  pure, fully unit-tested           structured output, logged, capped
  Brier · rolling · bias            enrich · track-record · post-mortem
  calibration buckets · ECE         never computes a score
```

**Observability & cost control (`ai_calls` table).** Every Anthropic call is logged with `purpose`, `model`, input/output tokens, `cost_usd`, and latency. On top of that table:

- a **per-user daily cap** enforced in code (`isUnderDailyCap`), reserved _before_ streamed calls to close the TOCTOU window;
- **JSON validate-and-repair** (one retry) on structured outputs;
- prompt caching on static system prompts;
- an owner-only **cost dashboard at `/admin/costs`** (gated by `ADMIN_USER_ID`) showing calls, tokens, and cost by day and by purpose.

A heavy user costs **cents per month**.

**Graceful degradation.** AI failures never take down the core loop: capture-time enrichment runs post-response and, if the model or embedding provider fails, leaves the row fully usable with null fields; the resolution post-mortem streams token-by-token but the deterministic score renders _first_ and independently — a mid-stream API failure just shows a fallback line. These degradation paths are unit-tested by injecting throwing dependencies (see `enrichCore.test.ts`, `postmortemCore.test.ts`).

---

## Stack & data-flow idioms

| Layer | Choice |
|---|---|
| Framework | **Next.js (App Router, TypeScript)** — Server Components for reads, Server Actions for mutations |
| Styling | **Tailwind CSS** |
| DB / Auth / Vectors | **Supabase** — Postgres + Auth + RLS + **pgvector** |
| ORM | **Drizzle** |
| LLM | **Anthropic API — Haiku 4.5**, structured output, streamed where user-facing |
| Email | **Resend** (daily reminder cron) |
| Charts | **Recharts** |
| Deploy | **Vercel** (Hobby) + Vercel Cron |

The data-flow idioms are deliberate:

- **Reads** (dashboard, insights, `/admin/costs`) are **Server Components** hitting Drizzle directly.
- **Mutations** (create prediction, resolve) are **Server Actions**, each returning a friendly discriminated-union result — never leaking a stack trace to the user.
- **Route handlers are the exception, reserved for webhooks/cron** (the secret-guarded reminders endpoint) **and streaming** (the post-mortem streams token-by-token — the score appears instantly, the narrative flows in).
- App-wide `error.tsx` / `global-error.tsx` / `not-found.tsx` boundaries render friendly fallbacks for any uncaught error.

---

## Deliberately rejected AI features (and why)

Rejecting AI features with an argument is a rarer signal than adding them:

- **AI question-rewriting at capture** — you can word your own prediction; a rewriter risks misinterpreting and launders the AI's guess into _your_ prediction.
- **AI interrogation / linting at capture** — training-wheels value only; two static examples teach the same lesson without friction or misfire risk.
- **AI-drafted resolution notes / forced reflection fields** — junk-text generators with no signal.

The AI belongs on your _accumulated data_, where you're genuinely blind — not in the writing path, where you aren't.

---

## What's cut to v2 (and why)

v1 ships the **Brier layer** — per-prediction, running, and rolling/time-weighted Brier, the bias score with directional sentences, the calibration curve with a sample-size lock, the track-record panel, and the streamed post-mortem. v2 ships the **diagnostic layer**:

- **Murphy's decomposition** — the Boldness gauge (resolution ÷ uncertainty, catching the honest-but-timid 50%-hugger the curve congratulates) and the code-assigned hedger-vs-miscalibrated profile.
- **Wilson score intervals** — per-dot error bars on the curve ("bar crosses the diagonal = too early to call").
- **Monthly AI insight** — narrating patterns across your scores _and_ reasoning styles (v1 ships a templated summary).

Every v2 statistic is a _refinement of_ a v1 output (Murphy decomposes the Brier over the same buckets; Wilson annotates the curve's dots), so they layer on with zero rework — and they're the sample-hungry stats, so by the time real users have accumulated enough resolutions for them to be honest, v2 is ready.

---

## Privacy

Predictions about your job, relationships, and money are sensitive, and honesty depends on privacy:

- **Row-level security** on all user tables; similarity search is filtered by `user_id` at the query level.
- Prediction content never appears in URLs, query strings, or logs (error logs record an error _class name_ only).
- The Anthropic and service-role keys are server-side only.
- Private by default; no social features.

---

## Local setup

**Prerequisites:** Node 20+, a Supabase project (with `pgvector` enabled), and Anthropic + Resend API keys.

**1. Environment.** Create `.env.local`:

```bash
DATABASE_URL=                 # Supabase Postgres pooler (port 6543)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only — never prefix NEXT_PUBLIC_
ANTHROPIC_API_KEY=
RESEND_API_KEY=
CRON_SECRET=                  # guards the reminders cron route
SITE_URL=                     # e.g. https://aftercast.app (used in reminder emails)
ADMIN_USER_ID=                # your Supabase user id — the only account that can see /admin/costs
```

Auth is **magic-link only** — there is no password login. All accounts, including the seeded testing account, sign in via a magic link sent to their email.

**2. Install, migrate, seed, run:**

```bash
npm install
npm run db:migrate     # apply Drizzle migrations
npm run seed           # populate the testing account (idempotent — re-run to reset)
npm run dev            # http://localhost:3000
```

`npm run seed` populates a **private** testing/screenshot account, `demouser4132@gmail.com`, with ~40 predictions (a deliberately overconfident history, so the calibration curve, bias score, progress chart, and a post-mortem all render). It's a normal account — sign in via magic link like any other, subject to the same per-user daily AI cap, with **no** admin access. It's for local testing and demo screenshots, not public access. Re-running the seed wipes and rebuilds its predictions, so it's safe to reset any time.

**3. Tests** (scoring engine, server-action result shapes, AI-degradation paths, cost aggregation):

```bash
npm test
```
