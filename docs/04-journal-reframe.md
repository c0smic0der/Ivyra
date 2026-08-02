# Ivyra V2 — the journal reframe

*Design spec and session-by-session runbook. Companion to `02-application-rundown.md` (the definitive spec) and `03-building-with-claude.md` (the build method). Read those first; this document only describes what changes. This document supersedes both `04-guided-journal-pivot.md` (template chips) and `04-decision-journal-pivot.md` (the decision/forecast split) — see §6 for why each was cut.*

> **Note on version naming.** The shipped releases are already labelled v1 (launch) and v2 (the diagnostic release), both of which went out together in Session 16. To avoid collisions in commit messages and CLAUDE.md, refer to this work as **the journal reframe** in the repo, never as "v2". Session numbering continues from 16; this runbook replaces the previously-planned v3 sessions (Wilson error bars, windowed Murphy), which are shelved — see §6.
>
> **Note on product naming.** The product is now **Ivyra**. It carried placeholder names during development — **Caliber**, then **Calra**, then **Marne** — all retired in favour of Ivyra; any of those names elsewhere in the history refers to today's Ivyra. This note is the one place that history is preserved.

---

## 1. What this is, and what it deliberately is not

**The purpose of the product does not change.** You write down what you think will happen, attach a confidence and a date, and deterministic code scores you when reality answers. Every mechanic, every field's function, and the entire scoring engine stay exactly as shipped.

**What changes is the register.** "Tracker" presents the product as a spreadsheet with chores: a status dashboard, a form, a queue. "Journal" presents the same mechanics as a practice: dated entries in your own words, read back to you later, with the scoring as the thing that makes it honest. The reframe is language, layout, and cadence — never function.

| | Before | After | Nature of change |
|---|---|---|---|
| Capture & resolve | Form-like: small fields, metric header | Entry-like: "New entry", large writing boxes, "Only you" | Copy + CSS — **✅ shipped, Session 17** |
| Home | Status dashboard: open / due / resolved | **Reverse-chronological journal timeline**; due items become one dismissible strip | Read-side route |
| Track-record panel | Small sidebar element, currently dark | **Prominent, pre-save**, embeddings enabled (closes TODO 6) | Existing plan, promoted |
| Cadence | Resolution-date email only | A weekly ritual: log Friday, resolve Monday | Two cron emails |
| Landing / positioning | "Tracker" language | Journal language over prediction mechanics | Copy |

**What is deliberately NOT in this reframe** — each considered at length and cut:
- **No free-form journaling.** No "what's on your mind" box. Journaling and prediction have incompatible registers; the enlarged reasoning field, anchored to a claim, is the writing surface, and the registers never collide.
- **No decision field.** An earlier draft split capture into decision + success criterion so "I'm turning down the contract" could be an entry. Cut: the product's purpose is prediction, and the split existed only to serve a "decision journal" tagline this reframe no longer makes. It remains a half-day, one-nullable-column addition if real users ask for it — added on evidence, not anticipation.
- **No AI at capture.** No detection, no rewriting, no suggesting. The user's text is saved verbatim and frozen.

**Positioning, in one sentence:** *a journal for what you think will happen — and how often you're right.*

**The pitch has two layers, in strict order, and the landing page must reflect the order:**

1. **Primary — calibration.** Every entry is scored against reality by deterministic code, so over time you learn exactly when your confidence can be trusted and when it runs ahead of you. This is the product; it is the one thing no other journal does, and no page or paragraph may bury it beneath the journal framing.
2. **Secondary — the record.** The same entries form a timeline of your thinking: what you believed, why, and how it went, readable back across months of your life. The journal is the shape; calibration is the point.

**Hero pattern for the landing page:** the journal sentence as the headline, calibration as the subline immediately beneath it — e.g. *"A journal for what you think will happen — and how often you're right."* / *"Every entry is scored against what actually happened. Over time, you learn exactly when to trust your own confidence."* (Prompt copy may tune the wording; the hierarchy is fixed. Subline claims must respect the Copy rules — calibration of confidence, never judgment of decisions.)

The copy rule that keeps this honest: the word "journal" may describe the register and the timeline; it must never promise free-form writing. The landing page shows a real entry — claim, confidence, reasoning — so nobody arrives expecting Day One. Prediction purpose, journal clothes, no false promise.

---

## 2. The language leaks — ✅ shipped (Session 17)

*Kept for the record; all three fixes and the CLAUDE.md rule are in the repo as of the Session 17 commit.*

Three places claimed, or implied, that the app judges **decision quality**. It does not and must not: Brier and the calibration curve measure whether stated confidence matches observed frequency, nothing more. Fixed: the identity sentence in §2 of the rundown ("…measures whether your confidence means what you think it does — and shows you exactly where it doesn't"), the scoped-insight framing in §5 ("the decomposition produces the finding, the insight reports it…"), "judging number" → "scored number" in §17, and two merit lines in `howItWorks.ts`.

**The standing rule, now in CLAUDE.md under "Copy rules":**

> **Calibration only, never merit.** Every user-facing sentence reports the relationship between stated confidence and observed frequency. The app never evaluates whether a decision, commitment, or opinion was good, wise, or correct in itself. Banned phrasings: "good call", "bad call", "you were right/wrong to", "you should have", "better decision", "poor judgment". Permitted: "you said 85%, it happened 38% of the time", "you flagged this risk and still went to 85%", "your high-confidence calls land less often than you claim." When in doubt, state a frequency and stop.

Every prompt in this runbook that writes user-facing strings must check them against this rule.

---

## 3. Screen design

### 3.1 Capture and resolve — ✅ shipped (Session 17)

Capture: "New entry" header with local date and an "Only you" lock marker; the claim field, Confidence and Resolves unchanged in name and behaviour; `reasoning` enlarged to the visually largest input (~130px) with the sub-line "Write as much as you want. This is the part you'll read back." and footer "Locks when you save."; a placeholder modelling an honest ramble, self-doubt included. Resolve: frozen reasoning collapsed behind "Read what you wrote"; verdict buttons as client-side selection; `outcome_note` enlarged (~120px) under "How did it actually go?"; one atomic "Save and see post-mortem" CTA. Token guard: `reasoning` and `outcome_note` enter the post-mortem prompt as capped excerpts (`POSTMORTEM_EXCERPT_CHAR_BUDGET`), never truncated in the UI.

### 3.2 Home — the journal timeline (Session 19)

```
┌──────────────────────────────────────────┐
│  Your journal                    ⌕   +   │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ 2 ready to resolve              ›  │  │  ← the old dashboard, reduced to
│  └────────────────────────────────────┘  │    one dismissible accent strip
│                                          │
│  JULY                                    │  ← month header, 11px caps
│                                          │
│  28 Jul              80% · resolves 15/8 │
│  We still ship the redesign by the 15th  │  ← the claim, 13px
│  Third week with no assets and I'm       │  ← reasoning preview, 2 lines,
│  starting to think this isn't a delay…   │    muted — the prose that makes
│  ──────────────────────────────────────  │    the page read as a journal
│  21 Jul                         ✕ 0.64   │  ← resolved: verdict + Brier,
│  They come back with a better offer      │    right-aligned annotation
│  by end of month                         │
│  Said 75%. They didn't come back at      │
│  all. I keep pricing hope as evidence…   │
│  ──────────────────────────────────────  │
│  14 Jul                         ✓ 0.09   │
│  Review time drops below a day within    │
│  a month of the trunk-based switch       │
└──────────────────────────────────────────┘
```

**Design notes.** Chronology is the organizing principle; scores and confidence are annotations on the right, never sort keys. The headline is always `text` — there is one kind of entry. The reasoning preview is what makes the page read as a journal on sight; without prose bleeding into the list this is still a task queue with dates. The old home's open/due/resolved views survive behind the strip and the existing routes; nothing is deleted, only demoted.

### 3.3 The track-record panel, pre-save (Session 19)

```
│  ┌ ⟲ Before you save ─────────────────┐  │
│  │ You've said 75% or higher on 6     │  │  ← full width, accent-tinted,
│  │ calls like this. 2 landed.         │  │    above the CTA. States a
│  └────────────────────────────────────┘  │    frequency and stops.
```

The only feature in the product that fires *before* a call rather than after it, and therefore the most demoable moment in the app. Deterministic copy, no LLM, thin-history fallback stated plainly.

---

## 4. Data model delta

**None.** Zero schema changes anywhere in this document. The timeline home is a read-side route over the existing table; the panel uses the existing `embedding` column; the emails use existing infrastructure. The scoring engine is not touched.

---

## 5. The runbook — session by session

*Same method as `03-building-with-claude.md` — plan mode first, evidence before moving on, subagent review before every commit. Sessions 19 and 20 contain **multiple prompts**; each prompt is a full plan → build → evidence → review → commit cycle. Run `/clear` (and the stated `/model` switch) between prompts. Never start a prompt until the previous prompt's evidence step passed.*

---

### ▶ SESSION 17 — the language audit + the copy reframe — ✅ SHIPPED

One commit: `Reframe capture and resolve as journal entries; report calibration, not merit`. Contents as recorded in §2 and §3.1, plus the local-date fix (an entry written at 9pm in New York displays that day's date, with a boundary test pinning it).

---

### ▶ SESSION 18 — prep (~20–30 min, one prompt)

*Small but blocking: the seeded demo account has no way to log in (the seed script creates `demo@ivyra.app` with a password, but the login page only offers magic link), and every evidence step in Sessions 19–20 depends on that account working.*

**Setup:** `cd /Users/Shiv/Desktop/projects/decision_calibrator` → replace the untracked `docs/04-decision-journal-pivot.md` with this file as `docs/04-journal-reframe.md` → `claude` → `/clear` → `/model sonnet` → **Shift+Tab** (plan mode).

**PROMPT — paste:**

> Read CLAUDE.md and the seed script.
>
> Three housekeeping items, no product changes:
>
> 1. Add docs/04-journal-reframe.md to CLAUDE.md's doc list (it is already on disk; confirm docs/04-decision-journal-pivot.md and docs/04-guided-journal-pivot.md are gone) and stage it for this commit. Stage files explicitly by name — do not use `git add -A`.
> 2. The seed script creates demo@ivyra.app with a password, but the login page only offers magic link, so the demo account cannot actually be used. Fix this with a **dev-only password form**: on the login page, render an email+password fallback only when NODE_ENV is development, wired to Supabase password auth. Production builds must not render it or ship its code path to the client bundle. Do not change magic-link behaviour. Add a test that the password form component is absent from a production render.
> 3. Append a **Git rules** heading to CLAUDE.md with exactly: "Stage files explicitly by name; never `git add -A`. Destructive git commands (`restore`, `reset`, `clean`, force-push) require my explicit approval in the session before running."
>
> Propose the plan first.

- **Evidence:** `npm run seed`, then log in as `demo@ivyra.app` on localhost. This login gates every evidence step that follows — do not proceed until it works.
- **Commit:** `Commit to main with message "Add dev-only demo login, journal-reframe doc, and git rules" and push.`

---

### ▶ SESSION 19 — the visible layer: timeline home + track record (~2 hrs, two prompts)

*Prompt 1 is read-side UI on Sonnet. Prompt 2 closes TODO 6 on Opus — under the journal positioning the pre-save panel is the product's central demo moment, because it is the only feature that fires before a call rather than after it.*

**Setup:** `claude` → `/clear` → `/model sonnet` → plan mode.

**PROMPT 1 of 2 — the journal timeline home (Sonnet) — paste:**

> Read CLAUDE.md, §4 of docs/02-application-rundown.md, and §3.2 of docs/04-journal-reframe.md.
>
> Replace the home dashboard with a reverse-chronological journal timeline, per the §3.2 layout: month headers; per entry a date (user's local timezone, consistent with the Session 17 date handling), the claim, a two-line muted `reasoning` preview, and a right-aligned annotation — "{confidence}% · resolves {date}" while open, verdict icon + Brier once resolved. Server Component, paginated, newest first.
>
> The old dashboard's due-item function becomes one dismissible accent strip at the top — "{n} ready to resolve" — deep-linking to the existing resolve queue. Keep the existing open/due/resolved routes reachable; demote, don't delete.
>
> This prompt is read-side only: no schema changes, no mutations, no scoring calls from the component — all numbers come from the scoring module.
>
> Add tests: ordering and month grouping; annotation states open/resolved/void; reasoning-preview truncation; pagination; and that the query is scoped to the authenticated user. Propose the plan first.

- **Evidence:** demo account — the home reads as a journal at a glance; the strip appears only when something is due and dismisses cleanly.
- **Review — paste:**
  > Use the security-reviewer subagent to confirm the timeline query is RLS-scoped and paginated server-side, and that no scoring math is computed inline in components. Report findings with file:line.
- **Commit:** `Commit to main with message "Replace home with journal timeline; demote dashboard to resolve strip" and push.`

**Then:** `/clear` → `/model opus` → plan mode.

**PROMPT 2 of 2 — turn on the track record, closes TODO 6 (Opus) — paste:**

> Read CLAUDE.md, §9 and §7 of docs/02-application-rundown.md, §3.3 of docs/04-journal-reframe.md, and TODO 6 in docs/03-building-with-claude.md.
>
> The embedding step is currently stubbed, so the track-record panel shows a generic base rate instead of the user's own history. Finish it:
>
> - On save, embed `text + reasoning` (capped excerpts, same budget constant as the post-mortem) and store it in the existing `embedding` column. Background, non-blocking — the save must never wait on it.
> - As the user types in capture, query pgvector for cosine-similar rows **scoped to the authenticated user's own resolved predictions**, and render the panel above the save button, full width, accent-tinted.
> - Copy pattern, deterministic, no LLM: "You've said {band} or higher on {n} calls like this. {k} landed." Where history is too thin, fall back to the existing static base-rate line and say so plainly.
> - Log every embedding call to `ai_calls` with purpose `'enrich'`, as today.
>
> **The panel states a frequency and stops.** Never advises, never "consider lowering", never merit language. Check every string against the CLAUDE.md copy rule.
>
> Add tests: similarity results are scoped to the current user and never leak another user's rows; the thin-history fallback renders; a failed embedding degrades to the fallback rather than erroring the save. Propose the plan first.

- **Evidence:** demo account — type an entry resembling a seeded one and watch the panel populate with real numbers; check `ai_calls` for the enrich rows.
- **Review — paste:**
  > Use the security-reviewer subagent to audit the pgvector similarity query. Confirm it is scoped to the authenticated user through RLS and cannot return another user's rows under any input, that the embedding write is non-blocking and cannot fail the save, and that ai_calls records every call. Report findings with file:line.
- **Commit:** `Commit to main with message "Enable embeddings and promote the track-record panel to pre-save" and push.`

**👁 On localhost after this session:** the app looks like its positioning — this home is the screenshot for the landing page and the README — and the most demoable moment works: you type a call and it tells you what happened the last nine times you felt this sure.

---

### ▶ SESSION 20 — insights, ritual, and ship (~1.5 hrs, three prompts, all Sonnet)

**Setup:** `claude` → `/clear` → `/model sonnet` → plan mode.

**PROMPT 1 of 3 — the verdict rewrite — paste:**

> Read CLAUDE.md and §4.7 of docs/02-application-rundown.md.
>
> One change to /insights: **rewrite the verdict headline** to lead with the frequency gap in the user's own terms: "When you say 85%, it happens 38% of the time." Deterministic, computed in the scoring module — no inline math in the component, no LLM. Every sentence reports a frequency; none evaluates a decision; apply the CLAUDE.md copy rule to every string, including lock states and explanations.
>
> Add tests for the headline wording across overconfident, well-calibrated and hedging fixtures. Propose the plan first.

- **Evidence:** check the page on the seeded overconfident profile and a sparse account.
- **Review — paste:**
  > Use the scoring-verifier subagent to review the insights change. Confirm all numbers come from the scoring module with no inline math and no rendered string evaluates decision quality. Report findings with file:line.
- **Commit:** `Commit to main with message "Lead insights with the frequency gap" and push.`

**Then:** `/clear` (stay on Sonnet) → plan mode.

**PROMPT 2 of 3 — the weekly ritual — paste:**

> Read CLAUDE.md, §11 of docs/02-application-rundown.md, and §1 of docs/04-journal-reframe.md. Extend the existing Resend + Vercel Cron setup — do not introduce a new mail path.
>
> Add two weekly emails:
> - **Friday:** "What's your read on next week?" — deep-links to capture.
> - **Monday:** "What resolved over the weekend" — lists due items, deep-links to the resolve queue. Send nothing if nothing is due.
>
> Both per-user opt-outable through existing notification settings. Both idempotent — a cron retry must never double-send. Reuse the existing template and unsubscribe footer.
>
> Add tests: no-due-items suppression, idempotency on repeated invocation, correct capture deep-link. Propose the plan first.

- **Evidence:** trigger both cron routes locally, inspect the rendered emails, run each twice and confirm no double-send.
- **Commit:** `Commit to main with message "Add Friday and Monday ritual emails" and push.`

**Then:** `/clear` (stay on Sonnet) → plan mode.

**PROMPT 3 of 3 — landing, onboarding, and ship — paste:**

> Read CLAUDE.md, §4.1–4.3 of docs/02-application-rundown.md, and §1 of docs/04-journal-reframe.md.
>
> Rewrite the landing page and onboarding around the positioning in §1, **following its two-layer pitch in strict order: calibration is the primary value, the journal/record is secondary.** The hero uses the §1 pattern — the journal sentence as the headline, the calibration subline immediately beneath it — and the section structure must lead with what scoring gives you (when to trust your own confidence, the calibration curve, the track-record panel) before the timeline/record framing. A page where "journal" carries the weight and scoring reads as a feature bullet is a failed implementation of this prompt.
>
> The hero shows the journal timeline screenshot. The page must show a real example entry — claim, confidence, reasoning — so the register is journal but the mechanics are unmistakable; the word "journal" must never promise free-form writing. All ambition copy stays frequency-based per §1's compliant examples ("know when to trust your own confidence") — never judgment of decision quality. The identity sentence uses the corrected §2 wording. Keep one CTA.
>
> Onboarding must get the user to their first saved entry inside 60 seconds, with a worked example visible and the reasoning field's optionality clear. No tour, no multi-step wizard.
>
> Then run a full pass over every user-facing string in src/ against the CLAUDE.md copy rule and report anything that evaluates a decision rather than reporting a frequency — expected result: nothing.
>
> Propose the plan first.

- **Evidence:** incognito, brand-new user: landing → sign up → onboarding → first entry saved → track-record fallback shown honestly → timeline shows the entry.
- **Review — paste:**
  > Use the security-reviewer subagent for a pre-ship pass: RLS on all new query paths, no secrets in client bundles, rate limits intact on the AI routes, and confirm the dev-only password login is absent from the production bundle. Report findings with file:line.
- **Commit and deploy:** `Commit to main with message "Reposition landing and onboarding as a prediction journal" and push.` Verify the Vercel production deploy and walk the flow once on the live URL.

---

## 6. What is shelved or superseded, and why

| Item | Status | Reason |
|---|---|---|
| **Decision/forecast split** (superseded doc) | **Cut** | Existed only to make a "decision journal" tagline functionally true; the product's purpose is prediction and the tagline no longer makes that claim. Re-add on user evidence: one nullable column, one derived-kind function, ~half a day. |
| **Per-type insights breakdown** | Cut with it | Cannot exist without the decision column. |
| **Three template chips** (first superseded doc) | Superseded | "Commitments" and "takes" are both plain forecasts distinguished by nothing the schema needs to know. |
| **Free-form journaling** ("What's on your mind?") | Shelved | Incompatible registers — journaling invites messiness, prediction demands precision. The enlarged reasoning field is the writing surface, anchored to a claim. |
| **AI claim detection** | Shelved | Identifying your own forward-looking sentence is something a user can do; under design principle 1 the detector was a violation. |
| **Belief check-ins / updating analytics** | Shelved | Genuinely strong (a second scoreable dimension no competitor tracks) but a second product's worth of surface. Revisit if retention data says beliefs go stale. |
| **Wilson error bars / windowed Murphy** (old v3) | Shelved | Refinements for users you do not have yet. Revisit once real accounts cross 30 resolutions. |
| **Therapist / clinical mode** | Shelved | HIPAA and PHI exposure breaks the no-legal-work and near-zero-cost constraints. |
| **Social / shared predictions** | Shelved | Real retention mechanism, but drags in invite flows and privacy work. The weekly ritual buys most of the benefit for a fraction of the scope. |
| **RLS backstop** | Radar (post-ship) | App queries currently run on the privileged connection, so tenant isolation rests entirely on the app-layer `eq(user_id)` filter (RLS policies exist but are inert for this connection). Move user-facing reads/writes to an RLS-respecting connection, service role for cron/admin only. Defense in depth. |

---

## 7. Cost

Session 17 is shipped. What remains: one short prep sitting (~30 min) and two working sittings (~3.5 hrs total, six commits). **Zero schema changes.** No new infrastructure, no new services, no change to the hosting bill. The scoring engine is not touched at all.

*The reframe is not a new product, and this time it is not even a new field. It is the journal the product was already keeping, turned face-up.*
