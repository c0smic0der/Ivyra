import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export interface BaseRate {
  kind: string;
  rate: number;
  description: string | null;
}

/** base_rates is global reference data (seeded in a migration) — no user filter needed. */
export async function getBaseRate(kind: string): Promise<BaseRate | null> {
  const [row] = await db.select().from(schema.baseRates).where(eq(schema.baseRates.kind, kind));
  if (!row) return null;
  return { kind: row.kind, rate: Number(row.rate), description: row.description };
}
