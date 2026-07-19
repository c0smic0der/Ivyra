# The Science of Calibrated Judgment — A Ground-Zero Primer

*This document teaches the entire knowledge domain your product sits on, assuming zero background. Read it and you'll understand calibration, forecasting, scoring, and the decision science better than almost anyone you'll talk to about the project. It is deliberately deep. A glossary and reading list sit at the end.*

---

## 1. The problem: we are bad at knowing how much we know

Every day you make judgments under uncertainty: *this deal will close, this feature will ship on time, this candidate will thrive, this relationship is going somewhere.* You feel a degree of confidence in each. The uncomfortable, heavily-replicated finding from decades of research is that **those confidence feelings are systematically wrong** — usually too high — and, worse, we almost never find out, because we don't track them.

Two forces make this invisible:

- **Overconfidence.** When people say they're "90% sure," the thing happens far less than 90% of the time. When asked for a range they're "98% confident" contains the true value, the truth falls outside that range 30–40% of the time. This isn't stupidity; it's a stable feature of human cognition.
- **Hindsight bias.** After an outcome, we unconsciously rewrite our memory of what we predicted ("I knew it would happen"). This destroys the one signal we'd need to improve. The only defense is to **write the prediction down, with a number, before the outcome is known** — which is the entire mechanic of your product.

The optimistic half of the research: this is a **trainable skill**, not a fixed trait. That's what makes a *tool* worth building — there's something to get better at, and a feedback loop that produces the improvement.

---

## 2. What "calibration" actually means

**Calibration** is a property of a *set* of probabilistic judgments, not of any single one. You are perfectly calibrated if:

> Of all the times you say "70%," the event happens about 70% of the time. Of all the times you say "90%," it happens about 90% of the time. And so on across every confidence level.

The canonical example is a weather forecaster. A forecaster who says "30% chance of rain" is *well-calibrated* if it actually rains on about 30% of the days they issue that forecast — even though on any single such day they're "wrong" more often than right (it doesn't rain 70% of the time). Calibration is about the *long-run honesty of your numbers*, not about being right on any one call.

This is the crucial mental unlock, and most people never grasp it: **a single prediction can't be calibrated or miscalibrated. Only a track record can.** That's why your product needs volume before it can say anything, and why the value compounds over time.

### 2.1 Calibration is not the same as being accurate

This distinction is the conceptual heart of the whole field, so slow down here. There are two separable virtues in a forecaster:

- **Calibration (a.k.a. reliability):** do your stated probabilities match reality? *Are your 70%s really 70%s?*
- **Resolution (a.k.a. discrimination or sharpness):** how *decisive and informative* are you? Do you push confidently toward 10% and 90% when warranted, or do you hedge everything toward 50%?

You can be perfectly calibrated and useless. Someone who predicts the long-run base rate for everything — "50% the coin is heads," "12% it rains today" — can be beautifully calibrated while telling you nothing actionable. A great forecaster is calibrated **and** high-resolution: confident when the situation warrants it, and right to be.

A landmark 1973 result (**Murphy's decomposition**) makes this mathematically exact. Your overall score breaks into three parts:

```
Score = Uncertainty − Resolution + Reliability(calibration error)
```

- **Uncertainty** is how inherently unpredictable the events are (you can't control this).
- **Resolution** you want *high* (it subtracts from — improves — your score).
- **Reliability/calibration error** you want *low* (it adds to — worsens — your score).

The practical lesson for your product's design: **if you only reward calibration, users can game it by hedging to 50%.** A good tool watches both dimensions, or at least nudges users toward making sharp calls rather than safe ones.

---

## 3. How you score a probability objectively

This is the part that makes the whole thing rigorous rather than vibes — and it's deliberately simple math with **no subjective judgment**. Given a prediction and an outcome, there is one exact number for how good the prediction was. This section walks through it slowly, assuming your math is rusty. The only operations used in the whole section are subtraction, multiplying a number by itself, and taking an average. That's genuinely it.

### 3.0 Two conventions before anything else

**Probabilities are written as decimals, not percentages.** "70% confident" is written as **0.7**. "90%" is **0.9**. "50%" is **0.5**. To convert, divide the percentage by 100. All the math below uses the decimal form.

**Outcomes are turned into numbers.** When a prediction resolves, we record what happened as:
- **1** if the thing happened (YES)
- **0** if it didn't (NO)

Why? Because now "what you said" (a number between 0 and 1) and "what happened" (either 0 or 1) live on the same scale, and we can measure the *distance* between them. That distance is the whole game: a good prediction is one that landed *close* to reality. If you said 0.9 and reality was 1, you were only 0.1 away — great. If you said 0.9 and reality was 0, you were 0.9 away — terrible.

### 3.1 The Brier score

**The idea in one sentence:** take how far your stated probability was from what actually happened, and square it.

For a single yes/no prediction:

```
brier = (probability − outcome)²
```

Read that formula out loud, left to right: *"Take the probability I stated. Subtract the outcome (1 or 0). Then multiply the result by itself."* The little ² ("squared") just means "multiply the number by itself": 0.3² = 0.3 × 0.3 = 0.09.

**Let's do one together, every step written out.** You said 70% (so p = 0.7) that you'd finish a project by Friday. You did finish — outcome = 1.

1. Subtract: 0.7 − 1 = **−0.3**  *(you were 0.3 away from reality)*
2. Square it: (−0.3)² = (−0.3) × (−0.3) = **0.09**  *(a negative times a negative is positive, so the minus sign disappears)*
3. Your Brier score for this prediction is **0.09**.

**Why square it? Two reasons, both practical.**
- *It kills the minus sign.* Sometimes the subtraction gives a negative number (as above). We don't care about the *direction* of the miss, only its *size* — squaring makes everything positive, so misses in either direction count the same.
- *It punishes big misses much more than small ones.* Squaring is gentle on small numbers and brutal on big ones. A miss of 0.1 squares to 0.01 (tiny). A miss of 0.9 squares to 0.81 (huge — 81 times bigger, not 9 times). This is a deliberate design choice: being *slightly* off is nearly free, but being *confidently wrong* costs you enormously. The squaring is where the "overconfidence gets punished" behavior comes from.

**Now the worked table — verify each row yourself with the three steps above:**

| You said | Decimal p | It happened? | Outcome o | Step 1: p − o | Step 2: square it | Read |
|---|---|---|---|---|---|---|
| 90% | 0.9 | Yes | 1 | 0.9 − 1 = −0.1 | (−0.1)×(−0.1) = **0.01** | Excellent — confident and right |
| 90% | 0.9 | No | 0 | 0.9 − 0 = 0.9 | 0.9×0.9 = **0.81** | Brutal — overconfidence punished hard |
| 50% | 0.5 | Yes | 1 | 0.5 − 1 = −0.5 | **0.25** | The "I know nothing" answer |
| 50% | 0.5 | No | 0 | 0.5 − 0 = 0.5 | **0.25** | Same score either way — 50% is a shrug |
| 70% | 0.7 | Yes | 1 | 0.7 − 1 = −0.3 | **0.09** | Good |
| 30% | 0.3 | No | 0 | 0.3 − 0 = 0.3 | **0.09** | Equally good — *unconfident and right* scores just as well |

Notice the last two rows: saying "70% yes" and being right earns the exact same score as saying "30% yes" (i.e., "probably not") and being right. The score doesn't reward optimism or pessimism — only *closeness to reality*.

**Scale and direction:** a single prediction's Brier score always lands between **0 and 1**. **0 is perfect** (you said 100% and it happened, or 0% and it didn't). **1 is the worst possible** (you said 100% and it didn't happen). **Lower is better** — think of it like golf.

**Your overall Brier score** is just the average of your individual ones. In symbols:

```
Brier = (1/N) · Σ (pᵢ − oᵢ)²
```

The notation looks scarier than it is, so decode each piece:
- **N** is how many resolved predictions you have.
- **Σ** (the Greek letter sigma) is math shorthand for "add them all up."
- **pᵢ** and **oᵢ** mean "the probability and outcome of prediction number i" — the little i is just a counter (prediction 1, prediction 2, …). So **(pᵢ − oᵢ)²** is exactly the single-prediction score you already know how to compute.
- **(1/N) ·** at the front means "divide the total by N" — which is just how you take an average.

In plain English the formula says: *"compute the Brier score for each prediction the way we did above, add them all together, divide by how many there are."* That's an ordinary average, nothing more.

**Tiny full example.** You've resolved three predictions: 0.9→hit (score 0.01), 0.6→miss (0.6−0 = 0.6, squared = 0.36), 0.8→hit (0.8−1 = −0.2, squared = 0.04). Overall Brier = (0.01 + 0.36 + 0.04) ÷ 3 = 0.41 ÷ 3 ≈ **0.137**.

**The anchor to remember: always answering 50% gives a Brier of exactly 0.25** (check the table — 50% scores 0.25 whether the thing happens or not, so the average of many of them is 0.25 too). That number, 0.25, is the "shrugging" baseline. If your average is *below* 0.25, your confidence levels carry real information about the world. Trained superforecasters land well below it on genuinely hard questions.

### 3.2 What "proper" means (and why it's the secret sauce)

A scoring rule is called **proper** if the strategy that gets you the best expected score is simply *telling the truth about what you believe*. The Brier score is proper. This is quietly the most important property in the entire domain, so let's see it work rather than take it on faith.

**First, one new idea: judging a strategy by its long-run average.** A single prediction can't tell you whether a reporting strategy is good — in one case you just get lucky or unlucky. So we ask instead: *if you used this strategy over and over, what would your average score be?* That long-run average is called the **expected score**, and computing it needs nothing beyond §3.1's averaging.

**The thought experiment.** Suppose your genuine, inner belief is **70%** — and suppose that belief is accurate, meaning across 100 such situations, about **70 resolve YES and 30 resolve NO**.

*Careful with what "accurate" means here — this is the easiest place in the whole document to stumble.* A 70% prediction is **not** the claim "this will happen" (if it were, an accurate one would mean 100 out of 100 come true). It's the claim *"things like this happen 7 times out of 10"* — a claim that itself predicts 30 misses. Ask what the world must look like for the **number** 70% to have been the correct number: if all 100 came true, the right number was 100% and saying 70% was wrong (too timid); if 40 came true, 70% was wrong again (too bold); only a ~70/30 split vindicates it. Think of a weather forecaster who says "70% chance of rain" on 100 different days — her forecasts are perfect only if it rains on about 70 of them, and the 30 dry days aren't her failures, they're her prediction coming true. So "your belief is accurate" and "70 of the 100 resolve YES" are the same statement in two costumes: the success of a probability is measured on the number, not on the individual events.

Now try out different *reports* against those same 100 cases. One crucial rule: your report changes your **score**, never the **reality** — the world splits 70/30 regardless of what number you write down, because the split comes from your belief being accurate, not from your report.

- **Strategy 1 — report your honest 0.7.** The 70 YES cases each score (0.7−1)² = 0.09. The 30 NO cases each score (0.7−0)² = 0.49. Average over all 100: (70 × 0.09 + 30 × 0.49) ÷ 100 = (6.3 + 14.7) ÷ 100 = **0.21**.
- **Strategy 2 — hedge, report 0.5.** Every case scores 0.25 regardless of outcome (see the table in §3.1), so the average is **0.25**. *Worse than honesty.*
- **Strategy 3 — bluff, report 0.9 to look decisive.** The 70 YES cases each score (0.9−1)² = 0.01. The 30 NO cases each score (0.9−0)² = 0.81. Average: (70 × 0.01 + 30 × 0.81) ÷ 100 = (0.7 + 24.3) ÷ 100 = **0.25**. *Also worse.*

**A notational shortcut you'll see everywhere:** (70 × 0.09 + 30 × 0.49) ÷ 100 is the same arithmetic as **0.7 × 0.09 + 0.3 × 0.49** — dividing the 70 and 30 by 100 first instead of at the end. Written that way, the general pattern is:

```
expected score = (chance of YES) × (score if YES) + (chance of NO) × (score if NO)
```

The two chances always add to 1, which is why this behaves like an ordinary average. Note the subtle role-split: the *chances* (0.7 and 0.3) come from your **belief** about the world; the *scores* in each branch are computed from your **report**. In the honest strategy those are the same number, which can make the formula look like magic — in the bluff strategy you can see them come apart (the world still splits 70/30, but each branch's score uses 0.9).

Honesty (0.21) beats hedging (0.25) and bluffing (0.25) — and it beats every other number you could report, too; 0.7 is the unique best report when 0.7 is what you believe. **The math itself enforces honesty.** A user cannot make themselves look better by sandbagging or by over-claiming; the only way to improve the score is to actually judge better. That's why the output can be trusted, and it's a great thing to be able to explain about your product.

### 3.3 The logarithmic score (the harsher cousin)

The other common proper scoring rule is the **log score**. You don't need to be able to compute it — just know what it is and why we're not leading with it.

It uses the natural logarithm (the `ln` button on a calculator). The mechanics: take the probability you assigned to *the thing that actually happened* — note the difference from Brier: if you said "90% yes" and it *didn't* happen, the probability you gave the actual outcome ("no") was only 10%, so you're scored on 0.1. Your score is `ln` of that number. The only intuition you need: **ln of a number near 1 is near 0 (good), and ln of a number near 0 plunges toward negative infinity (catastrophic).** So if you assign 1% to something that then happens, your score is astronomically bad — one such blunder can wreck an entire track record. Metaculus (a major forecasting platform) uses log scoring. It's more theoretically elegant and more sensitive to catastrophic overconfidence, but it's punishing and unintuitive for normal people. **For a consumer product, lead with Brier** (bounded between 0 and 1, computable by hand, forgiving enough to keep using) and optionally expose log score for power users.

### 3.4 The calibration curve (the chart users will actually care about)

This is the visual payoff, and the good news is there's no new math in it — just sorting and counting.

**How it's built, step by step:**
1. Take every resolved prediction and **sort them into buckets by the confidence you stated**: everything where you said 0–10% goes in one pile, 10–20% in the next, and so on up to 90–100%. (Ten piles total.)
2. For each pile, count two things: *how many predictions are in it*, and *how many of those actually came true*. Divide the second by the first to get the pile's **actual hit rate**. Example: your "80–90%" pile has 10 predictions, 6 came true → hit rate 6/10 = 60%.
3. Plot one dot per pile: the confidence level on the horizontal axis (x), the actual hit rate on the vertical axis (y). For the example pile, the dot sits at x = 85%, y = 60%.

**How to read it:** if you were perfectly calibrated, every dot would land where x equals y — your 85% pile would come true 85% of the time, dot at (85, 85). All such points form the **45° diagonal line** from corner to corner, which is why the diagonal is drawn on the chart as the "perfect" reference.

- Dots **below** the diagonal = **overconfident**. The example dot (said 85%, happened 60%) sits below the line: reality underperformed your confidence. This is the common human pattern.
- Dots **above** the diagonal = **underconfident** — your "60%" calls came true 80% of the time; you knew more than you admitted.

Seeing your own curve sag below the line is the "aha" moment that makes the product sticky. It converts an abstract flaw into a picture of *your* flaw — the vertical gap between each dot and the diagonal is literally the size of your self-deception at that confidence level.

### 3.5 Other diagnostics you'll encounter

- **Expected Calibration Error (ECE):** one number summarizing the whole curve — take each dot's vertical distance from the diagonal, and average those distances (giving more weight to buckets that contain more predictions, so a gap in a pile of 30 counts more than a gap in a pile of 2). Zero means every dot is on the line. Handy as a headline metric.
- **Brier skill score:** your Brier expressed *relative to a baseline* rather than in the raw 0-to-1 units. The formula is `1 − (your Brier ÷ baseline Brier)`; e.g., if the shrug-baseline is 0.25 and yours is 0.205, then 1 − (0.205/0.25) = 0.18 → "you're **18% better than chance**." Same information as the Brier, friendlier to read.
- **Sample-size caveat (design-critical):** a calibration curve built from 8 predictions is noise, the same way a coin isn't "biased" because it came up heads 3 times out of 4 — small piles produce wild hit rates by pure luck. Each bucket needs *dozens* of resolved predictions before its dot means anything. Your UX must show *something* satisfying early (running Brier, streaks, individual resolutions, "12 of ~30 needed for your first curve") while the real curve earns the right to appear. Ignoring this is exactly how these tools feel empty and get abandoned in week one.

### 3.6 Error bars on the dots: Wilson score intervals

The sample-size caveat above can be handled better than a blunt "not enough data" lock. Each dot on the calibration curve can grow **whiskers** — a vertical bar meaning: *given how few predictions this bucket holds, the true rate is plausibly anywhere in this range.* The bar is the honest answer to "is this dot real, or just noise?"

**What the interval means.** A bucket with 3 predictions, all 3 hits, has an *observed* rate of 100% — but observed isn't truth; with 3 samples, luck dominates. The interval asks: *which true underlying rates could plausibly have produced what we saw?* Someone whose true rate is 95% goes 3-for-3 easily; a true 60%-er does it 22% of the time (0.6³) — plausible; a true 20%-er only 0.8% of the time — implausible, so 20% falls outside. For 3-of-3 the Wilson interval works out to roughly **[44%, 100%]**: three straight hits rule out being bad, but can't yet distinguish decent from perfect.

**The machinery, in three ideas:**
1. **Luck averages out at a known speed.** The typical luck-wobble of an observed hit rate is `√(p(1−p)/n)`. The part that matters: **n is in the denominator, so more predictions → smaller wobble.** That is the entire "bars shrink as data grows" mechanism. Six predictions at ~50%: wobble ≈ 0.20. Forty: ≈ 0.08.
2. **The naive bar = observed rate ± about 2 wobbles** (precisely 1.96, called **z** — the number of wobbles that covers ~95% of a bell curve). 3-of-6 → 0.50 ± 0.39 → a huge honest bar; 20-of-40 → 0.50 ± 0.155 → a claim with teeth.
3. **Why Wilson instead of the naive formula:** the naive version breaks on exactly the data a young app has most of. Observed rate 100% → p(1−p) = 0 → zero wobble → interval [100%, 100%] — three data points and the math declares you *provably perfect*. Absurd: the formula trusted the observed rate as gospel while measuring how untrustworthy the observed rate is. **Wilson's fix, as intuition: temper extreme rates from tiny samples by acting as if ~4 phantom predictions (2 hits, 2 misses) were quietly added to the bucket before computing.** Your 3-of-3 becomes effectively 5-of-7 ≈ 71%. Three consequences: the tempered rate can never be exactly 0% or 100% (so the wobble never fake-collapses); the smaller the real sample, the more the phantoms matter (small samples get pulled hardest toward "coin flip, who knows" — the honest stance); and as n grows the 4 phantoms become irrelevant, so Wilson converges to the naive answer exactly when the data has earned trust. The even 2/2 split is tempering toward maximum ignorance (50/50), not toward any opinion; the count ~4 is z² ≈ 1.96² ≈ 3.84, and falls out of the algebra naturally — demand 99% confidence (z ≈ 2.58) and you'd effectively add ~6.6 phantoms.

**One-sentence version:** compute the bar as if a skeptic had added a few 50/50 predictions to your pile — enough to stop tiny samples from claiming certainty, few enough to vanish once real data accumulates.

**How it's used on the chart:** if a dot's bar still **crosses the diagonal**, the data cannot yet convict you of miscalibration there ("too early to call"); if the whole bar sits below the diagonal, the verdict is real ("your 80%s genuinely behave like 60%s"). Note for implementation: you ship the closed-form Wilson formula (~5 lines, same p̂/z/n ingredients), not the phantom story — the phantoms are how you *understand* it, and the 3-of-3 case belongs in the unit tests to prove the interval doesn't collapse.

### 3.7 The rolling Brier: "am I improving?"

A lifetime-average Brier is unfair to someone who has genuinely improved — month one's blunders drag the number forever, which quietly demotivates exactly the most engaged users. The fix is trivial: also compute the Brier over a **recent window** (e.g., the last 20 resolutions), or an exponentially-weighted average where recent predictions count more. No new math — it's §3.1's average over a subset.

What it unlocks is the question the lifetime score can't answer: *is the training working?* "Your last 20 average 0.16 vs. 0.24 lifetime — you're improving" is the single most motivating deterministic fact the app can surface, and Brier-over-time trending down is the natural progress chart. One caveat inherited from everything above: a 20-prediction window is itself a small sample, so short-term wiggles are mostly noise — the trend across several windows is the signal, not any single window's value.

**Windowing extends to Murphy, but not to Wilson — and the distinction is a design principle.** Murphy's decomposition is a measurement over a set of predictions, so running it on a recent window is legitimate and answers something rolling Brier can't: *which component* is improving — is boldness climbing while honesty holds (the coaching is working), or did the user just get louder while getting less calibrated? It is, however, the most sample-hungry statistic here: it needs data *per bucket*, so windows below ~40–50 resolutions are noise. Wilson, by contrast, is not a measurement — it's the *honesty label on* a measurement, and its honesty comes entirely from the sample size n. Windowing it would mean discarding data to change a trust claim, which is backwards. The rule: **window measurements (Brier, Murphy); never window uncertainty quantification (Wilson) — it inherits whatever window the measurement chose**, and its bars will honestly widen on windowed data, correctly reporting that recent-form claims are blurrier than lifetime ones.

---

## 4. Why we're miscalibrated: the psychology

Understanding the failure modes helps you design features that counter them.

### 4.1 The three faces of overconfidence (Moore & Healy)

Researchers separate overconfidence into three distinct things that are often conflated:

1. **Overestimation** — thinking you'll do better / be right more often than you will (the classic).
2. **Overprecision** — being too certain your estimate is exact; your "90% confidence intervals" are far too narrow. This is the most robust and universal of the three.
3. **Overplacement** — the "better than average" effect; thinking you're above the median (most drivers rate themselves above-average).

Your product primarily attacks **overprecision and overestimation** — it forces explicit probabilities and then checks them.

### 4.2 Other biases in play

- **Base-rate neglect:** we fixate on the vivid specifics of *this* case and ignore how often this *kind* of thing happens in general. (Countermeasure: reference-class forecasting, below — and a natural feature where the AI suggests a base rate.)
- **Anchoring:** the first number in our head drags our estimate toward it.
- **Availability:** we overweight what's easy to recall (recent, dramatic events).
- **Hindsight bias:** covered above — the memory-rewriting that makes tracking essential.

---

## 5. The forecasting research (Tetlock and the superforecasters)

The single most important body of work here is Philip Tetlock's. Two findings you should be able to cite:

1. **Expert political/geopolitical forecasters were, on average, barely better than chance** — famously "about as accurate as a dart-throwing chimpanzee" — *and their confidence was inversely related to their accuracy* (the more famous and certain, the worse). This is the problem statement.
2. **The Good Judgment Project** (a multi-year forecasting tournament) then showed that a subset of ordinary people — dubbed **superforecasters** — could be identified and *trained* to consistently outperform, even beating intelligence analysts with access to classified information. Forecasting is learnable.

What superforecasters do differently (useful as the pedagogy behind features and nudges):

- They think in **explicit probabilities** and update them in small increments as evidence arrives, rather than flipping between "sure" and "no idea."
- They start from the **outside view / base rate** (reference-class forecasting) before adjusting for specifics — the **"inside vs outside view"** distinction from Kahneman and Tversky.
- They **break big questions into smaller, estimable pieces** (**Fermi estimation** — decomposing "how many X" into a chain of rougher guesses that individually are easier and whose errors partly cancel).
- They keep **score**, review their misses without ego, and treat beliefs as **testable hypotheses**, not identity.

Notice that the last point — *keep score and review* — is literally what your product operationalizes.

---

## 6. Decision theory: good decisions vs. good outcomes

A related idea your "decision journal" framing rests on, popularized for a general audience by poker champion **Annie Duke** (*Thinking in Bets*):

**A good decision and a good outcome are not the same thing.** In any uncertain domain, you can decide well and get unlucky, or decide badly and get lucky. Duke calls judging a decision by its outcome **"resulting"** — and it's a trap, because it teaches the wrong lessons (you praise a reckless call that happened to work). The remedy is to evaluate the *quality of the reasoning and the probability you assigned* at the time, separately from how the dice landed. Tracking calibration across *many* decisions is how you see past luck to the underlying quality of your judgment — one lucky outcome can't hide in a large, scored track record.

This is the deeper "why" of the product: not "did this one call work out," but "is my judgment engine well-tuned, on average, over time."

### 6.1 The decision journal as a practice

The **decision journal** (popularized by Shane Parrish/Farnam Street and Duke) is the low-tech ancestor of your product. The practice: before a meaningful decision, write down *what you're deciding, your reasoning, the alternatives, how you feel, and what you expect to happen* (ideally with a probability and a date). Later, you re-read it and compare to reality. It works because it freezes your real pre-outcome thinking, defeating hindsight bias. The gap your product fills: journals capture the *words* but do no *scoring* and send no *reminders* — the quantified, calibrated loop is missing.

---

## 7. Does training actually improve calibration?

Yes — this is well-supported, which matters because it means your product can credibly claim to *work*:

- Classic experiments (Alpert & Raiffa and successors) showed that simply **giving people feedback on their calibration measurably improves it**, often quite quickly for the overprecision problem.
- Weather forecasters are the real-world proof: because they get daily, scored feedback on probabilistic forecasts, they are among the **best-calibrated professionals on earth**. Calibration follows from the feedback loop.
- The Good Judgment Project showed trained forecasters improving over a tournament.

The mechanism is always the same: **explicit probability → outcome → score → adjust.** Your product is a machine for running that loop on a person's real life.

---

## 8. How this maps onto everyday life (the product's whole premise)

Most people will never forecast geopolitics. The bet your product makes is that the *same loop* applies to ordinary decisions and predictions, and is just as improvable:

- *"I'm 75% sure I'll enjoy this job in six months."*
- *"70% we ship by end of quarter."*
- *"60% this friendship survives the move."*
- *"80% the contractor comes in over budget."*
- *"55% I actually stick with this gym membership past March."*

Run enough of these through predict → resolve → score, and a person learns, concretely, *where their judgment is trustworthy and where it isn't* — maybe they're sharp about work timelines but wildly overconfident about their own follow-through. That self-knowledge is the product.

---

## Glossary

| Term | Meaning |
|---|---|
| **Calibration / reliability** | Whether your stated probabilities match observed frequencies. |
| **Resolution / discrimination / sharpness** | How decisively you separate likely from unlikely, vs. hedging to 50%. |
| **Proper scoring rule** | A scoring method maximized by stating your honest probability. |
| **Brier score** | Mean squared error of probabilistic forecasts. 0 = perfect, 1 = worst. |
| **Log score** | Proper scoring rule that punishes confident-and-wrong severely. |
| **Calibration curve / reliability diagram** | Plot of stated confidence vs. actual outcome frequency. |
| **Expected Calibration Error (ECE)** | Average distance of the calibration curve from the diagonal. |
| **Brier skill score** | Your Brier relative to a baseline, as a % improvement. |
| **Base rate** | How often this class of event happens in general. |
| **Reference class** | The set of comparable past cases a base rate is drawn from. |
| **Inside vs outside view** | Reasoning from this case's specifics vs. from the base rate. |
| **Fermi estimation** | Decomposing a hard quantity into a chain of easier guesses. |
| **Overprecision / overestimation / overplacement** | The three distinct forms of overconfidence. |
| **Hindsight bias** | Misremembering, after the fact, that you predicted the outcome. |
| **Resulting** | Judging a decision by its outcome rather than its reasoning. |
| **Resolution criteria** | The precise, pre-agreed rule for scoring a prediction YES/NO. |
| **Operationalization** | Turning a vague intention into a precise, checkable question. |

---

## Further reading (the canon)

- **Philip Tetlock & Dan Gardner — *Superforecasting*** — the central text; the Good Judgment Project and what good forecasters do.
- **Daniel Kahneman — *Thinking, Fast and Slow*** — the cognitive biases, overconfidence, inside/outside view.
- **Annie Duke — *Thinking in Bets*** — decisions vs. outcomes, "resulting," probabilistic thinking for normal life.
- **Douglas Hubbard — *How to Measure Anything*** — calibration training and estimating under uncertainty in a practical, business context.
- **Glenn Brier (1950)** and **Allan Murphy (1973)** — the original scoring rule and its decomposition (for when you want the primary sources on the math).

*The takeaway to build on: calibration is an objective, measurable, improvable property of a person's judgment, produced by the loop predict → resolve → score → adjust. Your product is that loop, made effortless.*
