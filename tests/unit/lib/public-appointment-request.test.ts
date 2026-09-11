import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPublicAppointmentRequest } from "@/lib/public-appointment-request";

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  loadRows: vi.fn(),
  availableTimes: vi.fn(),
  createStudent: vi.fn(),
  createAppointment: vi.fn(),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        limit: mocks.page,
      };
      return query;
    },
  },
}));
vi.mock("@/lib/available-times", () => ({
  getAvailableTimesForBookingPage: mocks.availableTimes,
}));
vi.mock("@/lib/provider-appointments", () => ({
  loadProviderAppointmentRows: mocks.loadRows,
  createProviderStudent: mocks.createStudent,
  createPendingProviderAppointment: mocks.createAppointment,
  ProviderAppointmentConflictError: class extends Error {},
  ProviderAppointmentValidationError: class extends Error {},
}));

const now = new Date("2030-01-15T08:00:00Z");
const input = { startsAt: new Date("2030-01-20T09:00:00Z") };
const identity = {
  studentId: "authenticated-student",
  studentName: "Ada",
  studentEmail: "ada@example.com",
};
const page = {
  id: "page-id",
  providerId: "provider-id",
  providerEmail: "provider@example.com",
  providerName: "Provider",
  timeZone: "Europe/Istanbul",
  appointmentDurationMinutes: 45,
  bookingIntervalMinutes: 45,
  restBetweenSessionsMinutes: 0,
  minimumNoticeHours: 24,
};
function appointment(overrides: Record<string, unknown> = {}) {
  return {
    id: "existing",
    studentId: null,
    studentName: "Ada",
    studentEmail: "  ADA@EXAMPLE.COM  ",
    startsAt: new Date("2030-01-16T06:00:00Z"),
    endsAt: new Date("2030-01-16T06:45:00Z"),
    status: "scheduled",
    recurrence: "none",
    recurrenceEndsAt: null,
    exceptionForAppointmentId: null,
    exceptionOriginalStartsAt: null,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.page.mockResolvedValue([page]);
  mocks.loadRows.mockResolvedValue([]);
  mocks.availableTimes.mockResolvedValue([input]);
  mocks.createStudent.mockResolvedValue({ id: "provider-student" });
  mocks.createAppointment.mockResolvedValue({ id: "created" });
});
afterEach(() => vi.useRealTimers());

describe("public appointment booking validation", () => {
  it("explains a past time before querying availability or writing records", async () => {
    mocks.availableTimes.mockResolvedValue([]);
    await expect(
      createPublicAppointmentRequest(
        "ABCDEFGH",
        { startsAt: new Date("2030-01-14T09:00:00Z") },
        identity,
      ),
    ).rejects.toMatchObject({ code: "past" });
    expect(mocks.availableTimes).not.toHaveBeenCalled();
    expect(mocks.createStudent).not.toHaveBeenCalled();
    expect(mocks.createAppointment).not.toHaveBeenCalled();
  });

  it("explains when the selected time is inside the booking notice period", async () => {
    await expect(
      createPublicAppointmentRequest(
        "ABCDEFGH",
        { startsAt: new Date("2030-01-15T20:00:00Z") },
        identity,
      ),
    ).rejects.toMatchObject({ code: "minimum_notice", minimumNoticeHours: 24 });
    expect(mocks.availableTimes).not.toHaveBeenCalled();
    expect(mocks.createStudent).not.toHaveBeenCalled();
  });

  it.each(["scheduled", "pending"])(
    "blocks a new booking when a %s session matches the authenticated email",
    async (status) => {
      mocks.loadRows.mockResolvedValue([appointment({ status })]);
      await expect(
        createPublicAppointmentRequest("ABCDEFGH", input, identity),
      ).rejects.toMatchObject({
        code: "upcoming_appointment",
        minimumNoticeHours: 24,
      });
      expect(mocks.loadRows).toHaveBeenCalledWith("provider-id", {
        startsAt: now,
        endsAt: new Date("2030-01-16T08:00:00Z"),
      });
      expect(mocks.createStudent).not.toHaveBeenCalled();
      expect(mocks.createAppointment).not.toHaveBeenCalled();
    },
  );

  it("recognizes an account-linked session even if the provider's saved email differs", async () => {
    mocks.loadRows.mockResolvedValue([
      appointment({
        studentId: identity.studentId,
        studentEmail: "old@example.com",
      }),
    ]);
    await expect(
      createPublicAppointmentRequest("ABCDEFGH", input, identity),
    ).rejects.toMatchObject({ code: "upcoming_appointment" });
  });

  it.each([
    [
      "another student",
      { studentId: "other-id", studentEmail: "different@example.com" },
    ],
    ["cancelled", { status: "cancelled" }],
    ["declined", { status: "declined" }],
    ["deleted", { deletedAt: now }],
    [
      "already started",
      {
        startsAt: new Date("2030-01-15T07:45:00Z"),
        endsAt: new Date("2030-01-15T08:30:00Z"),
      },
    ],
    [
      "exactly at the notice boundary",
      {
        startsAt: new Date("2030-01-16T08:00:00Z"),
        endsAt: new Date("2030-01-16T08:45:00Z"),
      },
    ],
    [
      "beyond the notice boundary",
      {
        startsAt: new Date("2030-01-17T08:00:00Z"),
        endsAt: new Date("2030-01-17T08:45:00Z"),
      },
    ],
  ])(
    "allows a new booking when the existing session is %s",
    async (_label, overrides) => {
      mocks.loadRows.mockResolvedValue([
        appointment(overrides as Record<string, unknown>),
      ]);
      await expect(
        createPublicAppointmentRequest("ABCDEFGH", input, identity),
      ).resolves.toMatchObject({ appointment: { id: "created" } });
      expect(mocks.createAppointment).toHaveBeenCalledOnce();
    },
  );

  it("allows booking when minimum notice is zero", async () => {
    mocks.page.mockResolvedValue([{ ...page, minimumNoticeHours: 0 }]);
    mocks.loadRows.mockResolvedValue([appointment()]);
    await createPublicAppointmentRequest("ABCDEFGH", input, identity);
    expect(mocks.createAppointment).toHaveBeenCalledOnce();
    expect(mocks.loadRows).not.toHaveBeenCalled();
  });

  const weekly = () =>
    appointment({
      recurrence: "weekly",
      startsAt: new Date("2030-01-09T06:00:00Z"),
      endsAt: new Date("2030-01-09T06:45:00Z"),
    });

  it("checks the next weekly occurrence instead of the series' past start date", async () => {
    mocks.loadRows.mockResolvedValue([weekly()]);
    await expect(
      createPublicAppointmentRequest("ABCDEFGH", input, identity),
    ).rejects.toMatchObject({ code: "upcoming_appointment" });
  });

  it.each(["deleted", "cancelled", "moved"])(
    "ignores a weekly occurrence that was %s",
    async (kind) => {
      mocks.loadRows.mockResolvedValue([
        weekly(),
        appointment({
          id: "exception",
          exceptionForAppointmentId: "existing",
          exceptionOriginalStartsAt: new Date("2030-01-16T06:00:00Z"),
          // Deleted markers may not have an account/email; expand before matching.
          studentId: null,
          studentEmail: null,
          ...(kind === "deleted" ? { deletedAt: now } : {}),
          ...(kind === "cancelled" ? { status: "cancelled" } : {}),
          ...(kind === "moved"
            ? {
                startsAt: new Date("2030-01-18T06:00:00Z"),
                endsAt: new Date("2030-01-18T06:45:00Z"),
              }
            : {}),
        }),
      ]);
      await createPublicAppointmentRequest("ABCDEFGH", input, identity);
      expect(mocks.createAppointment).toHaveBeenCalledOnce();
    },
  );

  it("checks a session moved into the notice period at its actual new time", async () => {
    mocks.loadRows.mockResolvedValue([
      {
        ...weekly(),
        startsAt: new Date("2030-01-10T06:00:00Z"),
        endsAt: new Date("2030-01-10T06:45:00Z"),
      },
      appointment({
        id: "exception",
        exceptionForAppointmentId: "existing",
        exceptionOriginalStartsAt: new Date("2030-01-17T06:00:00Z"),
      }),
    ]);
    await expect(
      createPublicAppointmentRequest("ABCDEFGH", input, identity),
    ).rejects.toMatchObject({ code: "upcoming_appointment" });
  });

  it("ignores a weekly series that ended before the next occurrence", async () => {
    mocks.loadRows.mockResolvedValue(
      [weekly()].map((row) => ({
        ...row,
        recurrenceEndsAt: new Date("2030-01-16T06:00:00Z"),
      })),
    );
    await createPublicAppointmentRequest("ABCDEFGH", input, identity);
    expect(mocks.createAppointment).toHaveBeenCalledOnce();
  });
});
