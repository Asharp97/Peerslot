import { describe, expect, it } from "vitest";
import {
  appointmentAgendaQuerySchema,
  appointmentDisplayStatus,
  paginateAppointmentOccurrences,
} from "@/lib/appointment-agenda";
import type { ProviderAppointmentScheduleRow } from "@/lib/provider-appointment-occurrence";

const now = new Date("2030-01-15T09:00:00Z");
function row(index = 1, startsAt = new Date("2030-01-18T09:00:00Z")) {
  return {
    id: `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`,
    owned: true,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    status: "scheduled",
    recurrence: "none",
    recurrenceEndsAt: null,
    exceptionForAppointmentId: null,
    exceptionOriginalStartsAt: null,
    deletedAt: null,
    studentName: "",
    page: { timeZone: "UTC" },
    updatedAt: now,
  } satisfies ProviderAppointmentScheduleRow;
}

describe("appointment agenda pagination", () => {
  it("puts terminal statuses into Past even before their original start and derives completed/expired from end time", () => {
    const rows = [
      row(),
      { ...row(2), status: "cancelled" as const },
      { ...row(3), status: "declined" as const },
      row(4, new Date("2030-01-14T09:00:00Z")),
      {
        ...row(5, new Date("2030-01-14T10:00:00Z")),
        status: "pending" as const,
      },
      row(6, new Date("2030-01-15T08:45:00Z")),
    ];
    expect(
      paginateAppointmentOccurrences(
        rows,
        { view: "upcoming" },
        now,
      ).appointments.map((a) => a.id),
    ).toEqual([rows[5].id, rows[0].id]);
    const past = paginateAppointmentOccurrences(
      rows,
      { view: "past" },
      now,
    ).appointments;
    expect(past.map((a) => appointmentDisplayStatus(a, now))).toEqual([
      "declined",
      "cancelled",
      "expired",
      "completed",
    ]);
    expect(appointmentDisplayStatus({ ...row(), endsAt: now }, now)).toBe(
      "completed",
    );
  });

  it("includes distant one-off and weekly bookings without a 90-day cutoff", () => {
    const future = new Date("2032-03-01T09:00:00Z");
    const rows = [
      row(1, future),
      { ...row(2, future), recurrence: "weekly" as const },
    ];
    const first = paginateAppointmentOccurrences(
      rows,
      { view: "upcoming" },
      now,
    );
    expect(first.appointments).toHaveLength(20);
    expect(first.appointments[0].startsAt).toEqual(future);
    const second = paginateAppointmentOccurrences(
      rows,
      appointmentAgendaQuerySchema.parse({
        view: "upcoming",
        cursor: first.nextCursor,
      }),
      now,
    );
    expect(second.appointments).toHaveLength(20);
    expect(second.appointments[0].startsAt.getTime()).toBeGreaterThan(
      first.appointments.at(-1)!.startsAt.getTime(),
    );
  });

  it("paginates old ended weekly history without missing or duplicating occurrences", () => {
    const rows = [
      {
        ...row(1, new Date("2025-01-01T09:00:00Z")),
        recurrence: "weekly" as const,
        recurrenceEndsAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    const first = paginateAppointmentOccurrences(rows, { view: "past" }, now);
    expect(first.appointments).toHaveLength(20);
    expect(first.appointments[0].startsAt.toISOString()).toBe(
      "2025-12-31T09:00:00.000Z",
    );
    const second = paginateAppointmentOccurrences(
      rows,
      appointmentAgendaQuerySchema.parse({
        view: "past",
        cursor: first.nextCursor,
      }),
      now,
    );
    expect(second.appointments).toHaveLength(20);
    expect(second.appointments[0].startsAt.getTime()).toBeLessThan(
      first.appointments.at(-1)!.startsAt.getTime(),
    );
    const third = paginateAppointmentOccurrences(
      rows,
      appointmentAgendaQuerySchema.parse({
        view: "past",
        cursor: second.nextCursor,
      }),
      now,
    );
    expect(third.appointments).toHaveLength(13);
    expect(third.nextCursor).toBeNull();
    expect(
      new Set(
        [
          ...first.appointments,
          ...second.appointments,
          ...third.appointments,
        ].map((a) => a.id),
      ).size,
    ).toBe(53);
  });

  it.each(["upcoming", "past"] as const)(
    "uses a deterministic cursor for %s appointments with identical start times",
    (view) => {
      const rows = Array.from({ length: 25 }, (_, index) => ({
        ...row(index),
        status:
          view === "past" ? ("cancelled" as const) : ("scheduled" as const),
      }));
      const first = paginateAppointmentOccurrences(rows, { view }, now);
      const second = paginateAppointmentOccurrences(
        rows,
        appointmentAgendaQuerySchema.parse({ view, cursor: first.nextCursor }),
        now,
      );
      expect(
        new Set(
          [...first.appointments, ...second.appointments].map((a) => a.id),
        ).size,
      ).toBe(25);
      expect(second.nextCursor).toBeNull();
    },
  );

  it("suppresses originals for moved, deleted and unowned exceptions without exposing someone else's appointment", () => {
    const series = { ...row(), recurrence: "weekly" as const };
    const first = series.startsAt;
    const second = new Date(first.getTime() + 7 * 86_400_000);
    const third = new Date(first.getTime() + 14 * 86_400_000);
    const moved = {
      ...row(2, new Date(first.getTime() + 86_400_000)),
      exceptionForAppointmentId: series.id,
      exceptionOriginalStartsAt: first,
    };
    const deleted = {
      ...row(3, second),
      deletedAt: now,
      exceptionForAppointmentId: series.id,
      exceptionOriginalStartsAt: second,
    };
    const foreign = {
      ...row(4, third),
      owned: false,
      exceptionForAppointmentId: series.id,
      exceptionOriginalStartsAt: third,
    };
    const result = paginateAppointmentOccurrences(
      [series, moved, deleted, foreign],
      { view: "upcoming" },
      now,
    );
    expect(result.appointments[0].appointmentId).toBe(moved.id);
    expect(result.appointments[0].occurrenceStartsAt).toEqual(first);
    expect(result.appointments.map((a) => a.startsAt)).not.toContainEqual(
      first,
    );
    expect(result.appointments.map((a) => a.startsAt)).not.toContainEqual(
      second,
    );
    expect(result.appointments.map((a) => a.startsAt)).not.toContainEqual(
      third,
    );
    expect(result.appointments).toHaveLength(20);
  });

  it("does not report an empty upcoming page after many suppressed weekly occurrences", () => {
    const series = { ...row(), recurrence: "weekly" as const };
    const exceptions = Array.from({ length: 30 }, (_, index) => {
      const time = new Date(series.startsAt.getTime() + index * 7 * 86_400_000);
      return {
        ...row(index + 2, time),
        exceptionForAppointmentId: series.id,
        exceptionOriginalStartsAt: time,
        deletedAt: now,
      };
    });
    const result = paginateAppointmentOccurrences(
      [series, ...exceptions],
      { view: "upcoming" },
      now,
    );
    expect(result.appointments).toHaveLength(20);
    expect(result.appointments[0].startsAt.getTime()).toBe(
      series.startsAt.getTime() + 30 * 7 * 86_400_000,
    );
    expect(result.nextCursor).not.toBeNull();
  });

  it("keeps weekly wall-clock time across daylight saving", () => {
    const series = {
      ...row(1, new Date("2030-03-03T14:00:00Z")),
      recurrence: "weekly" as const,
      page: { timeZone: "America/New_York" },
    };
    expect(
      paginateAppointmentOccurrences([series], { view: "upcoming" }, now)
        .appointments.slice(0, 2)
        .map((a) => a.startsAt.toISOString()),
    ).toEqual(["2030-03-03T14:00:00.000Z", "2030-03-10T13:00:00.000Z"]);
  });

  it("does not invent endless future occurrences for a cancelled weekly series", () => {
    const series = {
      ...row(),
      recurrence: "weekly" as const,
      status: "cancelled" as const,
    };
    const result = paginateAppointmentOccurrences(
      [series],
      { view: "past" },
      now,
    );
    expect(result.appointments).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
    expect(
      paginateAppointmentOccurrences([series], { view: "upcoming" }, now)
        .appointments,
    ).toEqual([]);
  });
});
