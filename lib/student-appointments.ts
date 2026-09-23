import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";
import {
  appointmentDisplayStatus,
  paginateAppointmentOccurrences,
  type AppointmentAgendaQuery,
  type AppointmentAgendaPage,
} from "@/lib/appointment-agenda";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  bookingPages,
  clientRescheduleUsage,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import { getAvailableTimesForBookingPage } from "@/lib/available-times";
import type { AvailableTimeRange } from "@/lib/available-time";
import { expandProviderAppointmentOccurrences } from "@/lib/provider-appointment-occurrence";
import { findBookingPage } from "@/lib/booking-pages";
import {
  ProviderAppointmentConflictError,
  loadProviderAppointmentRows,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import {
  assertStudentAppointmentCanChange,
  StudentAppointmentChangeError,
  studentAppointmentChangeRestriction,
  studentRescheduleAllowance,
} from "@/lib/student-appointment-policy";

import { isClientRescheduleLimitError } from "@/lib/client-reschedules";

const providerAccount = alias(user, "appointment_provider_account");

async function loadStudentRows(studentId: string, now = new Date()) {
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
      providerEmail: providerAccount.email,
      providerAvatar: providerAccount.image,
      reschedulesUsed: sql<number>`coalesce(${clientRescheduleUsage.rescheduleCount}, 0)`,
      rescheduleResetsAt: sql<string>`((date_trunc('week', ${now.toISOString()}::timestamptz at time zone ${bookingPages.timeZone}) + interval '7 days') at time zone ${bookingPages.timeZone})::text`,
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
    .innerJoin(
      providerAccount,
      eq(providerAccount.id, availabilitySlots.teacherId),
    )
    .leftJoin(
      clientRescheduleUsage,
      and(
        eq(clientRescheduleUsage.providerId, bookingPages.providerId),
        eq(clientRescheduleUsage.clientId, studentId),
        eq(
          clientRescheduleUsage.weekStartsOn,
          sql`date_trunc('week', ${now.toISOString()}::timestamptz at time zone ${bookingPages.timeZone})::date`,
        ),
      ),
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

async function loadHostingRows(providerId: string, now: Date) {
  const [rows, page] = await Promise.all([
    loadProviderAppointmentRows(providerId),
    findBookingPage(providerId),
  ]);
  if (!page) return [];

  return rows.map(
    (row) =>
      ({
        ...row,
        owned: true,
        page,
        providerName: row.studentName,
        providerAvatar: row.studentAvatar ?? null,
        role: "hosting" as const,
        reschedulesUsed: 0,
        rescheduleResetsAt: now.toISOString(),
        restBetweenSessionsMinutes: 0,
        meetingCreatingAt: null,
        updatedAt: row.createdAt,
      }),
  );
}

async function loadAgendaRows(accountId: string, now: Date) {
  const [studentRows, hostingRows] = await Promise.all([
    loadStudentRows(accountId, now),
    loadHostingRows(accountId, now),
  ]);
  // Prefer the hosting role if the same record also matches this account's
  // contact email. Include exceptions before recurrence expansion as usual.
  const hostingIds = new Set(hostingRows.map((row) => row.id));
  return [
    ...studentRows
      .filter((row) => !hostingIds.has(row.id))
      .map((row) => ({ ...row, role: "attending" as const })),
    ...hostingRows,
  ];
}

export async function listStudentAppointments(
  studentId: string,
  now = new Date(),
  range = { startsAt: now, endsAt: new Date(now.getTime() + 90 * 86_400_000) },
) {
  const rows = await loadStudentRows(studentId, now);
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
      const canChange = !studentAppointmentChangeRestriction(
        {
          ...row,
          minimumNoticeHours: row.page.minimumNoticeHours,
        },
        now,
      );
      return {
        id: row.appointmentId,
        occurrenceStartsAt: row.occurrenceStartsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        providerName: row.providerName,
        meetingUrl: row.status === "scheduled" ? row.meetingUrl : null,
        recurrence: row.recurrence,
        timeZone: row.page.timeZone,
        status: row.status,
        minimumNoticeHours: row.page.minimumNoticeHours,
        canChange,
        canReschedule:
          canChange &&
          row.page.isPublished &&
          !studentRescheduleAllowance(
            row.page.weeklyRescheduleLimit,
            row.reschedulesUsed,
          ).reached,
        weeklyRescheduleLimit: row.page.weeklyRescheduleLimit,
        reschedulesRemaining: studentRescheduleAllowance(
          row.page.weeklyRescheduleLimit,
          row.reschedulesUsed,
        ).remaining,
        rescheduleResetsAt: new Date(row.rescheduleResetsAt).toISOString(),
      };
    });
}

export async function listAppointmentAgenda(
  accountId: string,
  query: AppointmentAgendaQuery,
  now = new Date(),
): Promise<AppointmentAgendaPage> {
  const page = paginateAppointmentOccurrences(
    await loadAgendaRows(accountId, now),
    query,
    now,
  );
  return {
    nextCursor: page.nextCursor,
    appointments: page.appointments.map((row) => {
      const status = appointmentDisplayStatus(row, now);
      const canChange =
        row.role === "attending" &&
        !studentAppointmentChangeRestriction(
          {
            ...row,
            minimumNoticeHours: row.page.minimumNoticeHours,
          },
          now,
        );
      return {
        id: row.appointmentId,
        occurrenceStartsAt: row.occurrenceStartsAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        providerName: row.providerName,
        providerAvatar: row.providerAvatar,
        role: row.role,
        status,
        meetingUrl: status === "scheduled" ? row.meetingUrl : null,
        timeZone: row.page.timeZone,
        minimumNoticeHours: row.page.minimumNoticeHours,
        canChange,
        canReschedule:
          canChange &&
          row.page.isPublished &&
          !studentRescheduleAllowance(
            row.page.weeklyRescheduleLimit,
            row.reschedulesUsed,
          ).reached,
        weeklyRescheduleLimit: row.page.weeklyRescheduleLimit,
        reschedulesRemaining: studentRescheduleAllowance(
          row.page.weeklyRescheduleLimit,
          row.reschedulesUsed,
        ).remaining,
        rescheduleResetsAt: new Date(row.rescheduleResetsAt).toISOString(),
      };
    }),
  };
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

function assertRescheduleAllowed(current: StudentRow) {
  if (
    studentRescheduleAllowance(
      current.page.weeklyRescheduleLimit,
      current.reschedulesUsed,
    ).reached
  ) {
    throw new StudentAppointmentChangeError("reschedule_limit");
  }
}

async function rescheduleTimes(current: StudentRow, range: AvailableTimeRange) {
  assertChangeAllowed(current);
  assertRescheduleAllowed(current);
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

export async function getStudentAppointmentChangeContext(
  studentId: string,
  id: string,
  occurrenceStartsAt: Date,
) {
  const current = await requireStudentOccurrence(
    studentId,
    id,
    occurrenceStartsAt,
  );
  return {
    appointmentId: current.id,
    endsAt: current.endsAt,
    previousEndsAt: current.endsAt,
    previousStartsAt: current.startsAt,
    providerEmail: current.providerEmail,
    providerName: current.providerName,
    startsAt: current.startsAt,
    studentName: current.studentName,
    timeZone: current.page.timeZone,
  };
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
    assertRescheduleAllowed(current);
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
      input.action === "reschedule"
        ? { clientId: studentId, changedAt: new Date() }
        : undefined,
    );
    // Return no internal provider notes or unrelated account details.
    return {
      id: result.id,
      status: result.status,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
    };
  } catch (error) {
    if (isClientRescheduleLimitError(error))
      throw new StudentAppointmentChangeError("reschedule_limit");
    if (error instanceof ProviderAppointmentConflictError)
      throw new StudentAppointmentChangeError("unavailable");
    throw error;
  }
}
