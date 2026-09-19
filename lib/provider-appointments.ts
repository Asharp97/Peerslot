import { randomUUID } from "node:crypto";

import {
  and,
  asc,
  desc,
  ne,
  eq,
  gte,
  gt,
  isNotNull,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import {
  consumeClientRescheduleQuery,
  type ClientReschedule,
} from "@/lib/client-reschedules";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { appointments, availabilitySlots, providerStudents } from "@/db/schema";
import { ProviderStudentEmailConflictError } from "@/lib/provider-student-errors";
import { findBookingPage } from "@/lib/booking-pages";
import { isPostgresError } from "@/lib/database-errors";
import {
  expandProviderAppointmentOccurrences,
  findAppointmentConflictInRows,
} from "@/lib/provider-appointment-occurrence";
import { appointmentTimesChanged } from "@/lib/provider-appointment";
import type {
  ProviderAppointmentCreateInput,
  ProviderAppointmentDeleteInput,
  ProviderAppointmentUpdateInput,
  ProviderStudentCreateInput,
  ProviderStudentUpdateInput,
} from "@/lib/provider-appointment";

export class ProviderAppointmentConflictError extends Error {
  studentName?: string;

  constructor(
    message = "This time overlaps another scheduled appointment",
    studentName?: string,
  ) {
    super(message);
    this.name = "ProviderAppointmentConflictError";
    this.studentName = studentName;
  }
}

export class ProviderAppointmentNotFoundError extends Error {
  constructor() {
    super("Appointment not found");
    this.name = "ProviderAppointmentNotFoundError";
  }
}

export class ProviderAppointmentValidationError extends Error {
  constructor(
    message: string,
    public code?: "past",
  ) {
    super(message);
    this.name = "ProviderAppointmentValidationError";
  }
}

export class ProviderAppointmentReviewConflictError extends Error {
  constructor() {
    super("This appointment request has already been reviewed");
    this.name = "ProviderAppointmentReviewConflictError";
  }
}

export class ProviderStudentNotFoundError extends Error {
  constructor() {
    super("Student not found");
    this.name = "ProviderStudentNotFoundError";
  }
}

const appointmentSelection = {
  id: appointments.id,
  studentId: appointments.studentId,
  slotId: availabilitySlots.id,
  windowId: availabilitySlots.availabilityWindowId,
  accountStudentName: user.name,
  accountStudentEmail: user.email,
  providerStudentId: providerStudents.id,
  providerStudentName: providerStudents.displayName,
  providerStudentEmail: providerStudents.email,
  startsAt: availabilitySlots.startsAt,
  endsAt: availabilitySlots.endsAt,
  recurrence: appointments.recurrence,
  recurrenceEndsAt: appointments.recurrenceEndsAt,
  exceptionForAppointmentId: appointments.exceptionForAppointmentId,
  exceptionOriginalStartsAt: appointments.exceptionOriginalStartsAt,
  status: appointments.status,
  comment: appointments.comment,
  meetingUrl: appointments.meetingUrl,
  meetingSpaceName: appointments.meetingSpaceName,
  color: appointments.color,
  deletedAt: appointments.deletedAt,
  createdByProvider: appointments.createdByProvider,
  rescheduleCount: appointments.rescheduleCount,
  createdAt: appointments.createdAt,
};

export async function listProviderStudents(providerId: string) {
  return db
    .select()
    .from(providerStudents)
    .where(
      and(
        eq(providerStudents.providerId, providerId),
        eq(providerStudents.isActive, true),
      ),
    )
    .orderBy(asc(providerStudents.displayName));
}

export async function createProviderStudent(
  providerId: string,
  input: ProviderStudentCreateInput,
) {
  const email = input.email?.trim().toLowerCase();
  try {
    const existing = email
      ? await findProviderStudentByEmail(providerId, email)
      : undefined;
    if (existing?.isActive) return existing;
    if (existing) {
      const [reactivated] = await db
        .update(providerStudents)
        .set({
          displayName: input.displayName,
          email,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(providerStudents.id, existing.id),
            eq(providerStudents.providerId, providerId),
            eq(providerStudents.isActive, false),
            sql`lower(btrim(${providerStudents.email})) = ${email}`,
          ),
        )
        .returning();
      if (reactivated) return reactivated;
    }

    const [student] = await db
      .insert(providerStudents)
      .values({ providerId, ...input, email })
      .returning();
    return student;
  } catch (error) {
    if (!email || !isPostgresError(error, "23505")) throw error;
    // Another request may have claimed the email after our lookup.
    const existing = await findProviderStudentByEmail(providerId, email, true);
    if (!existing) throw error;
    return existing;
  }
}

async function findProviderStudentByEmail(
  providerId: string,
  email: string,
  activeOnly = false,
  excludedStudentId?: string,
) {
  const [student] = await db
    .select()
    .from(providerStudents)
    .where(
      and(
        eq(providerStudents.providerId, providerId),
        sql`lower(btrim(${providerStudents.email})) = ${email.trim().toLowerCase()}`,
        activeOnly ? eq(providerStudents.isActive, true) : undefined,
        excludedStudentId
          ? ne(providerStudents.id, excludedStudentId)
          : undefined,
      ),
    )
    .orderBy(
      desc(providerStudents.isActive),
      desc(providerStudents.updatedAt),
      asc(providerStudents.id),
    )
    .limit(1);
  return student;
}

export async function updateProviderStudent(
  providerId: string,
  studentId: string,
  input: ProviderStudentUpdateInput,
) {
  try {
    const [student] = await db
      .update(providerStudents)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(providerStudents.id, studentId),
          eq(providerStudents.providerId, providerId),
          eq(providerStudents.isActive, true),
        ),
      )
      .returning();

    if (!student) throw new ProviderStudentNotFoundError();
    return student;
  } catch (error) {
    if (input.email && isPostgresError(error, "23505")) {
      const existing = await findProviderStudentByEmail(
        providerId,
        input.email,
        true,
        studentId,
      );
      if (existing)
        throw new ProviderStudentEmailConflictError(existing.displayName);
    }
    throw error;
  }
}

export async function deleteProviderStudent(
  providerId: string,
  studentId: string,
) {
  const [student] = await db
    .update(providerStudents)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(providerStudents.id, studentId),
        eq(providerStudents.providerId, providerId),
        eq(providerStudents.isActive, true),
      ),
    )
    .returning({ id: providerStudents.id });

  if (!student) throw new ProviderStudentNotFoundError();
  return { deleted: true, appointmentsPreserved: true, id: student.id };
}

export async function listProviderAppointments(
  providerId: string,
  range: { startsAt: Date; endsAt: Date },
) {
  const [rows, bookingPage] = await Promise.all([
    loadProviderAppointmentRows(providerId, range),
    findBookingPage(providerId),
  ]);

  return expandProviderAppointmentOccurrences(
    rows,
    range,
    bookingPage?.timeZone ?? "UTC",
  );
}

export async function listPendingProviderAppointments(providerId: string) {
  const rows = await appointmentQuery()
    .where(
      and(
        eq(availabilitySlots.teacherId, providerId),
        eq(appointments.status, "pending"),
        isNull(appointments.deletedAt),
      ),
    )
    .orderBy(asc(availabilitySlots.startsAt));

  return rows.map(presentAppointmentRow);
}

export async function reviewProviderAppointment(
  providerId: string,
  appointmentId: string,
  decision: "accept" | "decline",
) {
  await requireProviderAppointment(providerId, appointmentId);

  const [appointment] = await db
    .update(appointments)
    .set({
      status: decision === "accept" ? "scheduled" : "declined",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(appointments.status, "pending"),
      ),
    )
    .returning({ id: appointments.id });

  if (!appointment) throw new ProviderAppointmentReviewConflictError();
  return requireProviderAppointment(providerId, appointmentId);
}

export async function createProviderAppointment(
  providerId: string,
  input: ProviderAppointmentCreateInput,
) {
  assertFutureSession(input.startsAt);
  await requireProviderStudent(providerId, input.providerStudentId);
  await assertNoAppointmentOverlap(providerId, input);

  const appointmentId = await insertAppointment(providerId, {
    ...input,
    createdByProvider: true,
  });
  return requireProviderAppointment(providerId, appointmentId);
}

export async function createPendingProviderAppointment(
  providerId: string,
  input: {
    providerStudentId: string;
    studentId: string;
    startsAt: Date;
    endsAt: Date;
    comment?: string;
  },
) {
  assertFutureSession(input.startsAt);
  await requireProviderStudent(providerId, input.providerStudentId);
  await assertNoAppointmentOverlap(providerId, {
    ...input,
    recurrence: "none",
  });

  const appointmentId = await insertAppointment(providerId, {
    ...input,
    recurrence: "none",
    color: "#f0d7ff",
    status: "pending",
    createdByProvider: false,
  });
  return requireProviderAppointment(providerId, appointmentId);
}

export async function updateProviderAppointment(
  providerId: string,
  appointmentId: string,
  input: ProviderAppointmentUpdateInput,
  clientReschedule?: ClientReschedule,
) {
  const current = await requireProviderAppointment(providerId, appointmentId);

  const comparisonRange =
    current.recurrence === "weekly" && input.occurrenceStartsAt
      ? {
          startsAt: input.occurrenceStartsAt,
          endsAt: new Date(
            input.occurrenceStartsAt.getTime() +
              current.endsAt.getTime() -
              current.startsAt.getTime(),
          ),
        }
      : current;
  // Historical notes/status can still be edited, but rescheduling must target
  // a future time. Run this before any overlap check, including series edits.
  if (appointmentTimesChanged(input, comparisonRange)) {
    assertFutureSession(input.startsAt!);
  }

  if (input.editScope === "future") {
    return updateFutureAppointmentSeries(providerId, current, input);
  }

  if (
    input.editScope === "exception" &&
    current.recurrence === "weekly" &&
    !current.exceptionForAppointmentId
  ) {
    return createAppointmentException(
      providerId,
      current,
      input,
      clientReschedule,
    );
  }

  return updateAppointmentRecord(providerId, current, input, clientReschedule);
}

export async function deleteProviderAppointment(
  providerId: string,
  appointmentId: string,
  input: ProviderAppointmentDeleteInput,
) {
  const current = await requireProviderAppointment(providerId, appointmentId);

  if (input.deleteScope === "future") {
    const series = current.exceptionForAppointmentId
      ? await requireProviderAppointment(
          providerId,
          current.exceptionForAppointmentId,
        )
      : current;
    await validateSeriesCutoff(providerId, series, input.occurrenceStartsAt);
    await endAppointmentSeries(series.id, input.occurrenceStartsAt);
    return { deleted: true, scope: "future" as const };
  }

  if (current.recurrence !== "weekly" || current.exceptionForAppointmentId) {
    await softDeleteAppointment(current.id);
    return { deleted: true, scope: "occurrence" as const };
  }

  await validateSeriesCutoff(providerId, current, input.occurrenceStartsAt);
  const duration = current.endsAt.getTime() - current.startsAt.getTime();
  await insertAppointment(providerId, {
    providerStudentId: current.providerStudentId!,
    startsAt: input.occurrenceStartsAt,
    endsAt: new Date(input.occurrenceStartsAt.getTime() + duration),
    recurrence: "none",
    exceptionForAppointmentId: current.id,
    exceptionOriginalStartsAt: input.occurrenceStartsAt,
    comment: current.comment,
    color: current.color,
    status: current.status,
    deletedAt: new Date(),
    createdByProvider: true,
  });
  return { deleted: true, scope: "occurrence" as const };
}

async function updateFutureAppointmentSeries(
  providerId: string,
  current: Awaited<ReturnType<typeof requireProviderAppointment>>,
  input: ProviderAppointmentUpdateInput,
) {
  if (!input.occurrenceStartsAt) {
    throw new ProviderAppointmentValidationError(
      "The selected recurring occurrence is required",
    );
  }

  const series = current.exceptionForAppointmentId
    ? await requireProviderAppointment(
        providerId,
        current.exceptionForAppointmentId,
      )
    : current;
  await validateSeriesCutoff(providerId, series, input.occurrenceStartsAt);

  const duration = series.endsAt.getTime() - series.startsAt.getTime();
  const range = {
    startsAt: input.startsAt ?? input.occurrenceStartsAt,
    endsAt:
      input.endsAt ?? new Date(input.occurrenceStartsAt.getTime() + duration),
  };
  await assertNoAppointmentOverlapForSeriesSplit(
    providerId,
    series.id,
    input.occurrenceStartsAt,
    { ...range, recurrence: "weekly" },
  );

  const targetSlot = await findSlotByRange(providerId, range);
  const targetSlotId = targetSlot?.id ?? randomUUID();
  const appointmentId = randomUUID();
  const appointmentValues = {
    id: appointmentId,
    providerStudentId: series.providerStudentId!,
    studentId: series.studentId,
    slotId: targetSlotId,
    recurrence: "weekly" as const,
    comment: input.comment !== undefined ? input.comment : series.comment,
    color: input.color ?? series.color,
    meetingUrl: series.meetingUrl,
    meetingSpaceName: series.meetingSpaceName,
    status: input.status ?? series.status,
    createdByProvider: true,
    rescheduleCount: sql`${series.rescheduleCount} + 1`,
  };
  const endSeries = db
    .update(appointments)
    .set({ recurrenceEndsAt: input.occurrenceStartsAt, updatedAt: new Date() })
    .where(eq(appointments.id, series.id));
  const removeFutureExceptions = db
    .update(appointments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(appointments.exceptionForAppointmentId, series.id),
        gte(appointments.exceptionOriginalStartsAt, input.occurrenceStartsAt),
      ),
    );

  try {
    if (targetSlot) {
      await db.batch([
        db.insert(appointments).values(appointmentValues),
        endSeries,
        removeFutureExceptions,
      ]);
    } else {
      await db.batch([
        db.insert(availabilitySlots).values({
          id: targetSlotId,
          teacherId: providerId,
          ...range,
        }),
        db.insert(appointments).values(appointmentValues),
        endSeries,
        removeFutureExceptions,
      ]);
    }
  } catch (error) {
    if (isPostgresError(error, "23505")) {
      throw new ProviderAppointmentConflictError();
    }
    throw error;
  }

  return requireProviderAppointment(providerId, appointmentId);
}

async function validateSeriesCutoff(
  providerId: string,
  series: Awaited<ReturnType<typeof requireProviderAppointment>>,
  occurrenceStartsAt: Date,
) {
  if (series.recurrence !== "weekly" || series.exceptionForAppointmentId) {
    throw new ProviderAppointmentValidationError(
      "This appointment is not a recurring series",
    );
  }
  if (
    occurrenceStartsAt < series.startsAt ||
    (series.recurrenceEndsAt && occurrenceStartsAt >= series.recurrenceEndsAt)
  ) {
    throw new ProviderAppointmentValidationError(
      "The selected occurrence is outside this recurring series",
    );
  }

  const bookingPage = await findBookingPage(providerId);
  const occurrences = expandProviderAppointmentOccurrences(
    [series],
    {
      startsAt: new Date(occurrenceStartsAt.getTime() - 86_400_000),
      endsAt: new Date(occurrenceStartsAt.getTime() + 86_400_000),
    },
    bookingPage?.timeZone ?? "UTC",
  );
  if (
    !occurrences.some(
      (occurrence) =>
        occurrence.startsAt.getTime() === occurrenceStartsAt.getTime(),
    )
  ) {
    throw new ProviderAppointmentValidationError(
      "The selected date is not an occurrence in this recurring series",
    );
  }
}

async function endAppointmentSeries(
  seriesId: string,
  occurrenceStartsAt: Date,
) {
  await db.batch([
    db
      .update(appointments)
      .set({ recurrenceEndsAt: occurrenceStartsAt, updatedAt: new Date() })
      .where(eq(appointments.id, seriesId)),
    db
      .update(appointments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(appointments.exceptionForAppointmentId, seriesId),
          gte(appointments.exceptionOriginalStartsAt, occurrenceStartsAt),
        ),
      ),
  ]);
}

async function softDeleteAppointment(appointmentId: string) {
  await db
    .update(appointments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, appointmentId));
}

async function createAppointmentException(
  providerId: string,
  series: Awaited<ReturnType<typeof requireProviderAppointment>>,
  input: ProviderAppointmentUpdateInput,
  clientReschedule?: ClientReschedule,
) {
  if (!input.occurrenceStartsAt) {
    throw new ProviderAppointmentValidationError(
      "The selected recurring occurrence is required",
    );
  }

  const duration = series.endsAt.getTime() - series.startsAt.getTime();
  const range = {
    startsAt: input.startsAt ?? input.occurrenceStartsAt,
    endsAt:
      input.endsAt ?? new Date(input.occurrenceStartsAt.getTime() + duration),
  };
  await assertNoAppointmentOverlap(
    providerId,
    { ...range, recurrence: "none" },
    {
      excludedOccurrence: {
        appointmentId: series.id,
        startsAt: input.occurrenceStartsAt,
      },
    },
  );

  const appointmentId = await insertAppointment(
    providerId,
    {
      providerStudentId: series.providerStudentId!,
      studentId: series.studentId ?? undefined,
      ...range,
      recurrence: "none",
      exceptionForAppointmentId: series.id,
      exceptionOriginalStartsAt: input.occurrenceStartsAt,
      comment:
        input.comment !== undefined
          ? input.comment
          : (series.comment ?? undefined),
      color: input.color ?? series.color,
      meetingUrl: series.meetingUrl,
      meetingSpaceName: series.meetingSpaceName,
      status: input.status ?? series.status,
      createdByProvider: true,
      rescheduleCount: sql`${series.rescheduleCount} + 1`,
    },
    clientReschedule,
  );

  return requireProviderAppointment(providerId, appointmentId);
}

async function updateAppointmentRecord(
  providerId: string,
  current: Awaited<ReturnType<typeof requireProviderAppointment>>,
  input: ProviderAppointmentUpdateInput,
  clientReschedule?: ClientReschedule,
) {
  const comparisonRange =
    current.recurrence === "weekly" && input.occurrenceStartsAt
      ? {
          startsAt: input.occurrenceStartsAt,
          endsAt: new Date(
            input.occurrenceStartsAt.getTime() +
              (current.endsAt.getTime() - current.startsAt.getTime()),
          ),
        }
      : current;
  const timesChanged = appointmentTimesChanged(input, comparisonRange);
  const appointmentUpdate = {
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(timesChanged
      ? { rescheduleCount: sql`${appointments.rescheduleCount} + 1` }
      : {}),
    updatedAt: new Date(),
  };

  if (!timesChanged) {
    if (
      input.status === "scheduled" &&
      current.status !== "scheduled" &&
      current.status !== "pending"
    ) {
      await assertNoAppointmentOverlap(
        providerId,
        current,
        current.recurrence === "weekly"
          ? { excludedSeriesId: current.id }
          : { excludedAppointmentId: current.id },
      );
    }
    await db
      .update(appointments)
      .set(appointmentUpdate)
      .where(eq(appointments.id, current.id));
    return requireProviderAppointment(providerId, current.id);
  }

  const range = { startsAt: input.startsAt!, endsAt: input.endsAt! };
  await assertNoAppointmentOverlap(
    providerId,
    { ...range, recurrence: current.recurrence },
    current.recurrence === "weekly"
      ? { excludedSeriesId: current.id }
      : { excludedAppointmentId: current.id },
  );

  const targetSlot = await findSlotByRange(providerId, range);
  const targetSlotId = targetSlot?.id ?? randomUUID();
  const shouldDeleteOldSlot = current.windowId === null;
  const quota = clientReschedule
    ? [consumeClientRescheduleQuery(providerId, clientReschedule)]
    : [];

  try {
    const updateQuery = db
      .update(appointments)
      .set({ ...appointmentUpdate, slotId: targetSlotId })
      .where(eq(appointments.id, current.id));
    const deleteOldSlot = db
      .delete(availabilitySlots)
      .where(
        and(
          eq(availabilitySlots.id, current.slotId),
          notExists(
            db
              .select({ id: appointments.id })
              .from(appointments)
              .where(eq(appointments.slotId, availabilitySlots.id)),
          ),
        ),
      );

    if (targetSlot) {
      await db.batch(
        shouldDeleteOldSlot && current.slotId !== targetSlotId
          ? [updateQuery, deleteOldSlot, ...quota]
          : [updateQuery, ...quota],
      );
    } else {
      const insertSlot = db.insert(availabilitySlots).values({
        id: targetSlotId,
        teacherId: providerId,
        ...range,
      });
      await db.batch(
        shouldDeleteOldSlot
          ? [insertSlot, updateQuery, deleteOldSlot, ...quota]
          : [insertSlot, updateQuery, ...quota],
      );
    }
  } catch (error) {
    if (isPostgresError(error, "23505")) {
      throw new ProviderAppointmentConflictError();
    }
    throw error;
  }

  return requireProviderAppointment(providerId, current.id);
}

type InsertAppointmentInput = {
  meetingUrl?: string | null;
  meetingSpaceName?: string | null;
  providerStudentId: string;
  studentId?: string;
  startsAt: Date;
  endsAt: Date;
  recurrence: "none" | "weekly";
  exceptionForAppointmentId?: string;
  exceptionOriginalStartsAt?: Date;
  comment?: string | null;
  color: string;
  status?: "pending" | "scheduled" | "declined" | "cancelled";
  deletedAt?: Date;
  createdByProvider: boolean;
  rescheduleCount?: number | ReturnType<typeof sql>;
};

async function insertAppointment(
  providerId: string,
  input: InsertAppointmentInput,
  clientReschedule?: ClientReschedule,
) {
  const slot = await findSlotByRange(providerId, input);
  const appointmentId = randomUUID();
  const appointmentValues = {
    id: appointmentId,
    providerStudentId: input.providerStudentId,
    studentId: input.studentId,
    slotId: slot?.id ?? randomUUID(),
    recurrence: input.recurrence,
    exceptionForAppointmentId: input.exceptionForAppointmentId,
    exceptionOriginalStartsAt: input.exceptionOriginalStartsAt,
    comment: input.comment,
    meetingUrl: input.meetingUrl,
    meetingSpaceName: input.meetingSpaceName,
    color: input.color,
    status: input.status,
    deletedAt: input.deletedAt,
    createdByProvider: input.createdByProvider,
    rescheduleCount: input.rescheduleCount,
  };

  try {
    const quota = clientReschedule
      ? [consumeClientRescheduleQuery(providerId, clientReschedule)]
      : [];
    if (slot) {
      if (clientReschedule) {
        await db.batch([
          db.insert(appointments).values(appointmentValues),
          ...quota,
        ]);
      } else {
        await db.insert(appointments).values(appointmentValues);
      }
    } else {
      await db.batch([
        db.insert(availabilitySlots).values({
          id: appointmentValues.slotId,
          teacherId: providerId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        }),
        db.insert(appointments).values(appointmentValues),
        ...quota,
      ]);
    }
  } catch (error) {
    if (isPostgresError(error, "23505")) {
      throw new ProviderAppointmentConflictError();
    }
    throw error;
  }

  return appointmentId;
}

async function requireProviderStudent(providerId: string, studentId: string) {
  const [student] = await db
    .select()
    .from(providerStudents)
    .where(
      and(
        eq(providerStudents.id, studentId),
        eq(providerStudents.providerId, providerId),
        eq(providerStudents.isActive, true),
      ),
    )
    .limit(1);

  if (!student) throw new ProviderStudentNotFoundError();
  return student;
}

async function requireProviderAppointment(
  providerId: string,
  appointmentId: string,
) {
  const [row] = await appointmentQuery()
    .where(
      and(
        eq(appointments.id, appointmentId),
        eq(availabilitySlots.teacherId, providerId),
      ),
    )
    .limit(1);

  if (!row) throw new ProviderAppointmentNotFoundError();
  return presentAppointmentRow(row);
}

export async function loadProviderAppointmentRows(
  providerId: string,
  range?: { startsAt: Date; endsAt: Date },
) {
  const rows = await appointmentQuery().where(
    and(
      eq(availabilitySlots.teacherId, providerId),
      range ? appointmentMayAffectRange(range) : undefined,
    ),
  );
  return rows.map(presentAppointmentRow);
}

function appointmentMayAffectRange(range: { startsAt: Date; endsAt: Date }) {
  return or(
    and(
      eq(appointments.recurrence, "weekly"),
      isNull(appointments.exceptionForAppointmentId),
      lt(availabilitySlots.startsAt, range.endsAt),
      or(
        isNull(appointments.recurrenceEndsAt),
        gt(appointments.recurrenceEndsAt, range.startsAt),
      ),
    ),
    and(
      eq(appointments.recurrence, "none"),
      or(
        and(
          lt(availabilitySlots.startsAt, range.endsAt),
          gt(availabilitySlots.endsAt, range.startsAt),
        ),
        and(
          isNotNull(appointments.exceptionOriginalStartsAt),
          gte(appointments.exceptionOriginalStartsAt, range.startsAt),
          lt(appointments.exceptionOriginalStartsAt, range.endsAt),
        ),
      ),
    ),
  );
}

function appointmentQuery() {
  return db
    .select(appointmentSelection)
    .from(appointments)
    .innerJoin(availabilitySlots, eq(availabilitySlots.id, appointments.slotId))
    .leftJoin(user, eq(user.id, appointments.studentId))
    .leftJoin(
      providerStudents,
      eq(providerStudents.id, appointments.providerStudentId),
    );
}

function presentAppointmentRow(
  row: Awaited<
    ReturnType<ReturnType<typeof appointmentQuery>["limit"]>
  >[number],
) {
  const { accountStudentName, accountStudentEmail, ...appointment } = row;
  return {
    ...appointment,
    studentName:
      appointment.providerStudentName ?? accountStudentName ?? "Student",
    studentEmail:
      appointment.providerStudentEmail ?? accountStudentEmail ?? null,
  };
}

async function assertNoAppointmentOverlap(
  providerId: string,
  candidate: {
    startsAt: Date;
    endsAt: Date;
    recurrence: "none" | "weekly";
  },
  exclusions?: Parameters<typeof findAppointmentConflictInRows>[3],
) {
  const [rows, bookingPage] = await Promise.all([
    loadProviderAppointmentRows(providerId),
    findBookingPage(providerId),
  ]);
  const overlap = findAppointmentConflictInRows(
    rows,
    candidate,
    bookingPage?.timeZone ?? "UTC",
    exclusions,
  );

  if (overlap) {
    throw new ProviderAppointmentConflictError(
      `This time overlaps ${overlap.studentName}'s scheduled session`,
      overlap.studentName,
    );
  }
}

async function assertNoAppointmentOverlapForSeriesSplit(
  providerId: string,
  seriesId: string,
  cutoff: Date,
  candidate: {
    startsAt: Date;
    endsAt: Date;
    recurrence: "weekly";
  },
) {
  const [rows, bookingPage] = await Promise.all([
    loadProviderAppointmentRows(providerId),
    findBookingPage(providerId),
  ]);
  const rowsAfterSplit = rows.map((row) => {
    if (row.id === seriesId) return { ...row, recurrenceEndsAt: cutoff };
    if (
      row.exceptionForAppointmentId === seriesId &&
      row.exceptionOriginalStartsAt &&
      row.exceptionOriginalStartsAt >= cutoff
    ) {
      return { ...row, deletedAt: new Date() };
    }
    return row;
  });
  const overlap = findAppointmentConflictInRows(
    rowsAfterSplit,
    candidate,
    bookingPage?.timeZone ?? "UTC",
  );

  if (overlap) {
    throw new ProviderAppointmentConflictError(
      `This time overlaps ${overlap.studentName}'s scheduled session`,
      overlap.studentName,
    );
  }
}

async function findSlotByRange(
  providerId: string,
  range: { startsAt: Date; endsAt: Date },
) {
  // A slot describes a time range, not whether it is occupied. The occurrence
  // check handles occupancy, including deleted and moved recurring sessions.
  // Reuse the row even when historical appointments still reference it.
  const [slot] = await db
    .select({ id: availabilitySlots.id })
    .from(availabilitySlots)
    .where(
      and(
        eq(availabilitySlots.teacherId, providerId),
        eq(availabilitySlots.startsAt, range.startsAt),
        eq(availabilitySlots.endsAt, range.endsAt),
      ),
    )
    .limit(1);

  return slot ?? null;
}

function assertFutureSession(startsAt: Date) {
  if (startsAt <= new Date()) {
    throw new ProviderAppointmentValidationError(
      "Choose a future date and time for this session.",
      "past",
    );
  }
}
