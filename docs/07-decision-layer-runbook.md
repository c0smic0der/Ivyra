# 07 — Decision Layer Runbook

*Build steps for `06-decision-layer.md`. Method, as always: **plan mode first** (Shift+Tab), evidence before moving on, subagent review before every commit, one commit per prompt — and in this runbook, **commits and pushes are inside the pastes**; you never run a git command yourself. Run `/clear` (and the stated `/model` switch) between prompts. Never start a prompt until the previous one's evidence passed.*

*This file is the **single source of truth**. Where it disagrees with anything in chat history, this file wins. It is written against the actual current state of the build, below.*

---

## 📍 CURRENT STATE — START HERE

**Session 21 Prompt 1 — ✅ complete and pushed.** Commit `Add decision entries, stance/reflection columns, and per-type + stance analytics`. Migration 0005 (three nullable columns `decision`/`stance`/`reflection` + stance CHECK, single-source enum), `kindFor` at every write site, `byEntryType` + `outcomeByStance` gated on BIAS_UNLOCK_N (10), RED→GREEN shown, full suite 516 passing (one unrelated pre-existing integration-test timeout flake, left alone). Scoring-verifier review passed with no blocking findings.

**Session 21 Prompt 2 — ✅ complete and pushed.** Commit `71d4cd0 — Add decision-layer spec and runbook`. `docs/` now holds 01–07; CLAUDE.md gained a `## Docs` list. The consistency check found no mismatches (the unnamed gate constant was the one known, accepted difference). One untracked pre-existing screenshot in `docs/design-refs/` was correctly left alone.

Decisions recorded during Prompt 1, for the record: BIAS_UNLOCK_N is reused directly as the gate for both new functions; the migration is applied to the local DB as part of the task (repo convention); migration tests follow the existing integration-test pattern (real DB via DATABASE_URL, describe.skip when unset, afterAll cleanup); `scripts/seed-dev.js` is an intentional exception to kindFor routing, marked with a top-of-file comment.

### ⚠️ Scope change — decisions only (agreed after Prompt 2)

**Every new entry is a decision. Pure forecasts are no longer creatable.** Both capture fields are strictly required; the auto-mirror is cut entirely.

Four consequences that govern everything below — read these before the next paste:

1. **No new migration.** `decision` stays **nullable in the database**; the requirement is enforced in the Server Action. Null now means *"a legacy forecast, created before this change"* — an honest historic value. Backfilling existing rows to `decision = text` would relabel real forecasts as decisions the user never made, which violates the freeze; §3's "no backfill anywhere" stands.
2. **Legacy forecasts stay visible and keep scoring.** There are no users, so nothing is at stake; hiding or migrating them is unpaid work. They render as they do today, and continue to feed Brier/calibration/bias/boldness.
3. **`byEntryType` stays in the codebase but ships no UI.** It is committed, tested, and reviewed — removing it means editing shipped scoring code to delete something with zero running cost. But a rendered "Decisions vs Forecasts" row would split against a category the app no longer creates, so the insights row is **cut from Session 22 Prompt 2**. The function keeps its tests and remains available if the row is ever wanted.
4. **The marketing freeze is lifted.** 06's positioning note gated repositioning behind two to three weeks of dogfooding; that gate existed to prevent rebranding on a hunch, not to keep an inaccurate description live. Under decisions-only the old copy is simply wrong — it describes forecasting the app can no longer do — so the surfaces are realigned in this build. The resume was updated separately and already carries the new line. **New one-liner, decided:** *a decision journal that scores your expectations against real outcomes.* Accepted cost: the wording comes from intent rather than lived use, and is cheap to revise after dogfooding.

**▶ NEXT:** Session 21 · **Prompt 3** below — amend the spec, since `docs/06-decision-layer.md` currently describes the auto-mirror and must not be built from as written. Then proceed linearly; every prompt contains its own evidence and its own commit-and-push step.

---

## ▶ SESSION 21 — schema, engine, docs, and the capture form

### Prompt 1 of 4 — schema + scoring (Opus) — ✅ EXECUTED (record only)

Kept for the record: the pasted prompt specified the migration (three nullable columns, no backfill), the `kindFor` rule, both scoring functions with their null gates, and the test-first order. Its evidence and review passed; the outcome is summarized in **START HERE** above.

### Prompt 2 of 4 — docs into the repo + consistency check (Sonnet) — ✅ EXECUTED (record only)

Kept for the record: moved 06 and 07 into `docs/`, added both to CLAUDE.md's doc list, and checked the shipped migration and scoring functions against §2–§3 of the spec. No mismatches. Outcome summarized in **START HERE** above.

### Prompt 3 of 4 — amend the spec for decisions-only (Sonnet, ~10 min)

*This prompt exists because the spec shipped in Prompt 2 describes a design that is now superseded. Nothing should be built from `docs/06-decision-layer.md` until it is corrected — and the correction is a doc edit only, with zero code touched.*

`/clear` → `/model sonnet` → plan mode → paste:

> Read `docs/06-decision-layer.md`. A scope change: **every new entry is a decision; pure forecasts can no longer be created.** Amend the doc to match, changing only what the decision requires and preserving the document's voice and structure. Do not touch any code in this prompt.
>
> The edits:
>
> 1. **§2.1 (Capture)** — replace the auto-mirror design. Both fields are now **strictly required**: "What are you deciding?" and "How will you know it went well?" (keep the existing sub-lines). Delete the mirroring rule, the "identical fields ⇒ pure forecast" rule, and the "pure forecasts never touch field two" note. The Server Action rejects a save with either field empty, validated the same way confidence is. State plainly that the 60-second target now costs two fields instead of one, and that this is accepted.
> 2. **§2.1 (kind rule)** — every new entry has `decision` non-null, so `kindFor` returns `'self'` for all of them; the world branch survives only for legacy rows. Say so; do not change the rule itself.
> 3. **§3 (Data model)** — `decision` **remains nullable in the database**, enforced non-empty at the application layer. Add the rationale explicitly: null now means "a legacy forecast created before this change," and backfilling existing rows would relabel real forecasts as decisions the user never made, violating the freeze. "No backfill anywhere" stands, and **no new migration is required**.
> 4. **§2.3 (Analytics)** — `outcomeByStance` is unchanged and remains the headline analytic. The **per-type breakdown ships no UI**: `byEntryType` stays in the codebase with its tests, but rendering a decisions-vs-forecasts split against a category the app no longer creates would be noise. Record it as built-but-unrendered, available if wanted later.
> 5. **§4 and the positioning note** — confirm both still hold verbatim under the new scope, and say so. The marketing freeze is unchanged: this alters what the product does, not what it says.
> 6. **§5 (Bookkeeping)** — update the cost estimate, and note that the decision/forecast split row is un-shelved in a narrower form than originally written (decisions only, no split at capture).
>
> Show me the full diff of the doc as evidence. Then stage explicitly by name per the Git rules, commit as `Amend decision-layer spec for decisions-only capture`, and push.
>
> Propose the plan first.

### Prompt 4 of 4 — the capture form (Sonnet)

`/clear` → `/model sonnet` → plan mode → paste:

> Read CLAUDE.md, §4.5 of `docs/02-application-rundown.md`, and §2.1 of `docs/06-decision-layer.md` (just amended). Existing design system only — no new styling primitives.
>
> Capture becomes two **required** fields with the §2.1 copy verbatim: the decision, then its success criterion. No mirroring, no default text, no optional path. On save the first field persists to `decision` and the second to `text`; **the scoreable claim is always `text`**, and the assignment happens server-side in the Server Action.
>
> Validation: the Server Action rejects an empty or whitespace-only value in either field, following the existing validation pattern used for confidence — same error surface, same shape. A rejected save must not write a partial row.
>
> The second reasoning field's label follows `kindFor`, which now returns `'self'` for every new entry: "What's your plan?". Do not delete the world branch — legacy rows still use it.
>
> Layout contract per §2.1: first four inputs above a visible divider, savable alone; reasoning and plan/disconfirm below it, optional, never gating. Timeline: entries with `decision` render it as the headline; legacy rows with `decision` null render `text` unchanged.
>
> Tests: both fields required and each rejected independently when empty or whitespace-only; a valid save persists first field to `decision` and second to `text`; no code path can now write a row with `decision` null; the reasoning label reads "What's your plan?" for new entries; above-fold-only save succeeds; timeline headline selection for both a new decision and a legacy forecast row. Interaction tests use the Testing Library setup — validation behavior must be exercised, not just asserted statically.
>
> **Evidence (perform and show me):** run the suite and paste output; then run the seed, start the dev server, and via a scripted request path (server action invoked from a test or script as the demo user), create one decision entry and attempt one save with an empty criterion; query the database and print the created row's `decision`/`text`/`prediction_kind` to prove the split persisted, and confirm the rejected attempt wrote nothing; fetch the timeline page HTML and grep it to show the new entry's headline is the decision text and a legacy forecast's is its claim.
>
> Propose the plan first.

**Review — paste:**
> Use the security-reviewer subagent: the decision/text assignment is server-side and unspoofable, both fields validated server-side with no client-only enforcement, no path writes a row with an empty decision, and RLS/user scoping intact on every touched path. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Require decision and success criterion at capture`, and push. If anything blocking is found, stop and report — no commit.

**👁 After this session:** "Turning down the contract" is a savable, timeline-visible entry, proven by scripted evidence rather than eyeballs. Forecasts can no longer be created. Scoring unchanged; nothing subjective exists yet.

---

## ▶ SESSION 22 — the subjective layer, insights, docs, copy, and ship (~2.5 hrs, six prompts)

### Prompt 1 of 6 — resolve gains the reflection (Sonnet)

`claude` → `/clear` → `/model sonnet` → plan mode → paste:

> Read CLAUDE.md, §2.2 of `docs/06-decision-layer.md`, and the existing resolve screen implementation.
>
> Add the subjective layer to resolve, rendered **only when the entry's `decision` is non-null** — every new entry qualifies, but legacy forecast rows must still render exactly today's resolve screen, so the conditional stays: heading "Knowing what you know now — was this the decision you wanted to have made?", a free-text `reflection` textarea (sub-line "As much or as little as you like."), and three optional one-tap stance options labeled "Stand by it" / "Mixed" / "Wouldn't again" mapping to the enum. Both optional, never gating the verdict. Persist reflection + stance **atomically with** verdict and outcome_note in the one existing Server Action; frozen after save (no edit path).
>
> Extend the post-mortem: its prompt now also receives the reflection and stance as **capped excerpts** (same budget constant), and its system-prompt constraints are extended explicitly: the reflection is the user's self-report to be quoted or referenced, never endorsed or contradicted; no judging the decision; no invented numbers; all existing merit-rule bans apply to the new material.
>
> Tests: the section is absent for a legacy row with `decision` null; atomicity — a transaction test proving verdict + note + reflection + stance land together or not at all (no half-written row on induced failure); frozen-after-save (no mutation path exists, asserted); an oversized reflection produces a capped prompt; stance values outside the enum rejected server-side. Every new string passes the CLAUDE.md copy rule.
>
> **Evidence (perform and show me):** suite output; then scripted as the demo user: resolve one seeded decision entry with reflection + stance, print the persisted row; trigger the post-mortem for it and paste the generated text so I can see it references the reflection without judging it; resolve one legacy forecast row and print its row showing stance/reflection null.
>
> Propose the plan first.

**Review — paste:**
> Use the security-reviewer subagent: reflection/stance persist only through the resolve action, only for entries with `decision` non-null, scoped to the owner; frozen post-save with no mutation path; post-mortem excerpting enforced at prompt assembly; enum validated server-side. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Add reflective resolution layer for decisions and feed it to the post-mortem`, and push. If anything blocking is found, stop and report — no commit.

### Prompt 2 of 6 — insights: the cross-stat and the seed (Sonnet)

*Scope note: the per-type breakdown row is **cut** — see START HERE, consequence 3. `byEntryType` keeps its tests and ships no UI. Do not render it.*

`/clear` (stay on Sonnet) → plan mode → paste:

> Read CLAUDE.md, §2.3 of `docs/06-decision-layer.md`, and the insights page implementation.
>
> One addition to /insights, consuming Session 21's `outcomeByStance` — no inline math in components: a slim **"Decisions"** section, with copy of exactly this shape: "Of decisions where your criterion was met, you'd make {x}% again. Where it wasn't, {y}%." Below threshold per group: the honest lock state, never a noisy number. One muted sub-line, descriptive only: "Outcome and satisfaction are recorded separately — this shows how they relate for you."
>
> Do **not** render a per-type or decisions-vs-forecasts breakdown. `byEntryType` stays in the scoring module with its tests, unrendered, by decision.
>
> **Seed update:** add ~24 seeded decision entries to the demo account — 6 per outcome×stance quadrant (met+stand_by, met+wouldnt, missed+stand_by, missed+wouldnt) — with realistic reflections. The count is deliberate: `outcomeByStance` gates each group on BIAS_UNLOCK_N (10), so ~12 met and ~12 missed stanced entries are required for the section to demo with real numbers instead of lock states; verify both groups clear the gate after seeding. Keep the seed idempotent; embed the new rows via the existing backfill path. Leave the existing seeded forecast rows in place as legacy data.
>
> Tests: the section at 0, at just-below-threshold, and at healthy n; copy passes the merit rule (no rendered string evaluates a decision); seed idempotency with the new rows.
>
> **Evidence (perform and show me):** suite output; run the seed twice and print the decision-entry count both times (idempotency proven); fetch /insights as the demo user and grep the HTML for the Decisions section showing real crossed numbers; print the `outcomeByStance` result computed directly from the seeded rows and confirm it matches what the page renders; grep the rendered HTML to confirm no per-type breakdown row appears.
>
> Propose the plan first.

**Review — paste:**
> Use the scoring-verifier subagent: all numbers from the scoring module, lock thresholds consistent with the existing gates, and no rendered string — including the sub-line — evaluates decision quality. Report findings with file:line. If the review passes with no blocking findings, stage this prompt's files explicitly by name, commit as `Add decisions section to insights and seed the outcome-stance quadrants`, and push. If anything blocking is found, stop and report — no commit.

### Prompt 3 of 6 — internal docs catch up (Sonnet, ~15 min)

*Docs only, no code. These two describe the old prediction-first app and nothing else in the runbook updates them — and one of them is read as spec by the capture build.*

`/clear` → `/model sonnet` → plan mode → paste:

> Read `docs/05-how-ivyra-works.md`, `docs/02-application-rundown.md`, and `docs/06-decision-layer.md`. The product now captures **decisions only**: two required fields (the decision, and the success criterion that gets scored), no pure forecasts creatable. Update the first two docs to match, preserving each document's voice, structure, and level of detail. Do not touch code or any marketing surface in this prompt.
>
> For `05-how-ivyra-works.md`: Part 1's "one repeating loop over one kind of record" now opens on a decision and its success criterion; the capture flow in Part 3 gains the second required field; §4.5's frozen-words/deterministic-numbers rule extends over the reflection and stance (recorded, never scored); the glossary gains **decision**, **success criterion**, **stance**, and **reflection**. Keep it strictly linear — every term still defined before use.
>
> For `02-application-rundown.md`: update §4.5 and every capture-related section so the two-required-field form is the described behavior, and the scoreable claim is always `text`.
>
> In both: legacy rows with `decision` null are historic forecasts that still render and still score — say so once, plainly, wherever it fits.
>
> Show me the full diff of both docs as evidence. Then stage explicitly by name, commit as `Update internal docs for decisions-only capture`, and push.
>
> Propose the plan first.

### Prompt 4 of 6 — marketing surfaces realign (Sonnet, ~20 min)

*The freeze is lifted — see START HERE, consequence 4. This is the only prompt in the runbook permitted to touch user-facing marketing copy.*

`/clear` → `/model sonnet` → plan mode → paste:

> Read CLAUDE.md and `docs/06-decision-layer.md`. The product captures decisions only, and the marketing still describes forecasting. Realign it.
>
> The new one-liner, already decided — use it verbatim wherever the old one appears: **"a decision journal that scores your expectations against real outcomes."**
>
> 1. Find every user-facing marketing surface: the landing page, the README, page metadata and titles, Open Graph/social tags, and any onboarding or empty-state copy that describes what the app is for. List them with file:line **before** editing anything.
> 2. Replace the old positioning with the new one. The app is for decisions you're making, not predictions about the world; every entry pairs a decision with a checkable success criterion; the scoring is deterministic and the app never grades the decision itself.
> 3. The CLAUDE.md **"calibration only, never merit"** rule governs every string you write. In particular: never claim the app scores decisions, rates decision quality, or tells the user whether a call was good. It scores the criterion; it reports; it does not judge. Flag any existing copy that already breaks this rule.
> 4. Do not touch `docs/`, the resume, or anything under test — docs were handled in the previous prompt.
>
> **Evidence (perform and show me):** the full diff; then grep the built output for the old one-liner and show zero matches; and list every new user-facing string you wrote so I can read them in one place.
>
> Then stage explicitly by name, commit as `Reposition marketing copy for decisions-only`, and push.
>
> Propose the plan first.

### Prompt 5 of 6 — the copy sweep (Sonnet, ~15 min)

`/clear` → plan mode → paste:

> Read CLAUDE.md. Final pass for the decision layer:
> 1. Grep every user-facing string touched or added in Sessions 21–22 against the "calibration only, never merit" rule and the banned-phrasing list; report anything questionable with file:line before changing it.
> 2. Consistency check across every surface, now that marketing has been realigned: the landing page, README, page metadata, `docs/`, and the in-app copy must all describe the same product. Grep for any surviving reference to forecasts, predictions-about-the-world, or the old one-liner on a surface that should now say decisions; report each with file:line. Identify the pre-Session-21 commit hash from the log and show me `git diff <that hash>..HEAD --stat` so I can see the full footprint of these two sessions.
> 3. Update `docs/04-journal-reframe.md`'s shelved table per §5 of `docs/06-decision-layer.md`: mark the decision split un-shelved in its narrower decisions-only form, mark the per-type breakdown as built-but-unrendered, and add the "LLM/self-scored decision quality — rejected permanently" row with its rationale.
> 4. When 1–3 are done and shown to me: stage explicitly by name, commit as `Update shelved table for the decision layer; verify marketing unchanged`, and push.
>
> Propose the plan first.

### Prompt 6 of 6 — deployment verification (Sonnet, ~10 min)

`/clear` → plan mode → paste:

> The decision layer just pushed to main and Vercel is deploying. Verify production without a browser:
> 1. Poll https://ivyra.app until the deployment is live (curl; compare a response marker — e.g., a string added this session — against the previous deploy, retrying up to ~5 minutes).
> 2. Curl the landing page and confirm: HTTP 200, the **new** one-liner present, and **zero** occurrences of the old one-liner or any surviving forecast-first positioning.
> 3. Curl /insights and the sign-in page and confirm 200/redirect behavior is sane for an unauthenticated caller (no stack traces, no 500s).
> 4. Report each check with the actual response evidence (status codes, matched strings).
>
> If any check fails, stop and report — do not attempt fixes in this prompt.

**👁 After this session:** the layer is live, proven by scripted checks end to end. The one remaining human act is below — and it is not optional ceremony.

---

## The gate before anything else happens

**Dogfood for two to three weeks.** Log your own real decisions — the job-search ones are right there: "do I take this interview loop," "do I send this cold message."

The repositioning that used to sit behind this gate has moved into the build (Prompt 4 of Session 22), because copy describing a product that no longer exists is worse than copy written slightly early. What remains behind the gate is everything the words can't settle: whether two required fields is the right amount of friction, whether the stance question gets answered honestly or skipped, whether the outcome×stance cross tells you anything you didn't already know. Those are revisions to make from data, not from intent — and the one-liner is cheap to change again if three weeks of use says it's wrong.

This is the single step no prompt can perform for you, because it *is* the product.
