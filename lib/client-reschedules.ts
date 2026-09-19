import { sql } from "drizzle-orm";
import { db } from "@/db";

// Only the authenticated client change flow supplies this context. Provider
// edits never consume the client's allowance.
export type ClientReschedule = { clientId: string; changedAt: Date };

export function consumeClientRescheduleQuery(
  providerId: string,
  change: ClientReschedule,
) {
  return db
    .select({
      used: sql<number>`consume_client_reschedule(${providerId}, ${change.clientId}, ${change.changedAt.toISOString()}::timestamptz)`,
    })
    .from(sql`(select 1) as reschedule_guard`);
}

export function isClientRescheduleLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (
    "code" in error &&
    error.code === "P0001" &&
    "constraint" in error &&
    error.constraint === "client_weekly_reschedule_limit"
  )
    return true;
  return "cause" in error && isClientRescheduleLimitError(error.cause);
}
