# 06 — The Decision Layer

*Design spec. Companion to `02-application-rundown.md` (the definitive spec), `04-journal-reframe.md` (the shipped reframe), and `07-decision-layer-runbook.md` (the build steps for this document). This document un-shelves the decision/forecast split from the 04 doc's shelved table and adds a second, subjective resolution layer on top of it.*

> **Positioning note — read this first.** This is an **additive feature, not a rename.** The landing page, README, resume line, and the "a journal that scores your expectations against real outcomes" one-liner all stay exactly as they are until this layer has been dogfooded for at least two to three weeks of real personal use and has earned a repositioning. The 04 reframe shipped this week; the product does not rebrand twice in one breath. Marketing changes are explicitly out of scope for the runbook.

---

## 1. What this adds, and why

Today the app captures forecasts: checkable claims about the world. This layer makes **decisions** first-class: things explicitly in the user's control ("I'm turning down the contract"), which is both closer to the journaling identity and closer to what the analytics are ultimately *for* — helping someone make better calls, not just better guesses.

The design threads a needle that naive "score my decisions" products fall through. A decision cannot be Brier-scored directly, because "did it go well?" is not a yes/no fact about the world — and letting either the user's mood or an LLM grade outcomes would corrupt the one un-fakeable thing the product has: deterministic calibration against reality. It would also commit the **resulting fallacy** — judging decision quality by outcome quality — which is the specific cognitive error serious decision-journal practice exists to fight (a good decision can turn out badly; a bad one can get lucky).

The needle-threading: **resolution becomes two layers.**

**The objective layer** (scored, unchanged mechanics): every decision entry carries a **success criterion** — a checkable claim about how the decision plays out ("they come back with a full-time offer by end of September"). Confidence attaches to the criterion; the criterion resolves yes/no/void; Brier, calibration, bias, and boldness compute exactly as today. The scoring engine does not feel this feature at all.

**The subjective layer** (unscored, new): at resolve time, decision entries additionally ask — *"Knowing what you know now — was this the decision you wanted to have made?"* — answered in free text, with an optional one-tap stance: **stand by it / mixed / wouldn't again.** This is the before-and-after journal in the user's own words, frozen like everything else once saved.

**The payoff analytic** — deterministic, merit-rule-compliant, and possessed by no competitor: **outcome × stance, crossed.** The app reports the relationship between the user's own two judgments:

> "Of decisions where your criterion was met, you'd make 80% again. Of decisions where it wasn't, you'd still make 40% again — for you, a bad outcome doesn't automatically mean a bad decision."

The app never judges a decision. It reports the frequency relationship between two answers *the user supplied* — which is exactly the resulting-fallacy lesson, rendered as the user's own data.

## 2. The two layers, specified

### 2.1 Capture (the un-shelved split, unchanged from the 04-era design)

Two fields replace the single claim field, with copy verbatim from the original spec: **"What are you deciding, or what do you expect?"** (sub: "A choice you're making, or a call about how something goes.") and **"How will you know it went well?"** (sub: "Something you can answer yes or no to later."). The second field **auto-mirrors** the first until the user edits either; identical fields on save persist as a pure forecast (`decision` null — today's exact semantics), differing fields persist the first to `decision` and the second to `text`. The scoreable claim is always `text`.

The kind rule: **`decision` non-null ⇒ `prediction_kind` = 'self'** ("What's your plan?"); otherwise the existing self/world branch applies. Rationale: a decision means the user is an actor, so a plan question is coherent even when the criterion is world-flavored.

Layout contract holds: decision/claim, criterion, Confidence, Resolves above the fold and savable alone; reasoning and plan/disconfirm below, optional, never gating. The 60-second activation target survives because pure forecasts never touch field two.

### 2.2 Resolve (the new layer)

The existing resolve screen — frozen claim, "Read what you wrote," verdict buttons, "How did it actually go?", atomic save — gains one section, rendered **only when the entry is a decision** (`decision` non-null; the question is meaningless for pure forecasts):

```
│  Knowing what you know now — was this      │
│  the decision you wanted to have made?      │
│  ┌───────────────────────────────────────┐  │   ← free text, optional,
│  │ Honestly yes. The offer never came,   │  │     frozen once saved
│  │ but staying would have meant…         │  │
│  └───────────────────────────────────────┘  │
│  ( Stand by it )  ( Mixed )  ( Wouldn't again )   ← optional one-tap stance
```

Rules: both fields optional, never gating the verdict; persisted atomically with verdict and outcome note; frozen after save like every other reflective field; the stance is a **self-report the app records**, never a grade the app assigns.

### 2.3 The analytics

Three additions, all deterministic, all computed in the scoring module with tests, all lock-stated below sample thresholds:

**Outcome × stance cross** (decision entries with both a verdict and a stance): for criterion-met and criterion-missed groups separately, the percentage the user would stand by. Rendered in insights as a small "Decisions" section with copy of the §1 shape — frequencies of the user's own answers, full stop.

**Per-type breakdown returns** (from the old shelved work): "Decisions — says 80% · lands 45% / Forecasts — says 70% · lands 66%", deterministic on `decision IS NULL`.

**Post-mortem gains a third input**: the frozen reasoning, the outcome note, and now the reflection + stance (capped excerpts, same budget discipline). The diff gets richer — "you were 75% sure they'd counter; they didn't, and you'd still decline again — your reasoning named the downside risk and you accepted it" — while the standing prompt constraints (report, never judge; no invented numbers) are extended to cover the new input explicitly.

Timeline: decision entries render `decision` as the headline (the choice, not its side effect); forecasts render `text` as today.

## 3. Data model delta

```
predictions
  + decision     -- nullable text. Non-null ⇒ decision entry; `text` holds its
                 --   success criterion. Null ⇒ pure forecast, today's semantics.
  + stance       -- nullable enum: 'stand_by' | 'mixed' | 'wouldnt_again'.
                 --   Only ever set at resolve, only for decision entries.
  + reflection   -- nullable text. The "knowing what you know now" answer.
                 --   Written at resolve; frozen after.
  ~ prediction_kind -- derived at write time via one exported kindFor(entry).
```

**No backfill anywhere** — null is the correct historic value for all three columns (every existing row is a pure forecast with no reflection). The scoring engine gains two additive, tested functions (`byEntryType`, `outcomeByStance`) reusing the existing buckets and the exported `resolvedNonVoid` predicate, never reimplementing them.

## 4. What this deliberately does NOT do

No LLM ever judges an outcome or a decision — the subjective layer is user-authored and the app only reports relationships between the user's own answers. No score is ever computed from stance — it is context, not input, to every calibration number. No "good decision / bad decision" labels anywhere; the CLAUDE.md "calibration only, never merit" rule extends over every new string, including the cross-stat copy and the post-mortem's expanded prompt. And no marketing changes: landing, README, resume, and one-liner are frozen until the dogfooding gate in the positioning note clears.

## 5. Bookkeeping

The 04 doc's shelved table: mark the **decision/forecast split** and **per-type insights breakdown** rows as *un-shelved by this document*; add one row — "LLM- or self-scored decision quality — **rejected permanently**: violates deterministic-scoring thesis and commits the resulting fallacy; the subjective layer records, the objective layer scores, and they never mix." Estimated cost: two sittings, five prompts, three nullable columns, zero changes to existing scoring functions — see `07-decision-layer-runbook.md`.
