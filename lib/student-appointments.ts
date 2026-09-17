import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  bookingPages,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import { getAvailableTimesForBookingPage } from "@/lib/available-times";
import type { AvailableTimeRange } from "@/lib/available-time";
import { expandProviderAppointmentOccurrences } from "@/lib/provider-appointment-occurrence";
import {
  ProviderAppointmentConflictError,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import {
  assertStudentAppointmentCanChange,
  StudentAppointmentChangeError,
  studentAppointmentChangeDeadline,
} from "@/lib/student-appointment-policy";

async function loadStudentRows(studentId: string) {
  // Only a verified account can claim an unlinked contact by email. An existing
  // account link always takes precedence over later edits to the contact email.
  const owned = sql<boolean>`coalesce(${or(
    eq(appointments.studentId, studentId),
    and(
      isNull(appointments.studentId),
      eq(user.emailVerified, true),
      sql`lower(btrim(${providerStudents.email})) = lower(btrim(${user.email}))`,
    ),
  )}, false)`;
  const ownedIds = db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(user, eq(user.id, studentId))
    .leftJoin(
      providerStudents,
      eq(providerStudents.id, appointments.providerStudentId),
    )
    .where(owned);
  const rows = await db
    .select({
      owned,
      appointment: appointments,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
      page: bookingPages,
      providerName: providerProfiles.displayName,
      restBetweenSessionsMinutes: providerProfiles.restBetweenSessionsMinutes,
    })
    .from(appointments)
    .innerJoin(user, eq(user.id, studentId))
    .leftJoin(
      providerStudents,
      eq(providerStudents.id, appointments.providerStudentId),
    )
    .innerJoin(availabilitySlots, eq(availabilitySlots.id, appointments.slotId))
    .innerJoin(
      bookingPages,
      eq(bookingPages.providerId, availabilitySlots.teacherId),
    )
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, availabilitySlots.teacherId),
    )
    // Include series exceptions before expanding so moved/cancelled occurrences
    // cannot reappear at the original time. Ownership is applied again afterward.
    .where(
      or(owned, inArray(appointments.exceptionForAppointmentId, ownedIds)),
    );
  return rows.map(({ appointment, ...row }) => ({
    ...appointment,
    ...row,
    studentName: "",
  }));
}

type StudentRow = Awaited<ReturnType<typeof loadStudentRows>>[number];

export async function listStudentAppointments(
  studentId: string,
  now = new Date(),
  range = { startsAt: now, endsAt: new Date(now.getTime() + 90 * 86_400_000) },
) {
  const rows = await loadStudentRows(studentId);
  const pages = new Map(rows.map((row) => [row.page.id, row.page]));
  return [...pages.values()]
    .flatMap((page) =>
      expandProviderAppointmentOccurrences(
        rows.filter((row) => row.page.id === page.id),
        range,
        page.timeZone,
      ),
    )
    .filter(
      (row) =>
        row.owned && (row.status === "pending" || row.status === "scheduled"),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((row) => {
      const changeDeadline = studentAppointmentChangeDeadline(
        row.startsAt,
        row.page.minimumNoticeHours,
      );
      return {
        id: row.appointmentId,
        occurrenceStartsAt: row.occurrenceStartsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        providerName: row.providerName,
        recurrence: row.recurrence,
        timeZone: row.page.timeZone,
        status: row.status,
        minimumNoticeHours: row.page.minimumNoticeHours,
        canChange: row.startsAt > now && now <= changeDeadline,
        canReschedule:
          row.startsAt > now && now <= changeDeadline && row.page.isPublished,
      };
    });
}

async function requireStudentOccurrence(
  studentId: string,
  id: string,
  occurrenceStartsAt: Date,
) {
  const rows = await loadStudentRows(studentId);
  const row = rows.find(
    (candidate) =>
      candidate.id === id && candidate.owned && !candidate.deletedAt,
  );
  if (!row) throw new StudentAppointmentChangeError("not_found");
  if (row.recurrence === "none") {
    if (
      (row.exceptionOriginalStartsAt ?? row.startsAt).getTime() !==
      occurrenceStartsAt.getTime()
    ) {
      throw new StudentAppointmentChangeError("not_found");
    }
    return row;
  }
  const occurrence = expandProviderAppointmentOccurrences(
    rows.filter((candidate) => candidate.page.id === row.page.id),
    {
      startsAt: occurrenceStartsAt,
      endsAt: new Date(occurrenceStartsAt.getTime() + 1),
    },
    row.page.timeZone,
  ).find(
    (candidate) =>
      candidate.appointmentId === id &&
      candidate.occurrenceStartsAt.getTime() === occurrenceStartsAt.getTime(),
  );
  if (!occurrence) throw new StudentAppointmentChangeError("not_found");
  return { ...occurrence, id: row.id };
}

function assertChangeAllowed(current: StudentRow) {
  assertStudentAppointmentCanChange({
    ...current,
    minimumNoticeHours: current.page.minimumNoticeHours,
  });
}

async function rescheduleTimes(current: StudentRow, range: AvailableTimeRange) {
  assertChangeAllowed(current);
  if (!current.page.isPublished)
    throw new StudentAppointmentChangeError("unavailable");
  const duration =
    (current.endsAt.getTime() - current.startsAt.getTime()) / 60_000;
  // The original occurrence has passed the notice check. New targets need only
  // be in the future and satisfy the provider's availability and rest rules.
  const times = await getAvailableTimesForBookingPage(
    {
      ...current.page,
      appointmentDurationMinutes: duration,
      bookingIntervalMinutes: duration + current.restBetweenSessionsMinutes,
      restBetweenSessionsMinutes: current.restBetweenSessionsMinutes,
      minimumNoticeHours: 0,
    },
    range,
    {
      excludedOccurrence: {
        appointmentId: current.id,
        startsAt: current.startsAt,
      },
    },
  );
  const now = new Date();
  return times.filter(
    (time) =>
      time.startsAt > now &&
      time.startsAt.getTime() !== current.startsAt.getTime(),
  );
}

export async function getStudentRescheduleTimes(
  studentId: string,
  id: string,
  occurrenceStartsAt: Date,
  range: AvailableTimeRange,
) {
  const current = await requireStudentOccurrence(
    studentId,
    id,
    occurrenceStartsAt,
  );
  return rescheduleTimes(current, range);
}

export async function changeStudentAppointment(
  studentId: string,
  id: string,
  input: {
    occurrenceStartsAt: Date;
    action: "cancel" | "reschedule";
    startsAt?: Date;
  },
) {
  let current = await requireStudentOccurrence(
    studentId,
    id,
    input.occurrenceStartsAt,
  );
  assertChangeAllowed(current);
  let target: { startsAt: Date; endsAt: Date } | undefined;
  if (input.action === "reschedule") {
    if (!input.startsAt || input.startsAt <= new Date())
      throw new StudentAppointmentChangeError("unavailable");
    const duration = current.endsAt.getTime() - current.startsAt.getTime();
    const times = await rescheduleTimes(current, {
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + duration),
    });
    target = times.find(
      (time) => time.startsAt.getTime() === input.startsAt!.getTime(),
    );
    if (!target) throw new StudentAppointmentChangeError("unavailable");
    // Re-read the stored occurrence after fetching availability: never rely on
    // the original time or notice eligibility supplied by the browser.
    const latest = await requireStudentOccurrence(
      studentId,
      id,
      input.occurrenceStartsAt,
    );
    if (
      latest.startsAt.getTime() !== current.startsAt.getTime() ||
      latest.endsAt.getTime() !== current.endsAt.getTime()
    ) {
      throw new StudentAppointmentChangeError("unavailable");
    }
    current = latest;
    assertChangeAllowed(current);
  }
  try {
    const result = await updateProviderAppointment(
      current.page.providerId,
      id,
      {
        editScope: "exception",
        occurrenceStartsAt: input.occurrenceStartsAt,
        startsAt: target?.startsAt,
        endsAt: target?.endsAt,
        comment: undefined,
        ...(input.action === "cancel" ? { status: "cancelled" as const } : {}),
      },
    );
    // Return no internal provider notes or unrelated account details.
    return {
      id: result.id,
      status: result.status,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    };
  } catch (error) {
    if (error instanceof ProviderAppointmentConflictError)
      throw new StudentAppointmentChangeError("unavailable");
    throw error;
  }
}
