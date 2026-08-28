// Seeds a private testing/screenshot account (demo@ivyra.app) with a full,
// believable calibration story: ~35 resolved predictions across every category
// and reasoning type, laddered over Feb–Jul 2026 with a deliberately
// OVERCONFIDENT profile (actual frequency sags below stated confidence in every
// decile, so the curve dips below the diagonal and the bias score reads
// positive), 3 recent resolved rows carrying hand-written post-mortems that match
// the real diff-engine constraints, 24 resolved decision entries — 6 per
// outcome×stance quadrant — so the insights "Decisions" section (docs §2.3)
// demos with real crossed numbers, plus 5 open predictions (2 due today for a
// live resolve + streamed post-mortem, 3 upcoming; one of the due-today rows
// carries a `decision` so the resolve screen's subjective layer has a live
// row to exercise) — ~64 predictions total.
//
// Auth: demo@ivyra.app isn't a real inbox, so it logs in LOCALLY via the
// development-only password form (src/components/auth/DevPasswordSignIn.tsx),
// with the password set below (reset each run). email_confirm:true is set so the
// account is usable immediately. It's a normal user — same per-user daily AI cap,
// NO admin access (ADMIN_USER_ID stays the owner's id only). Not public.
//
// Idempotent: wipes demo@ivyra.app's predictions / user_stats / ai_calls and
// rebuilds from scratch, so re-running resets it any time. It also retires older
// demo identities so a re-run never leaves duplicate demo users: it deletes the
// legacy demo@caliber.app account outright, and clears the seeded data off the
// previous demo mailbox (demouser4132@gmail.com) while keeping that real account.
//
// Usage: npm run seed   (loads .env.local; needs DATABASE_URL,
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { kindFor } from "../src/lib/predictions/kind";

const DEMO_EMAIL = "demo@ivyra.app";
// Retired demo identities to remove entirely (auth user + data) so a re-run never
// leaves duplicate demo users. demo@caliber.app was an earlier password-based seed.
const RETIRED_DEMO_EMAILS = ["demo@caliber.app"];
// The previous seed populated this real mailbox as the demo. Keep the account
// (it's a real signup) but strip its seeded data so it doesn't duplicate the new
// demo's rows — the seeded story now lives solely under DEMO_EMAIL.
const MIGRATE_OFF_EMAIL = "demouser4132@gmail.com";
// A password is set on the demo account so it can be logged into LOCALLY via the
// development-only password form. demo@ivyra.app has no inbox, so this is its only
// sign-in path. Overridable via env for a private value.
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD ?? "ivyra-demo-dev";

const CATEGORIES = ["work", "health", "relationships", "money", "self"] as const;
const REASONING_TYPES = [
  "base_rate",
  "specific_evidence",
  "trust_in_person",
  "gut_feel",
  "plan_optimism",
] as const;

type Category = (typeof CATEGORIES)[number];
type ReasoningType = (typeof REASONING_TYPES)[number];

// Realistic prediction text per category (cycled).
const TEXTS: Record<Category, string[]> = {
  work: [
    "We hit the sprint goal this week",
    "The client renews their contract",
    "The new hire accepts the offer",
    "The deploy goes out without a P0",
    "The design review is approved on the first pass",
  ],
  health: [
    "I hit the gym 4x this week",
    "I keep a 7-day meditation streak",
    "I sleep 7+ hours every night this week",
    "I stay under my calorie target this week",
    "I walk 10k steps every day this week",
  ],
  relationships: [
    "I call my parents this weekend",
    "We resolve the roommate dispute amicably",
    "I reconnect with an old friend this month",
    "The dinner party goes well",
    "I send the thank-you notes by Sunday",
  ],
  money: [
    "My savings rate stays above 20% this month",
    "I stick to the no-spend weekend",
    "I file my taxes before the deadline",
    "The stock recovers to my buy price",
    "I keep dining-out under budget this month",
  ],
  self: [
    "I finish the book by month end",
    "I ship the personal website",
    "I keep a no-phone-after-10pm rule this week",
    "I journal every day this week",
    "I finish the online course module",
  ],
};

// Frozen "why" per reasoning type (cycled) — kept short and plausible.
const REASONING: Record<ReasoningType, string> = {
  base_rate: "Historically I land this kind of target most of the time.",
  specific_evidence: "The concrete signs so far all point this way.",
  trust_in_person: "The person responsible has been reliable before.",
  gut_feel: "Nothing specific — it just feels likely.",
  plan_optimism: "If I stick to my plan this should land comfortably.",
};

// Per-decile overconfidence plan: actual hit rate sits below stated confidence
// in every bucket (curve sags below the diagonal; bias score positive). 32 rows
// here; the 3 canned post-mortem rows below bring the resolved total to 35.
const BUCKETS: { confs: number[]; hits: number }[] = [
  { confs: [0.95, 0.92, 0.9, 0.94, 0.91, 0.93, 0.9], hits: 4 }, // n=7, 90s
  { confs: [0.85, 0.82, 0.88, 0.8, 0.86, 0.83, 0.89], hits: 3 }, // n=7, 80s
  { confs: [0.75, 0.72, 0.78, 0.7, 0.76, 0.73], hits: 3 }, // n=6, 70s
  { confs: [0.65, 0.62, 0.68, 0.6, 0.66, 0.63], hits: 3 }, // n=6, 60s
  { confs: [0.55, 0.52, 0.58, 0.5, 0.56, 0.53], hits: 3 }, // n=6, 50s
];

// 3 recent resolved rows with hand-written post-mortems. Each quotes the row's
// own frozen reasoning, names the specific factor the outcome note reveals it
// missed, and ties it to a recurring pattern — anchored to the user's words, no
// speculation (POSTMORTEM_SYSTEM_PROMPT constraints).
const CANNED: {
  text: string;
  category: Category;
  reasoningType: ReasoningType;
  confidence: number;
  reasoning: string;
  outcomeNote: string;
  postmortem: string;
}[] = [
  {
    text: "The Q3 data migration ships by Friday",
    category: "work",
    reasoningType: "plan_optimism",
    confidence: 0.9,
    reasoning: "The team's velocity has been high and the tickets left are all small.",
    outcomeNote: "A staging database migration blocked the release for three days.",
    postmortem:
      "You anchored on the team's high velocity and the tickets left being \"all small,\" but your reasoning never mentioned the staging database migration your note says blocked the release for three days. That blocker sat outside the ticket list you were tracking. It echoes your earlier deadline misses, where the delay came from infrastructure you hadn't scoped rather than the feature work itself.",
  },
  {
    text: "The side project clears its first $100 this month",
    category: "money",
    reasoningType: "specific_evidence",
    confidence: 0.82,
    reasoning: "Traffic has been climbing and two people already asked about paying.",
    outcomeNote: "Both interested users churned before the paywall went live.",
    postmortem:
      "Your reasoning cited climbing traffic and \"two people asked about paying,\" but it treated stated interest as committed revenue. Your note shows both of those users churned before the paywall shipped — the gap your prediction didn't close was the distance between interest and a completed purchase.",
  },
  {
    text: "I run the 10k under 55 minutes this month",
    category: "health",
    reasoningType: "plan_optimism",
    confidence: 0.88,
    reasoning: "My training paces have been improving every week and I felt strong.",
    outcomeNote: "I skipped two weeks of training after a calf strain.",
    postmortem:
      "You leaned on steadily improving training paces and feeling strong, but your reasoning assumed uninterrupted training. Your note says a calf strain cost you two weeks — a disruption your plan-based confidence left no room for. As with your other plan-optimism misses, the estimate priced in the good weeks and none of the setbacks.",
  },
];

// 24 resolved decision entries — 6 per outcome×stance quadrant (met+stand_by,
// met+wouldnt_again, missed+stand_by, missed+wouldnt_again) — so the insights
// "Decisions" section (docs/06-decision-layer.md §2.3) demos with real crossed
// numbers instead of lock states. `outcomeByStance` gates each of the two
// outcome groups independently at BIAS_UNLOCK_N (10); 12 met + 12 missed each
// clears it with room to spare. Every entry carries a `decision`, a `stance`,
// and a first-person `reflection` — the reflection is the USER's own words, so
// it may read as self-judging ("I should have eased in"); the CLAUDE.md
// "calibration only, never merit" rule constrains what the APP says about a
// decision, never what the user writes about their own.
const DECISION_ENTRIES: {
  decision: string;
  text: string;
  category: Category;
  reasoningType: ReasoningType;
  confidence: number;
  reasoning: string;
  outcome: boolean;
  outcomeNote: string;
  reflection: string;
  stance: "stand_by" | "mixed" | "wouldnt_again";
}[] = [
  // --- met + stand_by (criterion met; would make the same call again) -------
  {
    decision: "I turned down the higher-paying offer to stay at my current company",
    text: "I still feel engaged at work six months later",
    category: "work",
    reasoningType: "trust_in_person",
    confidence: 0.75,
    reasoning: "My manager has followed through on promises before, and the new team's fit was unknown.",
    outcome: true,
    outcomeNote: "Got put on the project I wanted and the team gelled quickly.",
    reflection: "Yes, I'd stay again — the other offer's team turned out to have high turnover anyway.",
    stance: "stand_by",
  },
  {
    decision: "I moved my emergency fund into a high-yield account instead of investing it",
    text: "My emergency fund stayed fully liquid through the year",
    category: "money",
    reasoningType: "base_rate",
    confidence: 0.9,
    reasoning: "I've kept cash reserves untouched through past downturns.",
    outcome: true,
    outcomeNote: "Never had to touch it, and it earned decent interest.",
    reflection: "Absolutely — having it liquid mattered more than the extra yield I gave up.",
    stance: "stand_by",
  },
  {
    decision: "I asked for feedback directly instead of guessing why the review was lukewarm",
    text: "I got a clear, actionable answer within the week",
    category: "work",
    reasoningType: "specific_evidence",
    confidence: 0.65,
    reasoning: "My manager has been direct in one-on-ones before.",
    outcome: true,
    outcomeNote: "She gave me two concrete things to work on.",
    reflection: "I'd ask directly again — guessing would have just left me anxious longer.",
    stance: "stand_by",
  },
  {
    decision: "I signed up for a structured training plan instead of running by feel",
    text: "I kept a consistent training log for two months",
    category: "health",
    reasoningType: "plan_optimism",
    confidence: 0.7,
    reasoning: "Structured plans have worked for me before when I stuck with them.",
    outcome: true,
    outcomeNote: "Followed the plan almost every week.",
    reflection: "Keeping the structured plan — winging it never lasted this long before.",
    stance: "stand_by",
  },
  {
    decision: "I called my sister instead of waiting for her to reach out first",
    text: "We had a real conversation, not just small talk",
    category: "relationships",
    reasoningType: "gut_feel",
    confidence: 0.55,
    reasoning: "No strong evidence either way, but it felt overdue.",
    outcome: true,
    outcomeNote: "She said she'd been meaning to call too.",
    reflection: "Glad I made the first move — waiting had already cost us a few months.",
    stance: "stand_by",
  },
  {
    decision: "I paid for the course upfront instead of the pay-as-you-go option",
    text: "I finished every course module",
    category: "self",
    reasoningType: "plan_optimism",
    confidence: 0.8,
    reasoning: "Committing money upfront has kept me accountable before.",
    outcome: true,
    outcomeNote: "Finished with two weeks to spare.",
    reflection: "The upfront commitment is what got me through the slow middle modules.",
    stance: "stand_by",
  },
  // --- met + wouldnt_again (criterion met; wouldn't make the same call again) -
  {
    decision: "I crammed the whole proposal in one all-nighter instead of spreading it out",
    text: "The client accepted the proposal without changes",
    category: "work",
    reasoningType: "plan_optimism",
    confidence: 0.6,
    reasoning: "I've pulled off last-minute work before under pressure.",
    outcome: true,
    outcomeNote: "It landed, but I was running on fumes for the client call.",
    reflection: "It worked, but I was one bad night's sleep from blowing the pitch — not doing that again.",
    stance: "wouldnt_again",
  },
  {
    decision: "I put the whole bonus into one stock instead of spreading it across a few",
    text: "The stock closed the quarter up",
    category: "money",
    reasoningType: "gut_feel",
    confidence: 0.5,
    reasoning: "No real evidence, just a hunch about the sector.",
    outcome: true,
    outcomeNote: "It went up, but it swung wildly the whole quarter.",
    reflection: "I got lucky — the volatility wasn't worth what I actually knew going in.",
    stance: "wouldnt_again",
  },
  {
    decision: "I skipped rest days to push through the training block",
    text: "I hit my target time for the race",
    category: "health",
    reasoningType: "plan_optimism",
    confidence: 0.65,
    reasoning: "Extra volume has paid off in past training blocks.",
    outcome: true,
    outcomeNote: "Hit the time, but I was nursing a sore knee for weeks after.",
    reflection: "The time came through, but my knee still isn't right — I'd take the rest days next time.",
    stance: "wouldnt_again",
  },
  {
    decision: "I confronted my roommate about the mess in front of our other friends",
    text: "The apartment stayed clean afterward",
    category: "relationships",
    reasoningType: "gut_feel",
    confidence: 0.5,
    reasoning: "Nothing specific, just frustration boiling over.",
    outcome: true,
    outcomeNote: "They cleaned up, but things were awkward between us for a while.",
    reflection: "It got the result, but doing it in front of everyone wasn't necessary — I'd pull them aside instead.",
    stance: "wouldnt_again",
  },
  {
    decision: "I overcommitted to three side projects at once to force momentum",
    text: "I shipped the first version of the app",
    category: "self",
    reasoningType: "plan_optimism",
    confidence: 0.6,
    reasoning: "Pressure has pushed me to finish things before.",
    outcome: true,
    outcomeNote: "Shipped it, but the other two projects stalled completely.",
    reflection: "Shipping felt good, but the other two are dead now — spreading myself that thin isn't worth it.",
    stance: "wouldnt_again",
  },
  {
    decision: "I took the higher-interest loan to close on the house faster",
    text: "We closed before the seller's deadline",
    category: "money",
    reasoningType: "specific_evidence",
    confidence: 0.7,
    reasoning: "The seller had another offer already lined up.",
    outcome: true,
    outcomeNote: "We got the house, but the rate is costing us a lot more than planned.",
    reflection: "Got the house, but I'd negotiate more time instead of eating that rate again.",
    stance: "wouldnt_again",
  },
  // --- missed + stand_by (criterion missed; would make the same call again) --
  {
    decision: "I turned down the guaranteed contract for the equity offer",
    text: "The startup reached its funding milestone",
    category: "work",
    reasoningType: "trust_in_person",
    confidence: 0.6,
    reasoning: "The founders have a strong track record of hitting milestones.",
    outcome: false,
    outcomeNote: "The round fell through after a lead investor pulled out.",
    reflection: "Still the right bet given what I knew — the investor pulling out wasn't something I could have seen.",
    stance: "stand_by",
  },
  {
    decision: "I put off the car repair to save for the down payment instead",
    text: "The car made it through the year without a major breakdown",
    category: "money",
    reasoningType: "base_rate",
    confidence: 0.55,
    reasoning: "The car's held up fine on minor issues before.",
    outcome: false,
    outcomeNote: "The transmission failed in November.",
    reflection: "I'd make the same call again — the odds favored waiting, this was just bad luck.",
    stance: "stand_by",
  },
  {
    decision: "I trained for the marathon on my own instead of hiring a coach",
    text: "I finished under my target time",
    category: "health",
    reasoningType: "plan_optimism",
    confidence: 0.6,
    reasoning: "Self-directed training has gotten me close to goal times before.",
    outcome: false,
    outcomeNote: "Cramped badly at mile 20 and had to walk it in.",
    reflection: "I'd still train myself again — the cramping was about race-day heat, not the plan.",
    stance: "stand_by",
  },
  {
    decision: "I gave my friend the benefit of the doubt and lent them the money",
    text: "They paid me back by the date we agreed",
    category: "relationships",
    reasoningType: "trust_in_person",
    confidence: 0.65,
    reasoning: "They've always paid me back on time before.",
    outcome: false,
    outcomeNote: "They lost their job unexpectedly and couldn't pay on time.",
    reflection: "I'd lend it again — nothing about how I sized them up was wrong, their job loss wasn't foreseeable.",
    stance: "stand_by",
  },
  {
    decision: "I picked the apartment with the shorter commute over the bigger one",
    text: "The shorter commute made me noticeably less stressed this year",
    category: "self",
    reasoningType: "gut_feel",
    confidence: 0.55,
    reasoning: "Commute stress has worn on me before, so this felt worth it.",
    outcome: false,
    outcomeNote: "Construction on the route added 20 minutes most days anyway.",
    reflection: "I'd pick the shorter commute again — the construction wasn't anything I could have predicted.",
    stance: "stand_by",
  },
  {
    decision: "I pitched the redesign to leadership instead of shipping it quietly first",
    text: "Leadership approved the redesign in the first review",
    category: "work",
    reasoningType: "specific_evidence",
    confidence: 0.6,
    reasoning: "Early feedback from two stakeholders had been positive.",
    outcome: false,
    outcomeNote: "A last-minute stakeholder raised concerns that stalled approval.",
    reflection: "Pitching it openly was still the right move — I couldn't have known that stakeholder would weigh in that late.",
    stance: "stand_by",
  },
  // --- missed + wouldnt_again (criterion missed; wouldn't make the same call again) -
  {
    decision: "I skipped the home inspection to make the offer more competitive",
    text: "The house needed no major repairs in the first year",
    category: "money",
    reasoningType: "gut_feel",
    confidence: 0.5,
    reasoning: "The house looked well maintained on the walkthrough.",
    outcome: false,
    outcomeNote: "Found a serious foundation issue within two months.",
    reflection: "Skipping the inspection was the mistake — I'd never waive it again, competitive market or not.",
    stance: "wouldnt_again",
  },
  {
    decision: "I took on the client project without a signed contract",
    text: "The client paid the full invoice on time",
    category: "work",
    reasoningType: "trust_in_person",
    confidence: 0.6,
    reasoning: "We'd worked together informally before without issues.",
    outcome: false,
    outcomeNote: "They disputed the scope and paid half.",
    reflection: "I'd never start work again without a signed contract — this one was avoidable.",
    stance: "wouldnt_again",
  },
  {
    decision: "I switched to the new workout program cold instead of easing in",
    text: "I avoided injury through the transition",
    category: "health",
    reasoningType: "plan_optimism",
    confidence: 0.55,
    reasoning: "I've handled program switches fine before.",
    outcome: false,
    outcomeNote: "Pulled a muscle in the second week.",
    reflection: "I should have eased in — jumping straight into the new program was on me.",
    stance: "wouldnt_again",
  },
  {
    decision: "I brought up the tension at the family dinner instead of privately",
    text: "The conversation stayed calm and resolved things",
    category: "relationships",
    reasoningType: "gut_feel",
    confidence: 0.5,
    reasoning: "No strong read either way, just wanted it out in the open.",
    outcome: false,
    outcomeNote: "It turned into an argument in front of everyone.",
    reflection: "That was the wrong setting for it — I'd have that conversation privately next time.",
    stance: "wouldnt_again",
  },
  {
    decision: "I quit my daily journaling habit to free up time for a new project",
    text: "I kept the same sense of clarity without journaling",
    category: "self",
    reasoningType: "gut_feel",
    confidence: 0.5,
    reasoning: "Figured the habit had mostly run its course.",
    outcome: false,
    outcomeNote: "Noticeably more scattered within a few weeks of stopping.",
    reflection: "I'd keep the habit — dropping it cost me more clarity than the extra time was worth.",
    stance: "wouldnt_again",
  },
  {
    decision: "I co-signed my cousin's lease without a written side agreement between us",
    text: "The rent got paid on time every month without my involvement",
    category: "money",
    reasoningType: "trust_in_person",
    confidence: 0.6,
    reasoning: "Family, and they'd always been responsible about money.",
    outcome: false,
    outcomeNote: "I ended up covering two months when they fell behind.",
    reflection: "I'd get something in writing next time — good intentions aren't a payment plan.",
    stance: "wouldnt_again",
  },
];

// 5 open predictions: 2 due today (resolution_date <= today → live resolve +
// streamed post-mortem from the dashboard) and 3 upcoming. The first carries a
// `decision` so the seed always has one decision entry available to exercise
// the resolve screen's subjective layer (docs/06-decision-layer.md §2.2); the
// rest are legacy-shaped forecasts (decision null), matching real history from
// before capture required one.
const OPEN: {
  text: string;
  category: Category;
  reasoningType: ReasoningType;
  predictionKind: "self" | "world";
  confidence: number;
  reasoning: string;
  resolutionDate: string;
  decision?: string;
}[] = [
  {
    text: "The onboarding redesign ships before the end of the month",
    category: "work",
    reasoningType: "plan_optimism",
    predictionKind: "world",
    confidence: 0.85,
    reasoning: "The core screens are built and only copy review is left.",
    resolutionDate: "2026-07-22",
    decision: "I cut the settings-page redesign from this release to protect the deadline",
  },
  {
    text: "I finish reading the systems-design book this week",
    category: "self",
    reasoningType: "plan_optimism",
    predictionKind: "self",
    confidence: 0.7,
    reasoning: "I have three chapters left and a quiet weekend ahead.",
    resolutionDate: "2026-07-20",
  },
  {
    text: "My emergency fund reaches three months of expenses by fall",
    category: "money",
    reasoningType: "base_rate",
    predictionKind: "self",
    confidence: 0.6,
    reasoning: "I've hit my savings target most months this year.",
    resolutionDate: "2026-08-15",
  },
  {
    text: "We land the enterprise pilot customer next quarter",
    category: "work",
    reasoningType: "trust_in_person",
    predictionKind: "world",
    confidence: 0.55,
    reasoning: "Our champion there has pushed similar deals through before.",
    resolutionDate: "2026-09-10",
  },
  {
    text: "I keep a daily walking habit through the autumn",
    category: "health",
    reasoningType: "gut_feel",
    predictionKind: "self",
    confidence: 0.5,
    reasoning: "No strong evidence either way — it just feels sustainable.",
    resolutionDate: "2026-10-05",
  },
];

function predictionKindFor(category: Category): "self" | "world" {
  return category === "health" || category === "self" ? "self" : "world";
}

type PredictionRow = typeof import("../src/db/schema").predictions.$inferInsert;

function buildResolvedRows(userId: string): PredictionRow[] {
  // Flatten the bucket plan into (confidence, outcome) tuples.
  const tuples: { confidence: number; outcome: boolean }[] = [];
  for (const b of BUCKETS) {
    for (let i = 0; i < b.confs.length; i++) {
      tuples.push({ confidence: b.confs[i]!, outcome: i < b.hits });
    }
  }

  // Ladder resolved_at across the window; created_at ~21 days earlier.
  const START = Date.UTC(2026, 1, 1); // Feb 1 2026
  const END = Date.UTC(2026, 6, 15); // Jul 15 2026
  const total = tuples.length + CANNED.length; // 35
  const step = (END - START) / (total - 1);

  const rows: PredictionRow[] = [];

  // Bucket rows occupy the earlier slots; the 3 canned rows take the latest
  // resolved_at (most recent → easiest to find, not buried in history).
  tuples.forEach((t, i) => {
    const category = CATEGORIES[i % CATEGORIES.length]!;
    const reasoningType = REASONING_TYPES[i % REASONING_TYPES.length]!;
    const resolvedAt = new Date(START + i * step);
    const createdAt = new Date(resolvedAt.getTime() - 21 * 24 * 3600 * 1000);
    const brier = (t.confidence - (t.outcome ? 1 : 0)) ** 2;
    rows.push({
      userId,
      text: TEXTS[category][i % TEXTS[category].length]!,
      reasoning: REASONING[reasoningType],
      planOrDisconfirm: null,
      // Derived through kindFor (never inline) — these seed rows carry no
      // decision, so it's a pass-through of the category default today.
      predictionKind: kindFor({ decision: null, predictionKind: predictionKindFor(category) }),
      confidence: t.confidence.toFixed(2),
      resolutionDate: resolvedAt.toISOString().slice(0, 10),
      category,
      reasoningType,
      status: "resolved",
      outcome: t.outcome,
      outcomeNote: null,
      brierScore: brier.toFixed(4),
      createdAt,
      resolvedAt,
    });
  });

  CANNED.forEach((c, j) => {
    const idx = tuples.length + j;
    const resolvedAt = new Date(START + idx * step);
    const createdAt = new Date(resolvedAt.getTime() - 21 * 24 * 3600 * 1000);
    const brier = (c.confidence - 0) ** 2; // all canned rows resolved NO (a miss)
    rows.push({
      userId,
      text: c.text,
      reasoning: c.reasoning,
      planOrDisconfirm: null,
      predictionKind: kindFor({ decision: null, predictionKind: predictionKindFor(c.category) }),
      confidence: c.confidence.toFixed(2),
      resolutionDate: resolvedAt.toISOString().slice(0, 10),
      category: c.category,
      reasoningType: c.reasoningType,
      status: "resolved",
      outcome: false,
      outcomeNote: c.outcomeNote,
      brierScore: brier.toFixed(4),
      postmortem: c.postmortem,
      createdAt,
      resolvedAt,
    });
  });

  return rows;
}

/**
 * The 24 decision entries behind the insights "Decisions" section (docs
 * §2.3). Laddered right after the forecast history above, each carries a
 * `decision`, forcing `predictionKind` 'self' via `kindFor` (never inline) —
 * exactly what a real capture would produce, since capture is decisions-only.
 */
function buildDecisionEntryRows(userId: string): PredictionRow[] {
  const START = Date.UTC(2026, 6, 20); // Jul 20 2026 — right after the forecast history
  const END = Date.UTC(2026, 7, 20); // Aug 20 2026
  const step = (END - START) / (DECISION_ENTRIES.length - 1);

  return DECISION_ENTRIES.map((entry, i) => {
    const resolvedAt = new Date(START + i * step);
    const createdAt = new Date(resolvedAt.getTime() - 14 * 24 * 3600 * 1000);
    const brier = (entry.confidence - (entry.outcome ? 1 : 0)) ** 2;
    return {
      userId,
      text: entry.text,
      reasoning: entry.reasoning,
      planOrDisconfirm: null,
      predictionKind: kindFor({ decision: entry.decision, predictionKind: "self" }),
      decision: entry.decision,
      confidence: entry.confidence.toFixed(2),
      resolutionDate: resolvedAt.toISOString().slice(0, 10),
      category: entry.category,
      reasoningType: entry.reasoningType,
      status: "resolved",
      outcome: entry.outcome,
      outcomeNote: entry.outcomeNote,
      brierScore: brier.toFixed(4),
      reflection: entry.reflection,
      stance: entry.stance,
      createdAt,
      resolvedAt,
    };
  });
}

function buildOpenRows(userId: string): PredictionRow[] {
  const DAY = 24 * 3600 * 1000;
  // A prediction is always WRITTEN in the past. Aim for ~2 weeks before the
  // resolution date, but never later than a few days ago — otherwise an entry
  // whose resolution date is months out would be "created" in the future, and
  // resolving it would leave a completed entry dated after today.
  const latestCreatedAt = Date.now() - 3 * DAY;
  return OPEN.map((o) => {
    const resolution = new Date(`${o.resolutionDate}T00:00:00Z`);
    const createdAt = new Date(Math.min(resolution.getTime() - 14 * DAY, latestCreatedAt));
    const decision = o.decision ?? null;
    return {
      userId,
      text: o.text,
      reasoning: o.reasoning,
      planOrDisconfirm: null,
      predictionKind: kindFor({ decision, predictionKind: o.predictionKind }),
      decision,
      confidence: o.confidence.toFixed(2),
      resolutionDate: o.resolutionDate,
      category: o.category,
      reasoningType: o.reasoningType,
      status: "open",
      outcome: null,
      outcomeNote: null,
      brierScore: null,
      createdAt,
    };
  });
}

function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  // Service-role client built directly here — the app's src/lib/supabase/admin.ts
  // is `server-only` and throws outside a React Server Component.
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserByEmail(admin: SupabaseClient, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function main() {
  const admin = getAdminClient();

  // Import the app's Drizzle client AFTER dotenv has run (src/db reads
  // DATABASE_URL at module load).
  const { db, schema } = await import("../src/db/index");
  const { eq } = await import("drizzle-orm");

  // Purge the demo account's data (predictions / user_stats / ai_calls) so a
  // re-run rebuilds cleanly. Reused for the legacy account teardown below.
  async function purgeUserData(userId: string) {
    await db.delete(schema.predictions).where(eq(schema.predictions.userId, userId));
    await db.delete(schema.userStats).where(eq(schema.userStats.userId, userId));
    await db.delete(schema.aiCalls).where(eq(schema.aiCalls.userId, userId));
  }

  // 1a. Remove retired demo identities entirely (data AND the auth user), so a
  //     re-run never leaves a second, stale demo account behind.
  for (const email of RETIRED_DEMO_EMAILS) {
    const retired = await findUserByEmail(admin, email);
    if (retired) {
      await purgeUserData(retired.id);
      const { error: delErr } = await admin.auth.admin.deleteUser(retired.id);
      if (delErr) throw delErr;
      console.log(`Removed retired demo account ${email} (${retired.id}) and its data.`);
    } else {
      console.log(`No retired ${email} account to remove.`);
    }
  }

  // 1b. Migrate off the previous demo mailbox: keep the real account, but strip
  //     the seeded data so the demo story doesn't exist in two places at once.
  const migrateOff = await findUserByEmail(admin, MIGRATE_OFF_EMAIL);
  if (migrateOff) {
    await purgeUserData(migrateOff.id);
    console.log(`Cleared seeded data off ${MIGRATE_OFF_EMAIL} (kept the account).`);
  }

  // 2. Resolve the demo user (idempotent) or create it. email_confirm:true is
  //    enough for magic-link sign-in; a password is also set so the dev-only
  //    password form can log this account in locally (reset each run so it's
  //    always the known value).
  let userId: string;
  const existing = await findUserByEmail(admin, DEMO_EMAIL);
  if (existing) {
    userId = existing.id;
    await admin.auth.admin.updateUserById(userId, { password: DEMO_PASSWORD });
    console.log(`Reusing existing demo user ${userId} (${DEMO_EMAIL}).`);
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      email_confirm: true,
      password: DEMO_PASSWORD,
    });
    if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");
    userId = created.user.id;
    console.log(`Created demo user ${userId} (${DEMO_EMAIL}).`);
  }

  // 3. Reset + rebuild the demo account's predictions.
  await purgeUserData(userId);
  console.log("Cleared existing demo data.");

  const rows = [...buildResolvedRows(userId), ...buildDecisionEntryRows(userId), ...buildOpenRows(userId)];
  await db.insert(schema.predictions).values(rows);

  const resolvedCount = rows.filter((r) => r.status === "resolved").length;
  const openCount = rows.filter((r) => r.status === "open").length;
  console.log(
    `Inserted ${rows.length} predictions (${resolvedCount} resolved, ${openCount} open) for ${DEMO_EMAIL}.`,
  );

  // 4. Backfill embeddings so the seeded rows are visible to pgvector similarity
  //    search — otherwise the track-record panel falls back to the base rate for
  //    the demo account. Same capped-excerpt + model path as live saves, logged
  //    to ai_calls as 'backfill_embed'. Idempotent (embedding IS NULL): a re-run
  //    after the purge above re-embeds the fresh rows and never double-logs. If
  //    no OPENAI_API_KEY is set, every embed degrades to null — the seed still
  //    succeeds, the panel just shows the base rate until a key is present.
  const { backfillMissingEmbeddings } = await import("../src/lib/ai/backfill");
  if (!process.env.OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not set — skipping embedding backfill (panel will show base rates).");
    console.log(`Embedded 0 of ${rows.length} rows.`);
  } else {
    const { embedded, total, failed } = await backfillMissingEmbeddings({ userId });
    console.log(
      `Embedded ${embedded} of ${total} rows.${failed > 0 ? ` (${failed} failed — re-run to retry)` : ""}`,
    );
  }

  console.log(`Local dev password login (development only): ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
