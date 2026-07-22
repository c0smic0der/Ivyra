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
