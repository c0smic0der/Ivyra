# Follow-ups

Deferred work, with enough context to pick up cold. Not a backlog of features —
these are known gaps in shipped code.

## Reasoning-group hit counts re-derive "count YES in a group" (scoring-drift note)

**Status:** open — **deliberate defer, not an oversight.** **Severity:** low.

**Context.** `buildReasoningGroups` (`src/lib/insights/scopedInsightView.ts`) counts
per-group hits/n directly (`hits.length` / `members.length`) rather than sourcing them
from the scoring module's `calibrationByGroup` (`src/lib/scoring/index.ts`). These "X of
N hit" numbers are fed to the LLM prompt, so they're a second implementation of "count
YES outcomes in a group" living outside the FULLY-TESTED scoring module — a latent drift
point (surfaced in the scoped-insight scoring review alongside the `profileBoldness`
duplication, which WAS fixed by extracting `boldnessRatio`).

**Why deferred, not fixed now.** Lower stakes than the boldness case: boldness feeds the
*profile*, so a drift there flips coaching between "commit harder" and "shift your numbers
down" — this is just a per-group hit count with no such lever, and it's already covered by
`scopedInsightView.test.ts`. Consolidating it onto `calibrationByGroup` is more invasive
than the boldness extraction (the group shapes / example-selection differ, not just the
tally), so it's a deliberate scope decision to leave one tested tally in place rather than
reshape the group builder mid-session. Fix when the reasoning-group view is next touched:
have `buildReasoningGroups` take its counts from `calibrationByGroup` so there's one
implementation of the group tally.

## Standing rule: new cron endpoints must carry the reminders-route auth guard

**Status:** open — **standing rule, not an outstanding fix.** **Severity:** n/a
(preventive; nothing broken today).

**From the reminders-cron security review.** The reminders route
(`src/app/api/cron/reminders/route.ts`) authenticates every invocation with
`isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)`
(`src/lib/reminders/remindersCore.ts`), which does a **constant-time**
`Bearer ${CRON_SECRET}` compare via `timingSafeEqual` and refuses to authorize
against an unset/empty secret — with the secret handled **server-only** (never
shipped to the client, never in a URL or log). Any future cron endpoint MUST
carry the same guard: reuse `isAuthorized` (or replicate its constant-time
compare and empty-secret refusal exactly), server-only key handling included. No
ad-hoc string `===`, no timing-leaky check.

**Why this is a note and not a task yet.** There is no second cron to fix. The
scoped AI insight was originally sketched as a monthly cron but shipped as an
**on-demand** Server Action instead (`src/app/insights/actions.ts` —
`generateInsight`, see the AI-cap item above), so no new cron endpoint exists in
the app right now. This is recorded so the guard isn't forgotten the next time
one *is* added (digest emails, scheduled recomputation, etc.) — carry it over from
day one rather than bolting it on after review.

## Early resolution (feature — its own commit)

**Status:** open. **Type:** product feature, not a bug.

**What.** Let a user resolve ANY open prediction early, not only ones whose
`resolution_date` has arrived. Today the only entry into the resolve flow is the
dashboard's "Due for resolution" list (`resolution_date <= today`); a prediction
you already know the outcome of (event happened ahead of the deadline, plan
abandoned, etc.) can't be closed until its date passes.

**How.** Add a "Resolve early" affordance on the dashboard's open/upcoming list
(the card surface for `status = 'open'` rows), alongside the existing due-list
entry. It reuses the exact same resolve path — no new scoring or mutation logic:

- The resolve Server Action (`src/app/predictions/[id]/resolve/actions.ts`)
  already gates only on `status = 'open'`, NOT on the date — so it accepts an
  early resolution as-is. Verify no date guard needs adding; it doesn't today.
- The resolve page (`src/app/predictions/[id]/resolve/page.tsx`) already renders
  for any open row. The missing piece is only the *entry point*: a "Resolve
  early" link on each open-list row (see note below).

**Honesty guardrail.** Criteria + reasoning are already frozen at creation, so
early resolution stays un-gameable — that's the whole reason this is safe to add.
Include one **soft, non-blocking** note (a warning, never a hard block) when a
`world`-kind prediction is being resolved **NO before its resolution_date** — i.e.
calling a not-yet-due world event as already failed. Phrase it as "resolving this
before its date — are you sure the outcome is settled?" The user can proceed. Do
NOT show it for `self` predictions (abandoning your own plan early is a legitimate
NO) or for early YES (the event demonstrably happened).

**Where the affordance lives (decided).** On the dashboard's open/upcoming list
(or the equivalent card surface for open rows) — NOT a prediction detail page.
This was an open question when first written; it's now settled. Per-prediction
detail pages (`/predictions/[id]`) were **deliberately removed** in favor of
self-contained resolution cards in the `/insights` history list, and
`/predictions/[id]/resolve` now redirects an already-resolved row straight to its
card. So do **not** build a detail page to host this affordance — that would
reintroduce exactly the surface we deleted on purpose. Put the "Resolve early"
link on the open-list row itself.

Add a test for the soft-note trigger predicate (`world` + NO + before date ⇒
warn; all other combinations ⇒ no warn) as pure logic, mirroring the
resolveCore/postmortemCore split.

## Product decision: allow same-day predictions at all? (DECIDED — YES, shipped)

**Status:** DONE. **Decision: yes — a resolution date of today is allowed at
creation.** Both gates were changed together: server refine relaxed from `>` to
`>= today` with the message renamed to "Resolution date can’t be in the past"
(`src/lib/predictions/validation.ts`), and the client `min` moved from tomorrow to
today (`src/app/predictions/new/PredictionForm.tsx`). The `validation.test.ts`
today-dated case flipped from reject → accept; past dates are still rejected.

**Reasoning (recorded, not deleted).** Fast feedback loops are the mechanism the
whole calibration research base rests on — weather forecasters are well-calibrated
precisely because they're scored daily, and the training studies that moved the
needle used rapid cycles. Long-horizon-only predictions yield a few dozen
resolutions a year; short-horizon ones yield hundreds, which is what actually
drives improvement rather than just recording it. The "already knows the answer"
concern is real but weak: a user can equally log a next-week prediction they've
already got wired, so the restriction added friction to honest short-horizon use
without preventing self-deception — and it becomes moot once early resolution ships
(a same-day prediction is just the shortest horizon; early resolution closes an
already-settled one before its date). The two are still independent: this is about
what dates capture accepts; early resolution is about closing an open row early.

**Original question and arguments preserved below for context.**

**Status (original):** open QUESTION — not yet a task. Owner: product (user),
deferred by explicit choice this session; do not change validation on a whim.

**Context.** Capture validation currently requires a **strictly future**
resolution date, enforced in two places:

- Server: `src/lib/predictions/validation.ts` — refine `resolutionMidnight >
  todayMidnight` ("Resolution date must be in the future").
- Client: `src/app/predictions/new/PredictionForm.tsx` — the date input's `min`
  is set to **tomorrow**.

**The question.** Should a resolution date of **today** be allowed at creation?
Arguments both ways:

- *For:* the rundown's retention note (`docs/02-application-rundown.md` §15)
  explicitly says to **encourage short-horizon predictions**; a same-day
  prediction is the shortest horizon and lowers the barrier to a first log.
- *Against:* a same-day prediction is resolvable the instant it's created, which
  invites low-stakes "already know the answer" entries that dilute the
  calibration signal. The frozen-reasoning discipline matters less if there's no
  time gap between prediction and outcome.

**If the answer is yes:** change both gates together — server refine to `>=`
(today allowed), client `min` to today — and adjust/rename the "must be in the
future" message. Keep the tests in `validation.test.ts` in sync (a today-dated
input flips from reject → accept). This is distinct from the early-resolution
feature above: early resolution closes an *already-open* prediction before its
date; same-day *creation* is about what dates are allowed at capture. They can
ship independently.

**Note:** unrelated to how test data was unblocked this session (open rows were
backdated directly in the DB, validation left intact) — that was a throwaway, not
a precedent for this decision.
