# 07 — Decision Layer Runbook

*Build steps for `06-decision-layer.md`. Method, as always: **plan mode first** (Shift+Tab), evidence before moving on, subagent review before every commit, one commit per prompt — and in this runbook, **commits and pushes are inside the pastes**; you never run a git command yourself. Run `/clear` (and the stated `/model` switch) between prompts. Never start a prompt until the previous one's evidence passed.*

*This file is the **single source of truth**. Where it disagrees with anything in chat history, this file wins. It is written against the actual current state of the build, below.*

---

## 📍 CURRENT STATE — START HERE

**Already done — do not redo any of this:**

- ✅ Session 21 Prompt 1 (schema + scoring, Opus) was pasted and is running: three nullable columns (`decision`, `stance`, `reflection`), `kindFor`, `byEntryType`, `outcomeByStance`, failing-suite-first, no React.
- ✅ Its plan was reviewed and approved.
- ✅ The sample-gate question was answered: **BIAS_UNLOCK_N (10) is reused directly** for both new functions.
- ✅ Three judgment calls were approved: the migration is applied to the local DB as part of the task (repo convention); migration tests follow the existing integration-test pattern (real DB via DATABASE_URL, describe.skip when unset, afterAll cleanup); `scripts/seed-dev.js` is an intentional exception to kindFor routing, marked with a top-of-file comment.
- ✅ Claude Code planned without needing `docs/06-decision-layer.md` (the spec was fully inlined in the pasted prompt), so no missing-doc handling is required.
- ✅ Implementation is GREEN: migration 0005 applied (three nullable columns + stance CHECK, single-source enum), kindFor at every write site, both scoring functions gated on BIAS_UNLOCK_N; RED→GREEN shown; full suite 516 passing (one unrelated pre-existing integration-test timeout flake, left alone).
- ✅ The pre-commit DB evidence is satisfied by its real-database integration tests (pre-existing rows read back null across all three columns, kinds unchanged) — the throwaway-script paste was skipped as redundant.
- ✅ Both of its honesty notes were resolved in-session: the missing doc is intentional (lands in Prompt 2), and the flake stays untouched in this commit.

**Your next paste — the only current version; ignore any earlier variants from chat.**

**▶ NEXT PASTE — review, then commit-and-push (already includes both):**

> Use the scoring-verifier subagent: confirm both new functions reuse the existing buckets and resolvedNonVoid, thresholds return null and cannot produce NaN, stance never influences any Brier/calibration/bias/boldness number anywhere, prediction_kind flows only through kindFor, and the migration touches no existing data. Independently recompute one standByRate from the test fixture. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Add decision entries, stance/reflection columns, and per-type + stance analytics`, and push. If anything blocking is found, stop and report — no commit.

**▶ THEN:** Session 21 Prompt 1 is complete and pushed. Continue at **Session 21 · Prompt 2** below and proceed linearly — every remaining prompt already contains its own evidence and its own commit-and-push step.

---

## ▶ SESSION 21 — schema, engine, docs, and the capture split

### Prompt 1 of 3 — schema + scoring (Opus) — ✅ EXECUTED (record only)

Kept for the record: the pasted prompt specified the migration (three nullable columns, no backfill), the `kindFor` rule, both scoring functions with their null gates, and the test-first order. Its evidence and review-plus-commit are the two pastes in **START HERE** above — they live only there, so there is exactly one current copy.

### Prompt 2 of 3 — docs into the repo + consistency check (Sonnet, ~10 min)

Download the current `06-decision-layer.md` and this file to your machine (anywhere — Downloads is fine). Then `/clear` → `/model sonnet` → plan mode → paste, filling in the one path:

> Two design docs are at <PATH, e.g. ~/Downloads>/06-decision-layer.md and 07-decision-layer-runbook.md. Move them into docs/, add both to CLAUDE.md's doc list, and confirm docs/ now contains 01 through 07 with no leftovers of superseded 04-era decision docs.
>
> Then a consistency check, since the schema shipped before the doc: compare the just-committed migration and scoring functions against §2–§3 of docs/06-decision-layer.md — column names and nullability, the stance enum values, the kindFor rule, both function contracts and their null gates. One known, accepted difference: the docs don't name the gate constant; the implementation reuses BIAS_UNLOCK_N — treat that as conforming. Report any other mismatch with file:line; expected result: none. If a mismatch exists, report it and stop — do not reconcile without my call.
>
> When done and shown to me: stage explicitly by name per the Git rules, commit as `Add decision-layer spec and runbook`, and push. Show me `ls docs/` and the CLAUDE.md diff as evidence first.

### Prompt 3 of 3 — the capture split UI (Sonnet)

`/clear` → `/model sonnet` → plan mode → paste:

> Read CLAUDE.md, §4.5 of docs/02-application-rundown.md, and §2.1 of docs/06-decision-layer.md. Existing design system only — no new styling primitives.
>
> Split capture into two fields with the §2.1 copy verbatim. The second field **auto-mirrors** the first until either is edited, after which the link breaks permanently for that entry. On save: identical fields ⇒ persist `decision` null (pure forecast); differing ⇒ first field to `decision`, second to `text`. The scoreable claim is always `text`, and the decision/text assignment happens server-side in the Server Action.
>
> The second reasoning field's label follows `kindFor` live as the decision field fills or clears: "What's your plan?" for decisions and self-forecasts, "What would change your mind?" for world-forecasts.
>
> Layout contract per §2.1: first four inputs above a visible divider, savable alone; reasoning and plan/disconfirm below it, optional, never gating. Timeline: entries with `decision` render it as the headline; forecasts render `text` unchanged.
>
> Tests: auto-mirror engages and breaks; identical ⇒ decision null; differing ⇒ both columns; label follows kindFor live; above-fold-only save succeeds; timeline headline selection for both entry types. Interaction tests use the Testing Library setup — the mirror-break and live-label behaviors must be exercised, not just asserted statically.
>
> **Evidence (perform and show me):** run the suite and paste output; then run the seed, start the dev server, and via a scripted request path (server action invoked from a test or script as the demo user), create one pure forecast and one decision entry; query the database and print both rows' decision/text/prediction_kind to prove the split persisted correctly; fetch the timeline page HTML and grep it to show the decision's headline is the decision text and the forecast's is its claim.
>
> Propose the plan first.

**Review — paste:**
> Use the security-reviewer subagent: the decision/text assignment is server-side and unspoofable, inputs validated, RLS/user scoping intact on every touched path. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Split capture into decision and success criterion with auto-mirror`, and push. If anything blocking is found, stop and report — no commit.

**👁 After this session:** "Turning down the contract" is a savable, timeline-visible entry, proven by scripted evidence rather than eyeballs. Scoring unchanged; nothing subjective exists yet.

---

## ▶ SESSION 22 — the subjective layer, insights, seed, and ship (~2 hrs, four prompts)

### Prompt 1 of 4 — resolve gains the reflection (Sonnet)

`claude` → `/clear` → `/model sonnet` → plan mode → paste:

> Read CLAUDE.md, §2.2 of docs/06-decision-layer.md, and the existing resolve screen implementation.
>
> Add the subjective layer to resolve, rendered **only when the entry's `decision` is non-null**: heading "Knowing what you know now — was this the decision you wanted to have made?", a free-text `reflection` textarea (sub-line "As much or as little as you like."), and three optional one-tap stance options labeled "Stand by it" / "Mixed" / "Wouldn't again" mapping to the enum. Both optional, never gating the verdict. Persist reflection + stance **atomically with** verdict and outcome_note in the one existing Server Action; frozen after save (no edit path). Pure forecasts must render exactly today's resolve screen.
>
> Extend the post-mortem: its prompt now also receives the reflection and stance as **capped excerpts** (same budget constant), and its system-prompt constraints are extended explicitly: the reflection is the user's self-report to be quoted or referenced, never endorsed or contradicted; no judging the decision; no invented numbers; all existing merit-rule bans apply to the new material.
>
> Tests: the section is absent for pure forecasts; atomicity — a transaction test proving verdict + note + reflection + stance land together or not at all (no half-written row on induced failure); frozen-after-save (no mutation path exists, asserted); an oversized reflection produces a capped prompt; stance values outside the enum rejected server-side. Every new string passes the CLAUDE.md copy rule.
>
> **Evidence (perform and show me):** suite output; then scripted as the demo user: resolve one seeded decision entry with reflection + stance, print the persisted row; trigger the post-mortem for it and paste the generated text so I can see it references the reflection without judging it; resolve one pure forecast and print its row showing stance/reflection null.
>
> Propose the plan first.

**Review — paste:**
> Use the security-reviewer subagent: reflection/stance persist only through the resolve action, only for decision entries, scoped to the owner; frozen post-save with no mutation path; post-mortem excerpting enforced at prompt assembly; enum validated server-side. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Add reflective resolution layer for decisions and feed it to the post-mortem`, and push. If anything blocking is found, stop and report — no commit.

### Prompt 2 of 4 — insights: the cross-stat + per-type rows, and the seed (Sonnet)

`/clear` (stay on Sonnet) → plan mode → paste:

> Read CLAUDE.md, §2.3 of docs/06-decision-layer.md, and the insights page implementation.
>
> Two additions to /insights, both consuming Session 21's functions — no inline math in components:
> 1. A slim **"Decisions"** section rendering `outcomeByStance`: for criterion-met and criterion-missed groups, the stand-by percentage, with copy of exactly this shape: "Of decisions where your criterion was met, you'd make {x}% again. Where it wasn't, {y}%." Below threshold per group: the honest lock state, never a noisy number. One muted sub-line, descriptive only: "Outcome and satisfaction are recorded separately — this shows how they relate for you."
> 2. The **per-type breakdown** via `byEntryType` alongside the existing per-category rows: "Decisions — says {a}% · lands {b}%" / "Forecasts — …", with lock states.
>
> **Seed update:** add ~24 seeded decision entries to the demo account — 6 per outcome×stance quadrant (met+stand_by, met+wouldnt, missed+stand_by, missed+wouldnt) — with realistic reflections. The count is deliberate: outcomeByStance gates each group on BIAS_UNLOCK_N (10), so ~12 met and ~12 missed stanced entries are required for the section to demo with real numbers instead of lock states; verify both groups clear the gate after seeding. Keep the seed idempotent; embed the new rows via the existing backfill path.
>
> Tests: both sections at 0, at just-below-threshold, and at healthy n; copy passes the merit rule (no rendered string evaluates a decision); seed idempotency with the new rows.
>
> **Evidence (perform and show me):** suite output; run the seed twice and print the decision-entry count both times (idempotency proven); fetch /insights as the demo user and grep the HTML for the Decisions section showing real crossed numbers; print the outcomeByStance result computed directly from the seeded rows and confirm it matches what the page renders.
>
> Propose the plan first.

**Review — paste:**
> Use the scoring-verifier subagent: all numbers from the scoring module, lock thresholds consistent with the existing gates, and no rendered string — including the sub-line — evaluates decision quality. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Add decisions section to insights and seed the outcome-stance quadrants`, and push. If anything blocking is found, stop and report — no commit.

### Prompt 3 of 4 — the sweep and the freeze check (Sonnet, ~15 min)

`/clear` → plan mode → paste:

> Read CLAUDE.md. Final pass for the decision layer:
> 1. Grep every user-facing string touched or added in Sessions 21–22 against the "calibration only, never merit" rule and the banned-phrasing list; report anything questionable with file:line before changing it.
> 2. Confirm the landing page, README, and any marketing copy are **unchanged** by these sessions — show me `git diff <pre-Session-21 commit>..HEAD -- <those files>`; expected result: empty. Identify the pre-Session-21 commit hash yourself from the log.
> 3. Update docs/04-journal-reframe.md's shelved table per §5 of docs/06-decision-layer.md: mark the decision split and per-type breakdown un-shelved, and add the "LLM/self-scored decision quality — rejected permanently" row with its rationale.
> 4. When 1–3 are done and shown to me: stage explicitly by name, commit as `Update shelved table for the decision layer; verify marketing unchanged`, and push.
>
> Propose the plan first.

### Prompt 4 of 4 — deployment verification (Sonnet, ~10 min)

`/clear` → plan mode → paste:

> The decision layer just pushed to main and Vercel is deploying. Verify production without a browser:
> 1. Poll https://ivyra.app until the deployment is live (curl; compare a response marker — e.g., a string added this session — against the previous deploy, retrying up to ~5 minutes).
> 2. Curl the landing page and confirm: HTTP 200, the marketing copy string unchanged, no reference to decisions/stance in any marketing surface.
> 3. Curl /insights and the sign-in page and confirm 200/redirect behavior is sane for an unauthenticated caller (no stack traces, no 500s).
> 4. Report each check with the actual response evidence (status codes, matched strings).
>
> If any check fails, stop and report — do not attempt fixes in this prompt.

**👁 After this session:** the layer is live, proven by scripted checks end to end. The one remaining human act is below — and it is not optional ceremony.

---

## The gate before anything else happens

**Dogfood for two to three weeks.** Log your own real decisions — the job-search ones are right there: "do I take this interview loop," "do I send this cold message." Only after that, and only if the layer earns it, does repositioning (landing copy, README, resume line) enter the conversation — as its own session, argued from your own usage data. Until then the marketing freeze from 06's positioning note stands. This is the single step no prompt can perform for you, because it *is* the product.
