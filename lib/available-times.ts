import { and, eq, gte, gt, isNotNull, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
  bookingPages,
  providerProfiles,
} from "@/db/schema";
import { expandAvailabilityRule } from "@/lib/availability-recurrence";
import { expandProviderAppointmentOccurrences } from "@/lib/provider-appointment-occurrence";
import {
  calculateAvailableTimes,
  type AppointmentForCalculation,
  type AvailabilityBookingPage,
  type AvailableTimeRange,
} from "@/lib/available-time";

const postgresAvailableTimeRepository = {
  async loadActiveWindows(
    bookingPageId: string,
    range: AvailableTimeRange,
    timeZone: string,
  ) {
    const windows = await db
      .select({
        id: availabilityWindows.id,
        startsAt: availabilityWindows.startsAt,
        endsAt: availabilityWindows.endsAt,
        isActive: availabilityWindows.isActive,
        recurrence: availabilityWindows.recurrence,
      })
      .from(availabilityWindows)
      .where(
        and(
          eq(availabilityWindows.bookingPageId, bookingPageId),
          eq(availabilityWindows.isActive, true),
          or(
            and(
              eq(availabilityWindows.recurrence, "weekly"),
              lt(availabilityWindows.startsAt, range.endsAt),
            ),
            and(
              eq(availabilityWindows.recurrence, "none"),
              lt(availabilityWindows.startsAt, range.endsAt),
              gt(availabilityWindows.endsAt, range.startsAt),
            ),
          ),
        ),
      );

    return windows.flatMap((window) =>
      expandAvailabilityRule(window, range, timeZone),
    );
  },

  async loadAppointments(
    bookingPageId: string,
    range: AvailableTimeRange,
    restBetweenSessionsMinutes: number,
  ) {
    const restMilliseconds = restBetweenSessionsMinutes * 60 * 1000;
    const appointmentRange = {
      startsAt: new Date(range.startsAt.getTime() - restMilliseconds),
      endsAt: new Date(range.endsAt.getTime() + restMilliseconds),
    };
    const [bookingPage, rows] = await Promise.all([
      db
        .select({ timeZone: bookingPages.timeZone })
        .from(bookingPages)
        .where(eq(bookingPages.id, bookingPageId))
        .limit(1),
      db
        .select({
          id: appointments.id,
          startsAt: availabilitySlots.startsAt,
          endsAt: availabilitySlots.endsAt,
          recurrence: appointments.recurrence,
          recurrenceEndsAt: appointments.recurrenceEndsAt,
          exceptionForAppointmentId: appointments.exceptionForAppointmentId,
          exceptionOriginalStartsAt: appointments.exceptionOriginalStartsAt,
          status: appointments.status,
          deletedAt: appointments.deletedAt,
        })
        .from(appointments)
        .innerJoin(
          availabilitySlots,
          eq(availabilitySlots.id, appointments.slotId),
        )
        .innerJoin(
          bookingPages,
          eq(bookingPages.providerId, availabilitySlots.teacherId),
        )
        .where(
          and(
            eq(bookingPages.id, bookingPageId),
            or(
              and(
                eq(appointments.recurrence, "weekly"),
                isNull(appointments.exceptionForAppointmentId),
                lt(availabilitySlots.startsAt, appointmentRange.endsAt),
                or(
                  isNull(appointments.recurrenceEndsAt),
                  gt(appointments.recurrenceEndsAt, appointmentRange.startsAt),
                ),
              ),
              and(
                eq(appointments.recurrence, "none"),
                or(
                  and(
                    lt(availabilitySlots.startsAt, appointmentRange.endsAt),
                    gt(availabilitySlots.endsAt, appointmentRange.startsAt),
                  ),
                  and(
                    isNotNull(appointments.exceptionOriginalStartsAt),
                    gte(
                      appointments.exceptionOriginalStartsAt,
                      appointmentRange.startsAt,
                    ),
                    lt(
                      appointments.exceptionOriginalStartsAt,
                      appointmentRange.endsAt,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
    ]);

    return expandProviderAppointmentOccurrences(
      rows.map((row) => ({ ...row, studentName: "Student" })),
      appointmentRange,
      bookingPage[0]?.timeZone ?? "UTC",
    ).map(({ appointmentId, startsAt, endsAt, status }) => ({
      appointmentId,
      startsAt,
      endsAt,
      status,
    }));
  },
};

export async function getAvailableTimesForBookingPage(
  bookingPage: AvailabilityBookingPage,
  range: AvailableTimeRange,
  options: {
    excludedOccurrence?: { appointmentId: string; startsAt: Date };
  } = {},
) {
  const [windows, appointments] = await Promise.all([
    postgresAvailableTimeRepository.loadActiveWindows(
      bookingPage.id,
      range,
      bookingPage.timeZone,
    ),
    postgresAvailableTimeRepository.loadAppointments(
      bookingPage.id,
      range,
      bookingPage.restBetweenSessionsMinutes,
    ),
  ]);

  return calculateAvailableTimes({
    bookingPage,
    range,
    windows,
    appointments: appointments.filter(
      (appointment) =>
        appointment.appointmentId !==
          options.excludedOccurrence?.appointmentId ||
        appointment.startsAt.getTime() !==
          options.excludedOccurrence.startsAt.getTime(),
    ) as AppointmentForCalculation[],
    now: new Date(),
  });
}

async function findPublishedAvailabilityBookingPage(slug: string) {
  const [bookingPage] = await db
    .select({
      id: bookingPages.id,
      timeZone: bookingPages.timeZone,
      appointmentDurationMinutes: bookingPages.appointmentDurationMinutes,
      bookingIntervalMinutes: bookingPages.bookingIntervalMinutes,
      restBetweenSessionsMinutes: providerProfiles.restBetweenSessionsMinutes,
      minimumNoticeHours: bookingPages.minimumNoticeHours,
    })
    .from(bookingPages)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, bookingPages.providerId),
    )
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.isPublished, true)))
    .limit(1);

  return (bookingPage as AvailabilityBookingPage | undefined) ?? null;
}

export async function getAvailableTimesForPublishedBookingPage(
  slug: string,
  range: AvailableTimeRange,
) {
  const bookingPage = await findPublishedAvailabilityBookingPage(slug);

  if (!bookingPage) return null;

  return {
    timeZone: bookingPage.timeZone,
    availableTimes: await getAvailableTimesForBookingPage(bookingPage, range),
  };
}
