import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateAvailableTimes } from "@/lib/available-time";

const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
  available: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: mocks.rows,
      };
      return query;
    },
  },
}));
vi.mock("@/lib/available-times", () => ({
  getAvailableTimesForBookingPage: mocks.available,
}));
vi.mock("@/lib/provider-appointments", () => ({
  updateProviderAppointment: mocks.update,
  ProviderAppointmentConflictError: class extends Error {},
}));
import {
  changeStudentAppointment,
  getStudentRescheduleTimes,
  listStudentAppointments,
} from "@/lib/student-appointments";

const now = new Date("2030-01-15T09:00:00Z");
const oldStart = new Date("2030-01-18T09:00:00Z");
const nearStart = new Date("2030-01-15T10:00:00Z");
function row(startsAt = oldStart) {
  return {
    appointment: {
      id: "appointment-id",
      studentId: "student-id",
      recurrence: "none",
      recurrenceEndsAt: null,
      exceptionForAppointmentId: null,
      exceptionOriginalStartsAt: null,
      deletedAt: null,
      status: "scheduled",
    },
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 60_000),
    page: {
      id: "page-id",
      providerId: "provider-id",
      timeZone: "Europe/Istanbul",
      minimumNoticeHours: 24,
      appointmentDurationMinutes: 30,
      bookingIntervalMinutes: 30,
      isPublished: true,
    },
    providerName: "Provider",
    restBetweenSessionsMinutes: 0,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.rows.mockResolvedValue([row()]);
  mocks.update.mockResolvedValue({
    id: "appointment-id",
    status: "scheduled",
    startsAt: nearStart,
    endsAt: new Date("2030-01-15T10:30:00Z"),
  });
  mocks.available.mockImplementation(async (page, range) =>
    calculateAvailableTimes({
      bookingPage: page,
      range,
      appointments: [],
      now,
      windows: [
        {
          id: "window",
          startsAt: nearStart,
          endsAt: new Date("2030-01-15T11:00:00Z"),
          isActive: true,
        },
      ],
    }),
  );
});
afterEach(() => vi.useRealTimers());

describe("student appointment changes", () => {
  it("offers and accepts a near-term slot when the existing appointment is outside notice", async () => {
    const range = { startsAt: now, endsAt: new Date("2030-01-16T09:00:00Z") };
    const times = await getStudentRescheduleTimes(
      "student-id",
      "appointment-id",
      oldStart,
      range,
    );
    expect(times[0].startsAt).toEqual(nearStart);
    await changeStudentAppointment("student-id", "appointment-id", {
      action: "reschedule",
      occurrenceStartsAt: oldStart,
      startsAt: nearStart,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "provider-id",
      "appointment-id",
      expect.objectContaining({
        startsAt: nearStart,
        endsAt: new Date("2030-01-15T10:30:00Z"),
        editScope: "exception",
      }),
    );
    expect(mocks.available).toHaveBeenCalledWith(
      expect.objectContaining({ minimumNoticeHours: 0 }),
      expect.anything(),
      {
        excludedOccurrence: {
          appointmentId: "appointment-id",
          startsAt: oldStart,
        },
      },
    );
  });
  it.each(["cancel", "reschedule"] as const)(
    "blocks %s when the existing appointment is within notice",
    async (action) => {
      mocks.rows.mockResolvedValue([row(nearStart)]);
      await expect(
        changeStudentAppointment("student-id", "appointment-id", {
          action,
          occurrenceStartsAt: nearStart,
          startsAt: oldStart,
        }),
      ).rejects.toThrow("notice");
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.available).not.toHaveBeenCalled();
    },
  );
  it("cancels an eligible existing appointment without checking new availability", async () => {
    await changeStudentAppointment("student-id", "appointment-id", {
      action: "cancel",
      occurrenceStartsAt: oldStart,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      "provider-id",
      "appointment-id",
      expect.objectContaining({ status: "cancelled" }),
    );
    expect(mocks.available).not.toHaveBeenCalled();
  });
  it("rejects unavailable and past destination times", async () => {
    for (const startsAt of [
      new Date("2030-01-15T08:00:00Z"),
      new Date("2030-01-15T12:00:00Z"),
    ]) {
      await expect(
        changeStudentAppointment("student-id", "appointment-id", {
          action: "reschedule",
          occurrenceStartsAt: oldStart,
          startsAt,
        }),
      ).rejects.toThrow("unavailable");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects missing ownership or a forged original appointment time", async () => {
    await expect(
      changeStudentAppointment("student-id", "foreign-id", {
        action: "cancel",
        occurrenceStartsAt: oldStart,
      }),
    ).rejects.toThrow("not_found");
    await expect(
      changeStudentAppointment("student-id", "appointment-id", {
        action: "cancel",
        occurrenceStartsAt: nearStart,
      }),
    ).rejects.toThrow("not_found");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rechecks the existing appointment after loading slots", async () => {
    mocks.rows
      .mockResolvedValueOnce([row()])
      .mockResolvedValue([row(nearStart)]);
    await expect(
      changeStudentAppointment("student-id", "appointment-id", {
        action: "reschedule",
        occurrenceStartsAt: oldStart,
        startsAt: nearStart,
      }),
    ).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("uses the actual time of a moved recurring exception for its notice check", async () => {
    const moved = row(nearStart);
    mocks.rows.mockResolvedValue([
      {
        ...moved,
        appointment: {
          ...moved.appointment,
          exceptionForAppointmentId: "series",
          exceptionOriginalStartsAt: oldStart,
        },
      },
    ]);
    await expect(
      changeStudentAppointment("student-id", "appointment-id", {
        action: "cancel",
        occurrenceStartsAt: oldStart,
      }),
    ).rejects.toThrow("notice");
  });
  it("exposes change eligibility without provider notes", async () => {
    mocks.rows.mockResolvedValue([
      {
        ...row(nearStart),
        appointment: { ...row().appointment, comment: "Private provider note" },
      },
    ]);
    const result = await listStudentAppointments("student-id");
    expect(result[0]).toMatchObject({ canChange: false, canReschedule: false });
    expect(result[0]).not.toHaveProperty("comment");
  });
});
