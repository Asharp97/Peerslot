import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  availabilityWindows,
  personalActivities,
  personalActivitySchedules,
} from "@/db/schema";
import { findBookingPage } from "@/lib/booking-pages";
import { loadProviderAppointmentRows } from "@/lib/provider-appointments";
import { findAppointmentConflictInRows } from "@/lib/provider-appointment-occurrence";
import { loadPersonalActivityBusyTimes } from "@/lib/personal-activities";
import {
  CalendarMoveError,
  expandAvailableSlots,
  findOriginalCalendarBlock,
  type CalendarMoveInput,
  type CalendarMoves,
} from "@/lib/calendar-moves";

type Kind = "availability" | "personal";
function missing(): never {
  throw new CalendarMoveError(
    "calendar_block_missing",
    "This calendar block no longer exists. Refresh and try again.",
  );
}
function conflict(): never {
  throw new CalendarMoveError(
    "calendar_block_conflict",
    "This time is already occupied. Choose another time.",
  );
}

async function loadBlock(
  kind: Kind,
  providerId: string,
  id: string,
  originalStartsAt: Date,
) {
  const page = await findBookingPage(providerId);
  if (!page) missing();
  const [rule] =
    kind === "availability"
      ? await db
          .select()
          .from(availabilityWindows)
          .where(
            and(
              eq(availabilityWindows.id, id),
              eq(availabilityWindows.bookingPageId, page.id),
              eq(availabilityWindows.isActive, true),
            ),
          )
          .limit(1)
      : (
          await db
            .select({ schedule: personalActivitySchedules })
            .from(personalActivitySchedules)
            .innerJoin(
              personalActivities,
              eq(personalActivities.id, personalActivitySchedules.activityId),
            )
            .where(
              and(
                eq(personalActivitySchedules.id, id),
                eq(personalActivities.providerId, providerId),
              ),
            )
            .limit(1)
        ).map(({ schedule }) => ({ ...schedule, isActive: true }));
  if (!rule) missing();
  const key = originalStartsAt.toISOString();
  const move = rule.moves[key];
  if (move === null) missing();
  // Saved moves remain editable even if the provider later changes the slot grid.
  const original = move
    ? { startsAt: new Date(move.startsAt), endsAt: new Date(move.endsAt) }
    : findOriginalCalendarBlock(
        rule,
        originalStartsAt,
        page.timeZone,
        kind === "availability"
          ? {
              duration: page.appointmentDurationMinutes,
              interval: page.bookingIntervalMinutes,
            }
          : undefined,
      );
  if (!original) missing();
  const current =
    kind === "availability"
      ? {
          ...original,
          endsAt: new Date(
            original.startsAt.getTime() +
              page.appointmentDurationMinutes * 60_000,
          ),
        }
      : original;
  return { page, rule, key, current };
}

async function assertUnbooked(
  providerId: string,
  range: { startsAt: Date; endsAt: Date },
  timeZone: string,
) {
  if (
    findAppointmentConflictInRows(
      await loadProviderAppointmentRows(providerId, range),
      { ...range, recurrence: "none" },
      timeZone,
    )
  )
    conflict();
}

async function saveMove(
  kind: Kind,
  id: string,
  key: string,
  move: CalendarMoves[string],
) {
  // Merge one occurrence atomically so simultaneous edits to different blocks
  // do not replace each other's exceptions.
  const patch = JSON.stringify({ [key]: move });
  const rows =
    kind === "availability"
      ? await db
          .update(availabilityWindows)
          .set({
            moves: sql`${availabilityWindows.moves} || ${patch}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(availabilityWindows.id, id))
          .returning({ id: availabilityWindows.id })
      : await db
          .update(personalActivitySchedules)
          .set({
            moves: sql`${personalActivitySchedules.moves} || ${patch}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(personalActivitySchedules.id, id))
          .returning({ id: personalActivitySchedules.id });
  if (!rows.length) missing();
}

export async function moveCalendarBlock(
  kind: Kind,
  providerId: string,
  id: string,
  input: CalendarMoveInput,
) {
  const { page, key, current } = await loadBlock(
    kind,
    providerId,
    id,
    input.originalStartsAt,
  );
  const duration =
    kind === "availability"
      ? page.appointmentDurationMinutes * 60_000
      : current.endsAt.getTime() - current.startsAt.getTime();
  const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + duration);
  if (
    endsAt <= input.startsAt ||
    endsAt.getTime() - input.startsAt.getTime() > 86_400_000 ||
    (kind === "availability" &&
      endsAt.getTime() - input.startsAt.getTime() !== duration)
  ) {
    throw new CalendarMoveError(
      "calendar_block_invalid",
      "Choose a valid time range. Available blocks must keep the appointment duration.",
    );
  }
  if (kind === "availability") {
    if (input.startsAt <= new Date() || current.startsAt <= new Date())
      throw new CalendarMoveError(
        "calendar_block_past",
        "Choose a future time for availability.",
      );
    const target = { startsAt: input.startsAt, endsAt };
    await assertUnbooked(providerId, current, page.timeZone);
    const rest =
      (page.bookingIntervalMinutes - page.appointmentDurationMinutes) * 60_000;
    await assertUnbooked(
      providerId,
      {
        startsAt: new Date(target.startsAt.getTime() - rest),
        endsAt: new Date(target.endsAt.getTime() + rest),
      },
      page.timeZone,
    );
    if ((await loadPersonalActivityBusyTimes(page.id, target)).length)
      conflict();
    const windows = await db
      .select()
      .from(availabilityWindows)
      .where(
        and(
          eq(availabilityWindows.bookingPageId, page.id),
          eq(availabilityWindows.isActive, true),
        ),
      );
    for (const window of windows) {
      const slots = expandAvailableSlots(
        window,
        target,
        page.timeZone,
        page.appointmentDurationMinutes,
        page.bookingIntervalMinutes,
      );
      if (
        slots.some(
          (slot) =>
            !(window.id === id && slot.originalStartsAt.toISOString() === key),
        )
      )
        conflict();
    }
  }
  await saveMove(kind, id, key, {
    startsAt: input.startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  });
  return { moved: true, startsAt: input.startsAt, endsAt };
}

export async function removeMovedCalendarBlock(
  kind: Kind,
  providerId: string,
  id: string,
  originalStartsAt: Date,
) {
  const { page, rule, key, current } = await loadBlock(
    kind,
    providerId,
    id,
    originalStartsAt,
  );
  if (!Object.hasOwn(rule.moves, key)) missing();
  if (kind === "availability")
    await assertUnbooked(providerId, current, page.timeZone);
  await saveMove(kind, id, key, null);
  return { deleted: true };
}
