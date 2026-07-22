# Follow-ups

Deferred work, with enough context to pick up cold. Not a backlog of features —
these are known gaps in shipped code.

## Fully-atomic per-user daily AI cap (cost guardrail hardening)

**Status:** open. **Severity:** low (self-inflicted cost only; never cross-tenant).

**Problem.** The per-user daily cap (`DAILY_AI_CALL_CAP`, `src/lib/ai/enrichCore.ts`)
is enforced as read-then-act: `countAiCallsToday()` reads the count, then the
call is made and logged. Between the read and the log, concurrent requests all
observe the same pre-increment count and all pass the gate — a user firing N
requests at once can exceed their own cap. This is **codebase-wide**, not unique
to one path:

- `src/app/predictions/[id]/postmortem/route.ts` — post-mortem stream. *Partially
  mitigated:* now reserves the `ai_calls` row via `reserveAiCall()` before
  streaming, narrowing the window to the gap between count and insert (was the
  full multi-second stream).
- `src/lib/ai/enrich.ts` (`enrichPrediction`) — capture-time enrichment. Still
  read-then-log.
- `src/app/predictions/new/trackRecordAction.ts` — draft-time embed. Still
  read-then-log.

**Fix.** Replace the count-then-insert with a single atomic conditional insert in
the shared cap machinery so all three paths inherit it. Sketch:

```sql
INSERT INTO ai_calls (user_id, purpose, model, ...)
SELECT $1, $2, $3, ...
WHERE (
  SELECT count(*) FROM ai_calls
  WHERE user_id = $1 AND created_at >= date_trunc('day', now() at time zone 'utc')
) < $cap
RETURNING id;
```

Zero rows returned ⇒ over cap (skip the model call); a returned id ⇒ slot
reserved atomically, no window. Wrap this as `reserveAiCallIfUnderCap(...)` in
`src/lib/ai/enrich.ts` and route `enrichPrediction`, the track-record embed, and
the post-mortem through it, replacing their separate `countAiCallsToday` +
`isUnderDailyCap` checks. Keep `finalizeAiCall()` for filling real token counts
after the call. Unit-test the boundary (at cap ⇒ no insert; under cap ⇒ insert).

## Atomic reminder idempotency (cron, Session 9)

**Status:** open. **Severity:** low (requires a concurrent invocation — in
practice a leaked `CRON_SECRET` racing the real cron run — and is bounded to a
one-time duplicate-email burst, not an unbounded resend loop).

**Problem.** The reminders cron (`src/app/api/cron/reminders/route.ts`) marks a
prediction reminded with the same **read-then-write** pattern as the AI cap
above: `findPredictionsDueToday()` reads rows where `reminded_at IS NULL`
(`src/lib/reminders/query.ts`), the route sends the email, and only *then* calls
`markReminded()` to set `reminded_at`. Two overlapping invocations can both read
the same unmarked rows before either marks them, and both send. A sequential
second call in the same window already sends nothing (the `isNull` filter plus
`notYetReminded()` in `src/lib/reminders/remindersCore.ts` catch that case) —
this gap is concurrency-only. There's also no per-run cap on how many due users
one invocation emails.

**Fix.** Same shape as the AI cap fix — collapse the read and the mark into one
atomic conditional statement instead of two round-trips:

```sql
UPDATE predictions
SET reminded_at = now()
WHERE status = 'open' AND resolution_date = $1 AND reminded_at IS NULL
RETURNING id, user_id, text;
```

Send off the *returned* rows instead of a separately-read set — that structurally
caps each row to one send, no window between claim and mark. Optionally add a
`LIMIT` as a fan-out backstop. **Worth doing together with the AI-cap fix above**:
both are "read count/rows, act, then write" races in this codebase: the same
`UPDATE ... WHERE <condition> RETURNING ...` / conditional-insert pattern closes
both, so a shared helper or at least a shared write-up of the pattern (README
note, or a small `atomicClaim`-style utility) avoids solving the same race twice.

## Early resolution (feature — its own commit)

**Status:** open. **Type:** product feature, not a bug.

**What.** Let a user resolve ANY open prediction early, not only ones whose
`resolution_date` has arrived. Today the only entry into the resolve flow is the
dashboard's "Due for resolution" list (`resolution_date <= today`); a prediction
you already know the outcome of (event happened ahead of the deadline, plan
abandoned, etc.) can't be closed until its date passes.

**How.** Add a "Resolve" affordance on the prediction detail page for any
`status = 'open'` row (in addition to the existing due-list entry). It reuses the
exact same resolve path — no new scoring or mutation logic:

- The resolve Server Action (`src/app/predictions/[id]/resolve/actions.ts`)
  already gates only on `status = 'open'`, NOT on the date — so it accepts an
  early resolution as-is. Verify no date guard needs adding; it doesn't today.
- The resolve page (`src/app/predictions/[id]/resolve/page.tsx`) already renders
  for any open row. The missing piece is only the *entry point* from the detail
  page (which doesn't exist yet — see note below).

**Honesty guardrail.** Criteria + reasoning are already frozen at creation, so
early resolution stays un-gameable — that's the whole reason this is safe to add.
Include one **soft, non-blocking** note (a warning, never a hard block) when a
`world`-kind prediction is being resolved **NO before its resolution_date** — i.e.
calling a not-yet-due world event as already failed. Phrase it as "resolving this
before its date — are you sure the outcome is settled?" The user can proceed. Do
NOT show it for `self` predictions (abandoning your own plan early is a legitimate
NO) or for early YES (the event demonstrably happened).

**Prereq / note.** There is no prediction *detail* page yet (`/predictions/[id]`)
— only the capture (`/new`) and resolve (`/[id]/resolve`) routes exist. This
feature either needs that detail page built first, or the affordance can live on
the dashboard's open (upcoming) list as an interim "Resolve early" link. Decide
which when picking this up. Add a test for the soft-note trigger predicate
(`world` + NO + before date ⇒ warn; all other combinations ⇒ no warn) as pure
logic, mirroring the resolveCore/postmortemCore split.

## Product decision: allow same-day predictions at all? (undecided)

**Status:** open QUESTION — not yet a task. Owner: product (user), deferred by
explicit choice this session; do not change validation on a whim.

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
