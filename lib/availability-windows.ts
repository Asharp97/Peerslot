import { randomUUID } from "node:crypto";

import { and, asc, eq, isNotNull, ne, notExists } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
} from "@/db/schema";
import {
  availabilityWindowRemovalMode,
  deriveAvailabilitySlots,
  formatInTimeZone,
  type AvailabilityRecurrence,
  type AvailabilityWindowRange,
  type AvailabilityWindowRule,
} from "@/lib/availability-window";
import { availabilityRulesOverlap } from "@/lib/availability-recurrence";
import { findBookingPage } from "@/lib/booking-pages";
import { isPostgresError } from "@/lib/database-errors";
import { loadProviderAppointmentRows } from "@/lib/provider-appointments";
import { findAppointmentConflictInRows } from "@/lib/provider-appointment-occurrence";

type AvailabilityWindowUpdate = {
  startsAt?: Date;
  endsAt?: Date;
  isActive?: boolean;
  recurrence?: AvailabilityRecurrence;
};

export class AvailabilityWindowNotFoundError extends Error {
  constructor() {
    super("Availability window not found");
    this.name = "AvailabilityWindowNotFoundError";
  }
}

export class AvailabilityWindowConflictError extends Error {
  studentName?: string;

  constructor(
    message = "Availability window overlaps another active window",
    studentName?: string,
  ) {
    super(message);
    this.name = "AvailabilityWindowConflictError";
    this.studentName = studentName;
  }
}

export class AvailabilityWindowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityWindowValidationError";
  }
}

export class AvailabilityWindowHasAppointmentsError extends Error {
  constructor() {
    super("Availability with existing appointments cannot change times");
    this.name = "AvailabilityWindowHasAppointmentsError";
  }
}

export async function listAvailabilityWindows(providerId: string) {
  const bookingPage = await requireBookingPage(providerId);
  const [windows, appointmentWindows] = await Promise.all([
    db
      .select()
      .from(availabilityWindows)
      .where(eq(availabilityWindows.bookingPageId, bookingPage.id))
      .orderBy(asc(availabilityWindows.startsAt)),
    db
      .selectDistinct({ id: availabilitySlots.availabilityWindowId })
      .from(availabilitySlots)
      .innerJoin(appointments, eq(appointments.slotId, availabilitySlots.id))
      .innerJoin(
        availabilityWindows,
        eq(availabilityWindows.id, availabilitySlots.availabilityWindowId),
      )
      .where(
        and(
          eq(availabilityWindows.bookingPageId, bookingPage.id),
          isNotNull(availabilitySlots.availabilityWindowId),
        ),
      ),
  ]);
  const appointmentWindowIds = new Set(
    appointmentWindows.flatMap(({ id }) => (id ? [id] : [])),
  );

  return windows.map((window) => ({
    ...presentAvailabilityWindow(window, bookingPage.timeZone),
    hasAppointments: appointmentWindowIds.has(window.id),
  }));
}

export async function createAvailabilityWindow(
  providerId: string,
  rule: AvailabilityWindowRule,
) {
  const bookingPage = await requireBookingPage(providerId);
  validateFutureRange(rule);
  await assertNoActiveOverlap(bookingPage.id, rule, bookingPage.timeZone);
  await assertNoSessionOverlap(providerId, rule, bookingPage.timeZone);

  const windowId = randomUUID();
  const slots = deriveSlots(rule, bookingPage);

  try {
    await db.batch([
      db.insert(availabilityWindows).values({
        id: windowId,
        bookingPageId: bookingPage.id,
        startsAt: rule.startsAt,
        endsAt: rule.endsAt,
        recurrence: rule.recurrence,
      }),
      db.insert(availabilitySlots).values(
        slots.map((slot) => ({
          ...slot,
          teacherId: providerId,
          availabilityWindowId: windowId,
        })),
      ),
    ]);
  } catch (error) {
    throwAvailabilityConflict(error);
  }

  return getAvailabilityWindowResult(windowId, providerId);
}

export async function updateAvailabilityWindow(
  windowId: string,
  providerId: string,
  input: AvailabilityWindowUpdate,
) {
  const current = await requireOwnedAvailabilityWindow(windowId, providerId);
  const range = {
    startsAt: input.startsAt ?? current.window.startsAt,
    endsAt: input.endsAt ?? current.window.endsAt,
  };
  const timesChanged = input.startsAt !== undefined;
  const isActive = input.isActive ?? current.window.isActive;
  const recurrence = input.recurrence ?? current.window.recurrence;
  const ruleChanged = timesChanged || input.recurrence !== undefined;

  if (timesChanged || (isActive && recurrence === "none")) {
    validateFutureRange(range);
  }

  if (isActive) {
    await assertNoActiveOverlap(
      current.bookingPage.id,
      { ...range, recurrence },
      current.bookingPage.timeZone,
      windowId,
    );
    await assertNoSessionOverlap(
      providerId,
      { ...range, recurrence },
      current.bookingPage.timeZone,
    );
  }

  if (ruleChanged && (await windowHasAppointments(windowId))) {
    throw new AvailabilityWindowHasAppointmentsError();
  }

  const updateQuery = db
    .update(availabilityWindows)
    .set({
      ...(timesChanged ? range : {}),
      ...(ruleChanged ? { moves: {} } : {}),
      isActive,
      recurrence,
      updatedAt: new Date(),
    })
    .where(eq(availabilityWindows.id, windowId));

  try {
    if (!isActive) {
      await db.batch([updateQuery, deleteUnbookedWindowSlots(windowId)]);
    } else if (ruleChanged) {
      const slots = deriveSlots(range, current.bookingPage);
      await db.batch([
        db
          .delete(availabilitySlots)
          .where(eq(availabilitySlots.availabilityWindowId, windowId)),
        updateQuery,
        db.insert(availabilitySlots).values(
          slots.map((slot) => ({
            ...slot,
            teacherId: providerId,
            availabilityWindowId: windowId,
          })),
        ),
      ]);
    } else if (!current.window.isActive) {
      const slots = deriveSlots(range, current.bookingPage);
      await db.batch([
        updateQuery,
        db
          .insert(availabilitySlots)
          .values(
            slots.map((slot) => ({
              ...slot,
              teacherId: providerId,
              availabilityWindowId: windowId,
            })),
          )
          .onConflictDoNothing(),
      ]);
    } else {
      await updateQuery;
    }
  } catch (error) {
    throwAvailabilityConflict(error);
  }

  return getAvailabilityWindowResult(windowId, providerId);
}

export async function removeAvailabilityWindow(
  windowId: string,
  providerId: string,
) {
  const current = await requireOwnedAvailabilityWindow(windowId, providerId);

  if (
    current.window.recurrence === "none" &&
    current.window.startsAt <= new Date()
  ) {
    throw new AvailabilityWindowValidationError(
      "Only future availability windows can be removed",
    );
  }

  if (
    availabilityWindowRemovalMode(await windowHasAppointments(windowId)) ===
    "preserve"
  ) {
    await preserveBookedWindow(windowId);
    return {
      deleted: false,
      preservedForAppointments: true,
      window: presentAvailabilityWindow(
        { ...current.window, isActive: false, updatedAt: new Date() },
        current.bookingPage.timeZone,
      ),
    };
  }

  try {
    await db
      .delete(availabilityWindows)
      .where(eq(availabilityWindows.id, windowId));

    return { deleted: true, preservedForAppointments: false, window: null };
  } catch (error) {
    if (!isPostgresError(error, "23503")) {
      throw error;
    }

    await preserveBookedWindow(windowId);
    return {
      deleted: false,
      preservedForAppointments: true,
      window: presentAvailabilityWindow(
        { ...current.window, isActive: false, updatedAt: new Date() },
        current.bookingPage.timeZone,
      ),
    };
  }
}

async function requireBookingPage(providerId: string) {
  const bookingPage = await findBookingPage(providerId);

  if (!bookingPage) {
    throw new AvailabilityWindowNotFoundError();
  }

  return bookingPage;
}

async function requireOwnedAvailabilityWindow(
  windowId: string,
  providerId: string,
) {
  const bookingPage = await requireBookingPage(providerId);
  const [window] = await db
    .select()
    .from(availabilityWindows)
    .where(
      and(
        eq(availabilityWindows.id, windowId),
        eq(availabilityWindows.bookingPageId, bookingPage.id),
      ),
    )
    .limit(1);

  if (!window) {
    throw new AvailabilityWindowNotFoundError();
  }

  return { bookingPage, window };
}

async function assertNoActiveOverlap(
  bookingPageId: string,
  rule: AvailabilityWindowRule,
  timeZone: string,
  excludedWindowId?: string,
) {
  const activeWindows = await db
    .select()
    .from(availabilityWindows)
    .where(
      and(
        eq(availabilityWindows.bookingPageId, bookingPageId),
        eq(availabilityWindows.isActive, true),
        excludedWindowId
          ? ne(availabilityWindows.id, excludedWindowId)
          : undefined,
      ),
    );

  if (
    activeWindows.some((window) =>
      availabilityRulesOverlap(rule, window, timeZone),
    )
  ) {
    throw new AvailabilityWindowConflictError();
  }
}

async function assertNoSessionOverlap(
  providerId: string,
  rule: AvailabilityWindowRule,
  timeZone: string,
) {
  const overlap = findAppointmentConflictInRows(
    (await loadProviderAppointmentRows(providerId)).filter(
      ({ createdByProvider }) => createdByProvider,
    ),
    rule,
    timeZone,
  );

  if (overlap) {
    throw new AvailabilityWindowConflictError(
      `Availability overlaps ${overlap.studentName}'s preset session`,
      overlap.studentName,
    );
  }
}

function validateFutureRange(range: AvailabilityWindowRange) {
  if (range.endsAt <= range.startsAt) {
    throw new AvailabilityWindowValidationError(
      "endsAt must be after startsAt",
    );
  }

  if (range.startsAt <= new Date()) {
    throw new AvailabilityWindowValidationError(
      "startsAt must be in the future",
    );
  }
}

function deriveSlots(
  range: AvailabilityWindowRange,
  bookingPage: {
    appointmentDurationMinutes: number;
    bookingIntervalMinutes: number;
  },
) {
  let slots;

  try {
    slots = deriveAvailabilitySlots(
      range,
      bookingPage.appointmentDurationMinutes,
      bookingPage.bookingIntervalMinutes,
      randomUUID,
    );
  } catch (error) {
    if (error instanceof RangeError) {
      throw new AvailabilityWindowValidationError(error.message);
    }
    throw error;
  }

  if (slots.length === 0) {
    throw new AvailabilityWindowValidationError(
      "Availability window must fit at least one appointment",
    );
  }

  return slots;
}

async function getAvailabilityWindowResult(
  windowId: string,
  providerId: string,
) {
  const current = await requireOwnedAvailabilityWindow(windowId, providerId);
  const slots = await db
    .select({
      id: availabilitySlots.id,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
    })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.availabilityWindowId, windowId))
    .orderBy(asc(availabilitySlots.startsAt));

  return {
    window: presentAvailabilityWindow(
      current.window,
      current.bookingPage.timeZone,
    ),
    slots,
  };
}

async function windowHasAppointments(windowId: string) {
  const [appointment] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(availabilitySlots, eq(availabilitySlots.id, appointments.slotId))
    .where(eq(availabilitySlots.availabilityWindowId, windowId))
    .limit(1);

  return appointment !== undefined;
}

function deleteUnbookedWindowSlots(windowId: string) {
  return db
    .delete(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.availabilityWindowId, windowId),
        notExists(
          db
            .select({ id: appointments.id })
            .from(appointments)
            .where(eq(appointments.slotId, availabilitySlots.id)),
        ),
      ),
    );
}

async function preserveBookedWindow(windowId: string) {
  await db.batch([
    db
      .update(availabilityWindows)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(availabilityWindows.id, windowId)),
    deleteUnbookedWindowSlots(windowId),
  ]);
}

function presentAvailabilityWindow(
  window: typeof availabilityWindows.$inferSelect,
  timeZone: string,
) {
  return {
    ...window,
    timeZone,
    localStartsAt: formatInTimeZone(window.startsAt, timeZone),
    localEndsAt: formatInTimeZone(window.endsAt, timeZone),
  };
}

function throwAvailabilityConflict(error: unknown): never {
  if (isPostgresError(error, "23P01") || isPostgresError(error, "23505")) {
    throw new AvailabilityWindowConflictError();
  }

  throw error;
}
