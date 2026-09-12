import { and, asc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingPages,
  personalActivities,
  personalActivitySchedules,
} from "@/db/schema";
import { expandPersonalActivityTimes } from "@/lib/calendar-moves";
import {
  PersonalActivityError,
  type PersonalActivityScheduleInput,
  type PersonalActivityInput,
} from "@/lib/personal-activity";

function notFound(): never {
  throw new PersonalActivityError(
    "activity_not_found",
    "This personal activity no longer exists. Refresh the page and try again.",
  );
}

function rethrowNameConflict(error: unknown): never {
  let cause = error;
  while (cause && typeof cause === "object") {
    if ("code" in cause && cause.code === "23505") {
      throw new PersonalActivityError(
        "activity_name_conflict",
        "You already have a personal activity with this name.",
      );
    }
    cause = "cause" in cause ? cause.cause : null;
  }
  throw error;
}

export function listPersonalActivities(providerId: string) {
  return db
    .select({
      id: personalActivities.id,
      name: personalActivities.name,
      defaultDurationMinutes: personalActivities.defaultDurationMinutes,
    })
    .from(personalActivities)
    .where(eq(personalActivities.providerId, providerId))
    .orderBy(asc(personalActivities.name));
}

export async function createPersonalActivity(
  providerId: string,
  input: PersonalActivityInput,
) {
  try {
    const [activity] = await db
      .insert(personalActivities)
      .values({
        providerId,
        name: input.name.trim(),
        defaultDurationMinutes: input.defaultDurationMinutes ?? null,
      })
      .returning();
    return activity;
  } catch (error) {
    rethrowNameConflict(error);
  }
}

export async function updatePersonalActivity(
  providerId: string,
  id: string,
  input: PersonalActivityInput,
) {
  try {
    const [activity] = await db
      .update(personalActivities)
      .set({
        name: input.name.trim(),
        defaultDurationMinutes: input.defaultDurationMinutes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(personalActivities.id, id),
          eq(personalActivities.providerId, providerId),
        ),
      )
      .returning();
    return activity ?? notFound();
  } catch (error) {
    rethrowNameConflict(error);
  }
}

export async function deletePersonalActivity(providerId: string, id: string) {
  const [activity] = await db
    .delete(personalActivities)
    .where(
      and(
        eq(personalActivities.id, id),
        eq(personalActivities.providerId, providerId),
      ),
    )
    .returning({ id: personalActivities.id });
  if (!activity) notFound();
  return { deleted: true };
}

const ownedActivities = (providerId: string) =>
  db
    .select({ id: personalActivities.id })
    .from(personalActivities)
    .where(eq(personalActivities.providerId, providerId));

export async function savePersonalActivitySchedule(
  providerId: string,
  input: PersonalActivityScheduleInput,
  id?: string,
) {
  const [activity] = await db
    .select({ id: personalActivities.id })
    .from(personalActivities)
    .where(
      and(
        eq(personalActivities.id, input.activityId),
        eq(personalActivities.providerId, providerId),
      ),
    )
    .limit(1);
  if (!activity) notFound();
  // Personal time never uses appointment duration, minimum notice or session rest.
  const [schedule] = id
    ? await db
        .update(personalActivitySchedules)
        .set({ ...input, moves: {}, updatedAt: new Date() })
        .where(
          and(
            eq(personalActivitySchedules.id, id),
            inArray(
              personalActivitySchedules.activityId,
              ownedActivities(providerId),
            ),
          ),
        )
        .returning()
    : await db.insert(personalActivitySchedules).values(input).returning();
  return schedule ?? notFound();
}

export async function deletePersonalActivitySchedule(
  providerId: string,
  id: string,
) {
  const [schedule] = await db
    .delete(personalActivitySchedules)
    .where(
      and(
        eq(personalActivitySchedules.id, id),
        inArray(
          personalActivitySchedules.activityId,
          ownedActivities(providerId),
        ),
      ),
    )
    .returning({ id: personalActivitySchedules.id });
  if (!schedule) notFound();
  return { deleted: true };
}

export async function listPersonalActivityOccurrences(
  providerId: string,
  range: { startsAt: Date; endsAt: Date },
) {
  const [pages, rows] = await Promise.all([
    db
      .select({ timeZone: bookingPages.timeZone })
      .from(bookingPages)
      .where(eq(bookingPages.providerId, providerId))
      .limit(1),
    db
      .select({
        schedule: personalActivitySchedules,
        name: personalActivities.name,
      })
      .from(personalActivitySchedules)
      .innerJoin(
        personalActivities,
        eq(personalActivities.id, personalActivitySchedules.activityId),
      )
      .where(
        and(
          eq(personalActivities.providerId, providerId),
          or(
            sql`${personalActivitySchedules.moves} <> '{}'::jsonb`,
            and(
              lt(personalActivitySchedules.startsAt, range.endsAt),
              or(
                eq(personalActivitySchedules.recurrence, "weekly"),
                gt(personalActivitySchedules.endsAt, range.startsAt),
              ),
            ),
          ),
        ),
      ),
  ]);
  return rows.flatMap(({ schedule, name }) =>
    expandPersonalActivityTimes(
      { ...schedule, isActive: true },
      range,
      pages[0]?.timeZone ?? "UTC",
    ).map((occurrence) => ({
      id: occurrence.id,
      scheduleId: schedule.id,
      activityId: schedule.activityId,
      name,
      originalStartsAt: occurrence.originalStartsAt.toISOString(),
      isMoved: occurrence.moved,
      startsAt: occurrence.startsAt.toISOString(),
      endsAt: occurrence.endsAt.toISOString(),
      ruleStartsAt: schedule.startsAt.toISOString(),
      ruleEndsAt: schedule.endsAt.toISOString(),
      recurrence: schedule.recurrence,
    })),
  );
}

export async function loadPersonalActivityBusyTimes(
  bookingPageId: string,
  range: { startsAt: Date; endsAt: Date },
) {
  const [page] = await db
    .select({ providerId: bookingPages.providerId })
    .from(bookingPages)
    .where(eq(bookingPages.id, bookingPageId))
    .limit(1);
  if (!page) return [];
  const occurrences = await listPersonalActivityOccurrences(
    page.providerId,
    range,
  );
  // Only time ranges are used by public availability; names stay private.
  return occurrences.map(({ startsAt, endsAt }) => ({
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  }));
}
