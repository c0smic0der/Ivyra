// Seeds a private testing/screenshot account (demo@ivyra.app) with a full,
// believable calibration story: ~35 resolved predictions across every category
// and reasoning type, laddered over Feb–Jul 2026 with a deliberately
// OVERCONFIDENT profile (actual frequency sags below stated confidence in every
// decile, so the curve dips below the diagonal and the bias score reads
// positive), 3 recent resolved rows carrying hand-written post-mortems that match
// the real diff-engine constraints, plus 5 open predictions (2 due today for a
// live resolve + streamed post-mortem, 3 upcoming) — ~40 predictions total.
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

// 5 open predictions: 2 due today (resolution_date <= today → live resolve +
// streamed post-mortem from the dashboard) and 3 upcoming.
const OPEN: {
  text: string;
  category: Category;
  reasoningType: ReasoningType;
  predictionKind: "self" | "world";
  confidence: number;
  reasoning: string;
  resolutionDate: string;
}[] = [
  {
    text: "The onboarding redesign ships before the end of the month",
    category: "work",
    reasoningType: "plan_optimism",
    predictionKind: "world",
    confidence: 0.85,
    reasoning: "The core screens are built and only copy review is left.",
    resolutionDate: "2026-07-22",
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
      predictionKind: predictionKindFor(category),
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
      predictionKind: predictionKindFor(c.category),
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
    return {
      userId,
      text: o.text,
      reasoning: o.reasoning,
      planOrDisconfirm: null,
      predictionKind: o.predictionKind,
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

  const rows = [...buildResolvedRows(userId), ...buildOpenRows(userId)];
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
