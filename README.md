# Ivyra

**A decision journal that scores your expectations against real outcomes.** Log a decision with a success criterion, a confidence percentage, and a resolution date; when the date arrives, resolve it, and deterministic math scores how closely your stated confidence tracks how often things actually happen. AI works only on _your own_ accumulating data — surfacing your track record at capture, diffing your frozen reasoning against outcomes, and narrating the patterns.

**Live:** [ivyra.app](https://ivyra.app) · installable PWA.

![Ivyra — a resolved-decision timeline showing stated confidence against how often those calls came true](docs/assets/timeline.png)

---

## Architecture: the LLM narrates, deterministic code grades

**Every number is computed by a deterministic, fully unit-tested scoring engine (`src/lib/scoring/`) — the LLM never computes a score.** Brier scores, the calibration curve, the bias score, rolling trends, and Murphy's decomposition are exact math with a full test suite. The AI (`src/lib/ai/`) works only on your own corpus: it matches new predictions against your resolved history, diffs your frozen pre-outcome reasoning against what happened, and narrates the patterns — always in words, never as a figure.

The split is deliberate: a score you can't trust is worse than no score, so putting the math in deterministic, tested code makes every number reproducible and auditable. Keeping the LLM to narration over text you wrote means it cannot invent or inflate a figure — every claim it makes traces back to your own words.

```
Scoring (src/lib/scoring/)        AI (src/lib/ai/)
  pure, fully unit-tested           structured output, logged, capped
  Brier · rolling · bias            enrich · track-record · post-mortem
  calibration buckets · ECE         never computes a score
```

Every Anthropic call is logged to an `ai_calls` table (purpose, model, tokens, cost, latency) behind a per-user daily cap enforced in code, with an owner-only cost dashboard at `/admin/costs`. AI failures never take down the core loop: the deterministic score always renders first and independently.

---

## Stack

- **Framework** — Next.js (App Router, TypeScript): Server Components for reads, Server Actions for mutations, route handlers only for cron/webhooks and the streaming post-mortem.
- **Styling** — Tailwind CSS.
- **DB / Auth / Vectors** — Supabase (Postgres + Auth + RLS + pgvector).
- **ORM** — Drizzle.
- **LLM** — Anthropic API (Haiku 4.5, structured output, streamed where user-facing); OpenAI embeddings for track-record similarity.
- **Email** — Resend (daily reminder cron).
- **Charts** — Recharts. **Deploy** — Vercel + Vercel Cron.

---

## How it's built

- **Docs.** The full specification, domain primer, and build log live in [`docs/`](docs/) — start with [`02-application-rundown.md`](docs/02-application-rundown.md).
- **Test-first.** The scoring engine was written against its unit tests before any UI; server-action result shapes, AI-degradation paths, and cost aggregation are covered too. Run the suite (Vitest) with `npm test`.

---

## Local setup

**Prerequisites:** Node 20+, a Supabase project (with `pgvector` enabled), and Anthropic, OpenAI, and Resend accounts.

**1. Environment.** Create `.env.local` and set each variable (names only — supply your own values):

```bash
DATABASE_URL=                 # Supabase Postgres pooler connection string
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only — never prefix NEXT_PUBLIC_
ANTHROPIC_API_KEY=            # narration (post-mortems, insights)
OPENAI_API_KEY=               # embeddings for track-record similarity
RESEND_API_KEY=               # reminder emails
CRON_SECRET=                  # guards the reminders cron route
SITE_URL=                     # absolute base URL used in reminder emails
ADMIN_USER_ID=                # the only account that can see /admin/costs
DEMO_LOGIN_PASSWORD=          # optional — dev-only login for the seeded demo account
```

**2. Install, migrate, seed, run:**

```bash
npm install
npm run db:migrate     # apply Drizzle migrations
npm run seed           # populate the demo account (idempotent — re-run to reset)
npm run dev            # http://localhost:3000
```

Auth is **magic-link only** — there is no password login for real accounts.

**The seeded demo.** `npm run seed` populates a private testing/screenshot account, `demo@ivyra.app`, with ~40 predictions (a deliberately overconfident history, so the calibration curve, bias score, progress chart, and a post-mortem all render). It's a normal account — subject to the same per-user daily AI cap, with **no** admin access. Because `demo@ivyra.app` has no inbox, sign in locally through the **development-only password form** (the seed prints the credentials). It's for local testing and demo screenshots, not public access; re-running the seed wipes and rebuilds its predictions, so it's safe to reset any time.

**3. Tests:**

```bash
npm test
```

---

## License

MIT — see [LICENSE](LICENSE).
