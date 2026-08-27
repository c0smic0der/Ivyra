// Seeds a deliberately overconfident batch of resolved predictions for local
// dev QA (e.g. exercising /insights' unlocked states). Reads DATABASE_URL
// from .env.local — never touches anything but your local dev DB. Re-runnable:
// deletes its own previously-seeded rows (text prefixed "[demo] ") before
// inserting a fresh batch, so it resets rather than accumulates.
//
// Usage: node scripts/seed-dev.js   (or: npm run db:seed-dev)
//
// NOTE: this legacy raw-SQL dev seed intentionally BYPASSES kindFor — it sets
// prediction_kind inline (see below). It is dev-only QA tooling, not an app
// write path; do NOT copy it as a reference for how kind is derived. Real write
// paths (server actions, seed-demo.ts) must route through kindFor.

require("dotenv").config({ path: ".env.local" });
const crypto = require("crypto");
const postgres = require("postgres");

const USER_ID = "a238e2f3-9a67-4afc-92bc-6b8652a1cb55";
const TEXT_PREFIX = "[demo] ";

// Per-decile bucket plan: deliberately overconfident — actual frequency sags
// well below stated confidence in every bucket, especially at the top.
const BUCKETS = [
  { confs: [0.95, 0.93, 0.9, 0.92, 0.96, 0.91, 0.94, 0.9], hits: 5 }, // n=8, decile 90-99
  { confs: [0.85, 0.82, 0.88, 0.8, 0.86, 0.83, 0.89, 0.81], hits: 4 }, // n=8, decile 80-89
  { confs: [0.75, 0.72, 0.78, 0.7, 0.76, 0.73, 0.79], hits: 4 }, // n=7, decile 70-79
  { confs: [0.65, 0.62, 0.68, 0.6, 0.66, 0.63], hits: 3 }, // n=6, decile 60-69
  { confs: [0.55, 0.52, 0.58, 0.5, 0.56, 0.53], hits: 3 }, // n=6, decile 50-59
];

const CATEGORIES = ["work", "health", "relationships", "money", "self"];
const REASONING_TYPES = ["base_rate", "specific_evidence", "trust_in_person", "gut_feel", "plan_optimism"];
const TEXTS = [
  "The migration ships by Friday",
  "I hit the gym 4x this week",
  "The client renews the contract",
  "My savings rate stays above 20% this month",
  "I finish the book by month end",
  "The new hire accepts the offer",
  "I run the 10k under 55 minutes",
  "The bug report gets closed without a P0",
  "We hit the sprint goal",
  "I stick to the no-spend weekend",
];

// Flatten bucket plan into (confidence, outcome) tuples, sized by hit count.
const tuples = [];
for (const b of BUCKETS) {
  const outcomes = b.confs.map((_, i) => i < b.hits);
  for (let i = 0; i < b.confs.length; i++) {
    tuples.push({ confidence: b.confs[i], outcome: outcomes[i] });
  }
}

const START = Date.UTC(2026, 1, 1); // Feb 1, 2026
const END = Date.UTC(2026, 6, 20); // Jul 20, 2026
const step = (END - START) / (tuples.length - 1);

const rows = tuples.map((t, i) => {
  const resolvedAt = new Date(START + i * step);
  const createdAt = new Date(resolvedAt.getTime() - 14 * 24 * 3600 * 1000);
  const brier = (t.confidence - (t.outcome ? 1 : 0)) ** 2;
  return {
    id: crypto.randomUUID(),
    user_id: USER_ID,
    text: TEXT_PREFIX + TEXTS[i % TEXTS.length],
    reasoning: "Seeded for /insights QA — deliberately overconfident profile.",
    plan_or_disconfirm: null,
    prediction_kind: i % 2 === 0 ? "self" : "world",
    confidence: t.confidence.toFixed(2),
    resolution_date: resolvedAt.toISOString().slice(0, 10),
    category: CATEGORIES[i % CATEGORIES.length],
    reasoning_type: REASONING_TYPES[i % REASONING_TYPES.length],
    status: "resolved",
    outcome: t.outcome,
    outcome_note: null,
    brier_score: brier.toFixed(4),
    postmortem: null,
    created_at: createdAt,
    resolved_at: resolvedAt,
  };
});

const sql = postgres(process.env.DATABASE_URL, { ssl: "require" });

async function main() {
  const deleted = await sql`
    delete from predictions
    where user_id = ${USER_ID} and text like ${TEXT_PREFIX + "%"}
    returning id
  `;
  if (deleted.length > 0) console.log(`Cleared ${deleted.length} previously-seeded demo rows.`);

  const inserted = await sql`insert into predictions ${sql(rows)} returning id`;
  console.log(`Inserted ${inserted.length} demo predictions for user ${USER_ID}.`);

  const [check] = await sql`
    select count(*) from predictions where user_id = ${USER_ID} and status = 'resolved'
  `;
  console.log(`Total resolved predictions for user now: ${check.count}`);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
