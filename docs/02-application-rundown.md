# Marne — Full Application Rundown (v2, definitive)

*Top-to-bottom specification: what it is, who it's for, every screen and flow, the data model, the architecture, the AI and scoring subsystems, the stack, the real cost to build and run, the workload, and the roadblocks. Written to be handed to an engineer (you) as the blueprint for a ~2-week solo build.*

*v2 reflects the settled design decisions: no AI question-rewriting or interrogation at capture (static examples teach precision instead); AI is applied exclusively to the user's accumulating data — track-record surfacing, resolution post-mortems, and reasoning-type analytics; structured reasoning capture at prediction time; PWA-first delivery.*

---

## 1. Product in one page

**What it is:** a web app (installable PWA) where you log a real-life prediction in your own words, attach a confidence percentage and a resolution date, and briefly note *why* you believe it. When the date arrives the app nudges you, you record what happened, and deterministic math scores you (Brier score, calibration curve) — revealing over time whether your confidence is trustworthy. AI surfaces your own track record at the moment of prediction, writes a post-mortem diffing your frozen reasoning against reality at resolution, and extracts monthly patterns across both your scores and your reasoning styles.

**The wedge (from the competitive analysis):** Fatebook keeps rigorous score but captures no reasoning and is manual, rationalist-coded, pre-AI. Decision Log / Decira / DecideIQ capture reasoning and coach decisions but keep no real score. **Marne is the unclaimed combination: a decision journal with an un-fakeable measurement core — reasoning capture + proper scoring + AI post-mortems.**

**The identity, in one sentence:** *"Decision Log helps you make a decision; Marne measures whether your judgment is any good — and shows you exactly where it fails."*

**The engineering thesis you're demonstrating:** **the LLM narrates, deterministic code grades.** Every number that judges the user (Brier, curve, hit rates) is exact math the AI never touches. The AI works only on the user's own accumulating corpus: semantic matching against their history, diffing their pre-outcome reasoning against outcomes, and clustering their reasoning styles. Guardrailed, cost-capped, compounding. That split is the whole point and your best interview story.

**The three design principles (settled through iteration — know these for interviews):**
1. **Static UI for what users can do themselves; AI only for what they can't.** Users can write precise predictions after seeing two examples — so capture guidance is static templates/placeholders, not an AI rewriter (a rewriter can misinterpret and launders the AI's guess into the user's prediction). What users *can't* do is semantically search their own memory of 40 past predictions or spot patterns in their reasoning styles — that's where AI goes.
2. **Freeze everything pre-outcome.** Resolution criteria and reasoning are locked at creation. This defeats hindsight bias twice: the score can't be fudged (criteria frozen) and the post-mortem can't be contaminated (reasoning frozen).
3. **The AI is a diff engine, not a therapist.** Every analytical claim it makes must trace to something the user wrote. No speculation about motives, no invented causes.

---

## 2. Target users & personas

Medium-sized, high-quality audience (forecasting-curious, not mass-market — fine for a portfolio):

- **"The self-improver" (primary).** Reads about decision-making and cognitive bias; wants to *actually* get better, not just read. Will log life and work predictions. Needs the friendly framing and early rewards.
- **"The operator."** PM, founder, or investor who makes lots of judgment calls professionally and suspects they're overconfident. Values the track record, the post-mortems, and the work/personal breakdown.
- **"The rationalist-adjacent."** Might already know Fatebook; will be won by the reasoning layer (which Fatebook lacks entirely), the personal track-record surfacing, and the life-decision framing.

Design for the primary persona; the other two come along for free.

---

## 3. User stories (prioritized)

Format: *As a [user], I want [capability], so that [benefit].* Priority: **[M]** must-have MVP, **[S]** should-have, **[C]** could-have-later.

**Epic A — Capture a prediction**
- **[M]** …quickly write a prediction in my own words, so logging is frictionless. (Static placeholder examples and 2–3 guideline predictions on the capture screen teach precision — no AI in the writing path.)
- **[M]** …set my confidence as a percentage and a resolution date, so it can be scored.
- **[M]** …optionally note *why* I believe this (1–2 sentences) and, depending on prediction type, *what my plan is* (self-predictions) or *what would change my mind* (world-predictions), so my pre-outcome reasoning is frozen for later learning. Optional, never gating.
- **[M]** …see my own track record on similar past predictions at the moment I set confidence ("6 similar deadline predictions: avg confidence 82%, hit rate 33%"), so I can correct before repeating a known error. (Appears only once enough history exists.)
- **[M]** …have my prediction auto-categorized (work, health, relationships, money, self), so breakdowns populate without me maintaining tags.
- **[S]** …see a generic base rate for common prediction types from a static lookup (deadlines, habits, hiring), so new users get an outside view before they have history.
- **[C]** …get an LLM-proposed reference class for unusual predictions where the comparable class isn't obvious.

**Epic B — Resolve**
- **[M]** …get reminded when a prediction's date arrives, so I don't forget to resolve it.
- **[M]** …mark a prediction YES / NO / Void (ambiguous), with an optional one-line note on what actually happened, so it can be scored and analyzed.
- **[M]** …see my Brier for that prediction and my updated running score immediately, so resolution feels rewarding.
- **[S]** …read an AI post-mortem that diffs my frozen reasoning against the outcome ("your stated reason never mentioned the dependency that caused the miss — third time a deadline miss came from outside your team"), so I learn *why* I was wrong, not just that I was. (Renders only if I wrote reasoning; degrades gracefully to score-only.)
- **[C]** …let the app propose resolutions for publicly-verifiable predictions (web-check + one-tap confirm), so I do less manual work. (v2)

**Epic C — Learn**
- **[M]** …see my running Brier score and how it compares to the 0.25 baseline, so I get immediate feedback.
- **[M]** …see my calibration curve once I have enough resolved predictions (with an "N more to unlock" state before), so I can see where I'm over/under-confident.
- **[S]** …see calibration broken down by category, so I learn *which* judgments to trust.
- **[S]** …read a monthly AI insight that finds patterns across my scores AND my reasoning styles ("predictions justified by concrete past evidence hit 72%; ones justified by optimism about your own discipline hit 31%"), so the coaching targets how I think, not just what I predict about.
- **[C]** …see streaks / counts, so I stay motivated early.

**Epic D — Account**
- **[M]** …sign in securely and have my predictions be private, so I'll be honest in them.
- **[C]** …export my data, so I own it.

---

## 4. UI flow (screen by screen)

```
Landing → Sign up/in → Onboarding (2 screens) → Dashboard
   Dashboard ──"New prediction"──▶ Capture flow ──▶ back to Dashboard
   Dashboard ──"Resolve" (or email link)──▶ Resolve flow (+post-mortem) ──▶ updated stats
   Dashboard ──"Insights"──▶ Calibration curve + breakdowns + monthly insight
```

**1. Landing page.** One-liner (*"Find out if your gut is actually right"*), a 15-second explainer of the loop, a sample calibration curve, one CTA. Also your recruiter-facing shopfront.

**2. Auth.** Email magic-link or Google OAuth via hosted provider. No password UI to build.

**3. Onboarding (2 short screens).** (a) The idea in three sentences + one worked example. (b) "Make your first prediction now" with 2–3 starter templates ("Will I finish ___ by ___?"). Getting a prediction logged in the first 60 seconds is the key activation step.

**4. Dashboard (home).** Top: headline stats — running Brier, baseline comparison, counts resolved/pending. Middle: **"Due for resolution"** list (drives return visits). Below: open predictions with dates, prominent **+ New prediction**.

**5. Capture flow (the core interaction — fast, static, AI only in the background and sidebar).**
- Text box: *"What do you think will happen?"* — with rotating placeholder examples of well-formed predictions ("The kitchen reno finishes by Aug 15", "I go to the gym 12+ times in March"). A collapsible "what makes a good prediction" tip with 2–3 guidelines. **No AI rewriting, no AI interrogation.** (Optional v2: a silent, non-blocking warning if the text contains no date/number at all.)
- **Confidence slider (%)** and **resolution date**.
- **Reasoning fields (optional, 1–2 sentences each):** *"Why do you think so?"* plus — branched deterministically on self-vs-world prediction — *"What's your plan?"* or *"What would change your mind?"* Placeholder examples teach the format.
- **Track-record panel (AI, appears when history suffices):** as the user types, semantic match against their resolved history → *"You've made 6 similar predictions. Avg confidence 82%. Hit rate 33%."* For new users, a static base-rate line for common types instead.
- Save. On save (background, non-blocking): embed prediction+reasoning, auto-categorize, classify reasoning type. Criteria and reasoning **freeze**.

**6. Resolve flow.** From dashboard or email link. Shows the frozen prediction (and their frozen reasoning, collapsed). User taps **YES / NO / Void**, optionally adds one line on what happened. Instantly: that prediction's Brier + updated running score (deterministic, renders before any AI). Then, if reasoning exists: the **AI post-mortem streams in token-by-token** — a short diff of stated reasoning vs. actual outcome, every claim anchored to their own text, including cross-references to past similar misses. (Streaming is deliberate: the score appears instantly, the narrative flows in — and "LLM-streaming UI" is a named 2026 hiring signal.)

**7. Insights.** **v1:** the **Bias score as the headline** ("you run 17 points overconfident" — meaningful from ~10 resolutions, with per-category/per-reasoning-type versions), the **calibration curve** (diagonal reference, under-sampled lock state), the **progress chart** (rolling Brier over time — "last 20: 0.16 vs 0.24 lifetime" — with an honest needs-more-data state), **per-category breakdown**, **reasoning-type breakdown** (calibration by evidence style), and a templated stats summary — every stat accompanied by its deterministic directional sentence. **v2 additions:** **Wilson error bars** on the curve's dots (whiskers that shrink as data accumulates — "bar crosses the diagonal = too early to call" — replacing the blunt per-bucket lock), the **Boldness gauge** (Murphy resolution normalized to 0–1, next to the Brier; catches the honest-but-timid 50%-hugger the curve alone congratulates), and the **monthly AI insight** narrating the patterns and the code-assigned profile (hedger vs. miscalibrated), including windowed Murphy for power users.

---

## 5. Feature scope — the phased cut line

**Math phasing (deliberate development progression):** **v1 ships the Brier layer only** — per-prediction, running, and rolling/time-weighted Brier. **v2 ships the diagnostic layer** — Murphy's decomposition (Boldness gauge, hedger/miscalibrated profile, windowed Murphy) and Wilson error bars. Rationale: v1's math is the complete core loop (score, track record, progress) and every v2 statistic is a *refinement of* v1's outputs — Murphy decomposes the Brier, Wilson annotates the curve — so they layer on cleanly with zero rework; and v2's stats are the sample-hungry ones (per-bucket data), so by the time real users have accumulated enough resolutions for them to be honest, v2 is ready. Phasing also gives the portfolio a visible release cadence rather than one drop.

**In v1 — the 2-week MVP (build exactly this):**
- Auth (hosted provider), PWA installability (manifest + service worker).
- Capture: own-words prediction + static examples/tips, confidence, date, optional reasoning fields, auto-categorization, embedding on save.
- **Track-record surfacing** at capture (semantic similarity vs. own resolved history; static base-rate fallback for new users).
- Pending/open + due-for-resolution lists; email reminders (daily cron).
- Resolve (YES/NO/Void + outcome note) with instant per-prediction Brier + running Brier.
- **AI post-mortem** at resolution (when reasoning exists).
- **Calibration curve** + 0.25-baseline comparison + under-sampled lock state; per-category breakdown.
- **Bias score with directional sentences** ("you run 17 points overconfident") — headline stat next to the Brier, meaningful from ~10 resolutions, so the app has real interpretation during the cold-start weeks before the curve unlocks; every displayed stat carries a deterministic one-line reading.
- **Rolling/time-weighted Brier** + the progress chart (Brier-over-time; renders once enough resolutions exist, with an honest "needs more data" state before).
- A clean landing page. Seeded demo account so the curve and progress chart render for visitors.

**In v2 — the diagnostic release:**
- **Murphy's decomposition:** `decompose()` + the identity test, the **Boldness gauge** (resolution ÷ uncertainty, gated by the curve's sample threshold — resolution is noisier at low N), and the code-assigned **hedger/miscalibrated profile** feeding the monthly AI insight.
- **Windowed Murphy** in the monthly insight ("recent 40 vs. lifetime: boldness up, honesty held"; requires 40–50 resolved in-window — a power-user reward, not a dashboard fixture).
- **Wilson error bars** on the calibration curve (per-dot whiskers replacing the blunt per-bucket lock; "bar crosses the diagonal = too early to call"). Unit tests must include the 3-of-3 non-collapse case.
- Monthly AI insight w/ reasoning-style analysis (v1 ships a simple templated stats summary instead).

**v2+ / later:**
- LLM-proposed reference classes for unusual predictions (static lookup table only in v1).
- Auto-resolution of publicly-verifiable predictions (web-check + confirm).
- Silent ambiguity warning at capture; push notifications; multi-resolution reviews; data export; log-score toggle; natural-language history queries.

**Cut permanently (and why — this is interview material):**
- **AI question-rewriting at capture** — users can word their own predictions; a rewriter risks misinterpreting and laundering the AI's guess into the user's prediction.
- **AI interrogation/linting at capture** — training-wheels value only; static examples teach the same lesson for free without friction or misfire risk.
- **AI-drafted resolution notes; forced reflection fields** — no value / junk-text generators.

---

## 6. Data model

Postgres (Supabase) with **pgvector** enabled. Six tables carry the whole product.

```
users            (largely handled by auth provider)
  id (uuid, pk) · email · created_at

predictions
  id (uuid, pk) · user_id (fk)
  text                 -- the user's own words, verbatim
  reasoning            -- nullable text: "why do you think so"
  plan_or_disconfirm   -- nullable text: plan (self) / what-would-change-my-mind (world)
  prediction_kind      -- 'self' | 'world' (deterministic branch for the second field)
  confidence           -- numeric 0.00–1.00
  resolution_date      -- date
  category             -- AI-assigned: work|health|relationships|money|self
  reasoning_type       -- AI-assigned evidence style: base_rate|specific_evidence|
                       --   trust_in_person|gut_feel|plan_optimism|null
  embedding            -- vector(1536): prediction + reasoning, for similarity search
  status               -- 'open' | 'resolved' | 'void'
  outcome              -- nullable boolean
  outcome_note         -- nullable text: user's one-liner on what happened
  brier_score          -- nullable numeric, computed on resolve
  postmortem           -- nullable text: AI diff, generated at resolve, stored once
  created_at · resolved_at

ai_calls             -- observability + cost guardrail
  id · user_id · prediction_id (nullable)
  purpose   -- 'enrich' | 'postmortem' | 'monthly_insight' | 'reference_class'
  model · input_tokens · output_tokens · cost_usd · latency_ms · created_at

insights             -- monthly batched insights
  id · user_id · period · body_text · stats_json · created_at

base_rates           -- static lookup, no AI
  kind (pk) · rate · description   -- e.g. deadline_hit ~0.35, habit_adherence ~0.4

user_stats           -- optional cache
  user_id (pk) · n_resolved · running_brier · ece · updated_at
```

Design notes: `confidence` + `outcome` alone power all scoring. The frozen `reasoning` + `outcome_note` pair powers the post-mortem. `embedding` powers track-record surfacing (pgvector cosine similarity, filtered to the user's own resolved rows). `reasoning_type` powers the calibration-by-reasoning-style breakdown. `ai_calls` is both the cost cap and the recruiter-facing observability dashboard.

---

## 7. System design / architecture

Deliberately boring, serverless, free-tier. Boring is correct — ships in two weeks, costs ~$0.

```
                    ┌─────────────────────────────┐
   Browser / PWA ──▶│  Next.js app (Vercel)       │
   (React UI,       │  - pages / React components │
   installable)     │  - API routes (server)      │
                    └──────────┬──────────────────┘
                               │
             ┌─────────────────┼──────────────────────┐
             ▼                 ▼                       ▼
   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ Postgres +   │   │ Anthropic API    │   │ Email (Resend)   │
   │ pgvector +   │   │ (Haiku 4.5)      │   │ reminder sends   │
   │ Auth (Supa-  │   │ enrich, post-    │   └──────────────────┘
   │ base): preds,│   │ mortem, monthly  │
   │ embeddings,  │   │ insight          │
   │ scores, logs │   └──────────────────┘
   └──────┬───────┘            ▲
          ▲                    │
          │           ┌────────┴─────────┐
          └───────────│ Vercel Cron      │  daily: reminders due today
                      │ (scheduled route)│  monthly: batched insights
                      └──────────────────┘
```

**Request paths (Server Components for reads, Server Actions for mutations — the current App Router idiom, used deliberately as a hiring signal):**
- *Create prediction* → **Server Action** → write row immediately (capture is never blocked on AI) → background: one Haiku "enrich" call (categorize + reasoning_type) + one embedding call → update row (+ log to `ai_calls`).
- *Track-record panel* → as user types (debounced): embed the draft → pgvector similarity search over the user's own resolved predictions → if ≥3 similar with outcomes, compute avg confidence + hit rate **in SQL/code** → one tiny Haiku call to phrase it (or a pure template — start templated, upgrade if flat). Static base-rate fallback otherwise.
- *Resolve* → **Server Action** → **pure function** computes Brier → update row + stats. Then, if reasoning exists: the post-mortem **streamed token-by-token to the resolve screen** (a route handler streaming the Anthropic response — "LLM-streaming UI" is a named 2026 hiring differentiator); completed text stored in `postmortem`. Inputs: frozen prediction, frozen reasoning, confidence, outcome, outcome_note, plus top-3 similar past misses. **No LLM in scoring, ever.**
- *Insights* → **Server Component** reading via Drizzle directly → calibration buckets computed in code → chart. Monthly cron: one batched Haiku call per active user over their period stats + reasoning-type table → store in `insights`.
- *Reminders* → daily Vercel Cron → route handler (webhooks/cron are the correct exception to Server Actions) → predictions due today → Resend emails. Secret-guarded.

---

## 8. The scoring engine (deterministic — the rigorous core)

Plain, fully unit-tested code. No AI. Small enough to be excellent. **Phased: v1 ships the Brier layer; v2 adds the diagnostic layer (Murphy, Wilson).** Every v2 function consumes v1's outputs (Murphy decomposes the Brier over the same buckets; Wilson annotates the curve's dots), so the module grows without rework.

**v1 functions:**
- **Per-prediction Brier:** `(confidence − outcome)²`, outcome ∈ {0,1}. Voids excluded entirely.
- **Running Brier:** mean over resolved, non-void predictions.
- **Rolling Brier** (`rollingBrier(predictions, window=20)`): mean Brier over the last N resolutions (or exponentially weighted), answering "am I improving?" — the lifetime average is unfair to users who've genuinely gotten better. Feeds the v1 progress chart (Brier-over-time) and gives the insight layer a deterministic improvement fact ("last 20: 0.16 vs 0.24 lifetime").
- **Bias score** (`biasScore(predictions)`: mean stated confidence − actual hit rate, over resolved non-void predictions): the legibility layer the research says separates working feedback regimes from bare scoreboards. "+17 points overconfident" / "−9 points underconfident" is directional and meaningful at ~10 resolutions — unlike the curve (30+) — so it carries the interpretive load during the cold-start weeks. Also computed per category and per reasoning_type (same groupBy as the other breakdowns). **Every stat ships with a directional sentence** (deterministic templates, no AI): e.g., Brier 0.31 → "worse than always guessing 50/50 — your confidence is currently subtracting information."
- **Calibration curve:** bucket by confidence (deciles) → `(bucket_center, mean_confidence, actual_frequency, n)` per bucket; render only buckets with `n ≥ threshold`, else under-sampled state.
- **ECE:** weighted average |mean_confidence − actual_frequency| across buckets.
- **Baselines:** constant 0.25 (always-50%); optional base-rate baseline for a skill score.

**v2 functions:**
- **Murphy decomposition** (`decompose(predictions)` — reuses the v1 buckets, ~15 lines): with `b̄` = overall YES rate, `nₖ/N` = each bucket's share, `conf̄ₖ`/`freqₖ` = each bucket's mean confidence and hit rate:
  - `uncertainty = b̄·(1−b̄)` — difficulty of the user's question mix (the score of a base-rate-only robot).
  - `reliability = Σ (nₖ/N)·(conf̄ₖ − freqₖ)²` — calibration error; the squared dot-to-diagonal gaps of the curve, as one number.
  - `resolution = Σ (nₖ/N)·(freqₖ − b̄)²` — how much the user's confidence levels actually sort outcomes (the anti-hedging counterweight: a 50%-hugger scores ~0 here).
  - **Identity test:** assert `brier ≈ uncertainty − resolution + reliability` (float tolerance) on every fixture — two independent computations cross-checking Brier, bucketing, and decomposition in one assertion.
  - **Boldness (user-facing):** `resolution / uncertainty`, a 0–1 stat; guard the division when `b̄ ∈ {0,1}`. Gated behind the same sample threshold as the curve (resolution is noisier than reliability at low N — same gate, no exceptions).
  - Degenerate-case tests: single-bucket history (resolution = 0 exactly), all-YES (`uncertainty = 0`), N below threshold → null.
- **Windowed Murphy** (`decompose(lastN(predictions, 40))` — composition, not new code): answers *which component* is improving — the diagnostic rolling Brier can't give. Boldness climbing while reliability holds = coaching is working on the right disease; boldness up but reliability worsening = the user got louder, not better. **The most sample-hungry stat in the app** (needs N *per bucket*): practical floor is a 40–50-resolution window — a power-user reward, gated hard and surfaced via the monthly insight, not an always-visible gauge.
- **Wilson score intervals** (`wilsonInterval(hits, n, z=1.96)` — ~5 lines, closed-form, no libraries): per-bucket error bars for the calibration curve, answering "is this dot real or noise?" Bars shrink as n grows; unlike the naive ±wobble formula, Wilson never fake-collapses on extreme small samples (3-of-3 → ~[0.44, 1.00], not [1.00, 1.00]) and never escapes [0, 1]. Chart semantics: bar crosses the diagonal → "too early to call"; whole bar below it → verdict is real. **Unit tests must include the 3-of-3 non-collapse case.**
- **Windowing design principle:** windowing applies to *measurements* (Brier ✓, Murphy ✓), never to *uncertainty quantification* — Wilson is the honesty label on a measurement, not a measurement, and its honesty comes entirely from n; windowing it would discard data to manufacture wider (or falsely narrow) trust claims. Instead, Wilson automatically inherits whatever window the measurement chose: a windowed curve's dots get Wilson bars computed on the windowed counts, honestly wider.
- **ECE:** weighted average |mean_confidence − actual_frequency| across buckets.
- **Baselines:** constant 0.25 (always-50%); optional base-rate baseline for a skill score.
- **Breakdowns:** the same functions grouped by `category` and by `reasoning_type` (the second is the novel analytics axis — calibration by evidence style).

Write these as pure functions with a test suite covering the worked examples from the domain primer (0.9→hit=0.01, 0.9→miss=0.81, 0.5→0.25, voids, empty sets, bucket boundaries). That test file is a portfolio asset in itself.

---

## 9. The AI subsystem (applied only to the user's own data)

Every call uses **structured output** (tool-use / JSON schema), is logged to `ai_calls`, and is subject to a per-user daily cap. Haiku 4.5 everywhere.

**9.1 Capture-time enrichment (MVP — one background call + one embedding).** Input: prediction text + reasoning. Output JSON: `{ category, prediction_kind, reasoning_type }`. Plus an embedding of prediction+reasoning for similarity search. Non-blocking; capture never waits on it.

**9.2 Track-record surfacing (MVP — the killer feature).** Semantic match (pgvector) against the user's *own resolved history*; the hit-rate and average-confidence numbers are computed **deterministically in code** from the matched rows — the AI at most phrases the sentence. Compounds with usage: the more history, the sharper the mirror. This is the retention engine and the moat.

**9.3 Resolution post-mortem (MVP).** Inputs: frozen prediction, frozen reasoning/plan, confidence, outcome, outcome note, top-3 similar past misses. Output: a short diff — what the stated reasoning covered, what the outcome note reveals it missed, and any recurring blind spot across the similar misses. **System-prompt constraint (and eval rubric): every claim must anchor to text the user wrote; no motive speculation, no invented causes. Diff engine, not therapist.** Degrades gracefully: no reasoning → no post-mortem, just the score.

**9.4 Monthly insight (v2; templated stats summary in MVP).** One batched call per active user per month. Inputs: aggregate stats including the calibration-by-reasoning-type table AND the decomposition profile. **The profile is assigned in code, not by the LLM:** `reliability low AND boldness low → hedger` ("honest but timid — your 70%s behave like your 55%s; commit harder"); `reliability high → miscalibrated` ("shift your 90%s down"); both healthy → calibrated-and-bold. Same Brier score can yield opposite coaching — that's the point. Output: 2–3 sentences naming the pattern ("evidence-justified predictions hit 72%; plan-optimism ones hit 31%"). v2+: run `decompose()` per reasoning_type, so the insight can distinguish "plan-optimism predictions are miscalibrated" from "gut-feel predictions are merely timid" — different fixes. The AI narrates numbers and labels the deterministic engine produced.

**9.5 Reference-class proposals (v2).** For predictions where the static base-rate table has no match, one call proposing a comparable class + rough rate, flagged as an estimate.

**9.6 Auto-resolution (v2).** Web-check + proposed resolution for publicly-verifiable predictions; always one-tap human confirm.

**9.7 Cost & guardrail engineering (your visible "senior" layer):** Haiku everywhere; prompt caching on static system prompts; embeddings at fractions of a cent; monthly insights batched; every call logged with tokens/cost/latency; per-user daily cap enforced in code; JSON validate-and-retry (one repair attempt). A heavy user costs **cents per month**.

---

## 10. Auth & privacy

Predictions and reasoning about one's job, relationships, and money are **sensitive**; honesty depends on privacy (say so in the README).

- Hosted auth (Supabase Auth): magic-link or OAuth. Never hand-roll.
- **Row-level security:** users read/write only their own rows; similarity search filtered by user_id at the query level.
- No prediction content in URLs, query strings, or logs. API key server-side only.
- Private by default; no social features. Export/delete later.

---

## 11. Notifications / reminders

- **MVP: email.** Daily Vercel Cron → secret-guarded route → predictions due today → Resend.
- **PWA push (v2):** the app ships as an installable PWA from day one (manifest + service worker — cheap); web push for home-screen installs is the v2 upgrade that replaces some email nudges. This is the middle path chosen over a native App Store app: keeps $0 cost, no review latency, and — decisively for the portfolio goal — recruiters get a clickable URL.

---

## 12. Recommended stack (with rationale)

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js (App Router), TypeScript — **Server Components for reads, Server Actions for mutations** | Full-stack in one repo (UI + API + cron), free deploy, plays extremely well with Claude Code. Server Components/App Router fluency is the #2 filter (after TypeScript depth) in 2026 React hiring — use the modern idiom deliberately and name it in the README. |
| **Styling** | Tailwind CSS | The 2026 default for product UIs in job postings; fastest option for a solo 2-week build. |
| **Delivery** | PWA (manifest + service worker) on Vercel (Hobby/free) | Installable app feel + clickable recruiter URL; built-in Cron; $0. |
| **DB + Auth + Vectors** | Supabase (free) — Postgres + Auth + RLS + **pgvector** | One product covers relational data, auth, row security, AND similarity search. Removes days of work. Also a rising job-post keyword in its own right. |
| **ORM** | Drizzle | Lightweight, type-safe, serverless-friendly. (Deliberate non-change: tRPC/Prisma appear in some listings, but ORM choice isn't what screeners filter on — swapping adds churn, not hireability.) |
| **LLM** | Anthropic API — Haiku 4.5 (+ an embedding model), **streamed to the client where user-facing** | Cheap, fast, structured outputs via tool use. "LLM-streaming UI" is a named differentiator in 2026 frontend hiring — the post-mortem streams token-by-token into the resolve screen. |
| **Email** | Resend (free tier) | Simple API, generous free allowance. |
| **Charts** | Recharts (or visx) | Calibration curve + diagonal; easy in React. |
| **Analytics** | Plausible/PostHog free + your own `ai_calls` table | Usage insight + the cost dashboard. |

**Data-flow idiom (hiring-signal deliberate):** dashboard/insights are **Server Components** reading via Drizzle directly; capture and resolve are **Server Actions** (not classic API-route posts); the cron endpoints remain route handlers (they're webhooks, the correct exception); the post-mortem is the streaming path.

---

## 13. Cost to develop & host

**Develop:** ~$0 in money — your time + the Claude Max subscription you already have. Effort: **~55–75 hours** (≈2 weeks at 4–5 hrs/day; the reasoning/post-mortem layer adds a few hours over v1's estimate).

**Host:** effectively **$0/month.** Vercel Hobby + Supabase free + Resend free + Plausible free → $0. Only variable cost: Anthropic API tokens — billed on the **API, entirely separate from your Max plan**.

**Token math (Haiku ~$1/M input, $5/M output; embeddings ~fractions of a cent):**
- Capture enrichment: ~600 in / 50 out ≈ **$0.001**. Embedding: ≈ $0.0001.
- Post-mortem: ~1,200 in / 250 out ≈ **$0.0025**.
- Monthly insight: ~1,500 in / 300 out ≈ **$0.003** per user per month.
- A heavy user (30 predictions + 30 resolutions/month) ≈ **$0.10–0.15/month**. A handful of real users ≈ **$1–3/month total**, hard-capped by the per-user limit.

---

## 14. Workload breakdown (≈2 weeks)

- **Day 1 — Foundations.** Scaffold Next.js + Tailwind + Supabase (+pgvector), auth, schema + migrations, PWA manifest, hello-world live on Vercel.
- **Days 2–3 — Scoring engine (v1 layer).** Pure functions + full unit tests (Brier, `rollingBrier()`, `biasScore()` + the directional-sentence templates, buckets, ECE, voids, degenerate cases) *before any UI*. The rigorous core, done first. (Murphy `decompose()` + identity test and `wilsonInterval()` are the v2 release — they consume these same buckets, so they layer on without rework.)
- **Days 4–5 — Capture.** Form with static examples/tips, confidence/date, reasoning fields with deterministic self/world branch, save path; background enrich + embedding; `ai_calls` logging + per-user cap.
- **Day 6 — Track-record surfacing.** Debounced draft embedding, pgvector similarity over own resolved rows, deterministic hit-rate computation, templated phrasing; static base-rate fallback.
- **Days 7–8 — Resolve + dashboard.** Resolve flow as a Server Action, instant Brier, running stats, open/due lists; the post-mortem call with the diff-engine system prompt, **streamed token-by-token to the resolve screen**.
- **Day 9 — Reminders.** Vercel Cron + Resend, secret-guarded, tested.
- **Days 10–11 — Insights (v1).** Bias score headline with directional sentences; calibration curve + baseline + lock state; rolling-Brier progress chart with needs-more-data state; category and reasoning-type breakdowns; templated monthly summary. (v2 release: Wilson error bars on the curve, Boldness gauge, windowed Murphy, + the code-side hedger/miscalibrated profile classifier feeding the AI insight.)
- **Day 12 — Landing + polish.** Landing page, onboarding, empty states, mobile responsiveness, PWA install prompt.
- **Days 13–14 — Hardening + portfolio.** Tests, error handling, cost dashboard, README (wedge, principles, what was cut and why), seeded demo account, deploy.

---

## 15. Issues, roadblocks & risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Retention / long feedback loop** (the historical killer of these tools) | High for a business, low for a portfolio | Instant per-prediction Brier; streak/count mechanics; encourage short-horizon predictions; the track-record panel gives value at *capture* time, not just months later. Don't over-invest beyond that. |
| **Sparse data early** (curve meaningless; track-record panel silent) | Medium | Under-sampled lock states; static base-rate fallback carries new users until personal history takes over (deliberate arc: world-knowledge → your own data); seeded demo account. |
| **Users skip the reasoning fields** → no post-mortems | Medium | Optional-but-rewarded design: post-mortem is visibly the payoff for writing reasoning; placeholders make 1 sentence feel sufficient; never gate capture on it. |
| **Post-mortem quality drift** (speculation, therapist-mode) | Medium | The diff-engine constraint in the system prompt + a small eval: every claim must anchor to user text; goldens checked in CI. |
| **Embedding/similarity misfires** (irrelevant "similar" predictions) | Medium | Require ≥3 matches above a similarity threshold before showing the panel; show the matched predictions on tap so the user can judge relevance; tune threshold with your own seed data. |
| **Scoring correctness bugs** | Medium | Full unit tests against worked examples — cheap, high-value, non-negotiable. |
| **LLM cost runaway** | Low | Haiku + caching + per-user caps + `ai_calls` logging; hard budget in code. |
| **Privacy of sensitive entries** | Medium | RLS, user-filtered vector search, nothing in URLs/logs, server-side keys. |
| **Scope creep** (auto-resolution, push, NL queries are seductive) | Medium | Hold the §5 cut line; document cuts in the README. |
| **Competitor adds Brier scoring** (Decision Log could) | Strategic, not technical | Irrelevant to the portfolio goal; note it as a understood business risk. The reasoning-type analytics + personal track record are the harder-to-copy layer anyway. |

---

## 16. Testing & observability

- **Unit tests** on the scoring engine (non-negotiable).
- **A small LLM eval suite:** golden inputs for (a) enrichment — category/reasoning_type assignments checked against expected labels; (b) post-mortems — a rubric check that every claim anchors to provided user text (the diff-engine constraint), runnable manually or in CI. "I built evals for the AI layer" is a strong current-market signal.
- **The cost/latency dashboard** off `ai_calls` — tokens and $ per request, per purpose. The concrete artifact that reads as "ships AI responsibly."

---

## 17. What to showcase (portfolio framing)

- **Live demo** (clickable URL; seeded account so the curve and a post-mortem render immediately).
- **README** stating: the wedge (vs Fatebook and Decision Log), the three design principles from §1, the LLM-narrates/code-grades architecture, cost controls, **the deliberate stack idioms (Server Components for reads, Server Actions for mutations, streamed LLM UX, Tailwind)**, and what was cut and why — including the *deliberately rejected* AI features (question-rewriter, capture linter) and the reasoning. Rejecting AI features with an argument is a rarer, stronger signal than adding them.
- **A short writeup** (blog/LinkedIn) explaining calibration, the frozen-reasoning post-mortem idea, and the guardrailed design.
- Interview talking points ready: proper scoring rules and Murphy's decomposition — *applied and phased*: v1 ships the Brier layer (score, rolling progress), v2 ships the diagnostic layer (the curve shows reliability, the Boldness gauge shows resolution, the identity `Brier = U − Res + Rel` is asserted in the test suite, Wilson bars quantify trust per dot); the same-Brier-opposite-coaching diagnostic (hedger vs. miscalibrated); the AI/deterministic split; why AI belongs on the user's data rather than at capture; embeddings + pgvector for the track-record feature; per-request cost observability; the 2026 forecasting research context.

*Marne is a small, sharp, honest product: a decision journal with an un-fakeable measurement core, AI applied only where the user is genuinely blind, and every judging number produced by deterministic, tested code. That combination — and the documented reasoning behind every design cut — is exactly the shape that reads as "senior engineer with current market judgment," which is the entire point.*
