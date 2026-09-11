import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProviderAppointment,
  updateProviderAppointment,
  createPendingProviderAppointment,
} from "@/lib/provider-appointments";
import {
  providerAppointmentCreateSchema,
  providerAppointmentUpdateSchema,
} from "@/lib/provider-appointment";
import { appointments, availabilitySlots, providerStudents } from "@/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  slotLookups: [] as string[],
}));
vi.mock("@/lib/booking-pages", () => ({
  findBookingPage: async () => ({ timeZone: "Europe/Istanbul" }),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const query = {
          innerJoin() {
            return query;
          },
          leftJoin() {
            return query;
          },
          where(condition: Parameters<PgDialect["sqlToQuery"]>[0]) {
            if (table === availabilitySlots)
              state.slotLookups.push(new PgDialect().sqlToQuery(condition).sql);
            return query;
          },
          limit: async () =>
            table === providerStudents
              ? [{ id: "student-id" }]
              : table === availabilitySlots
                ? [{ id: "reusable-slot" }]
                : [{ ...state.rows[0], ...state.inserted.at(-1) }],
          then: (resolve: (rows: Record<string, unknown>[]) => unknown) =>
            resolve(state.rows),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table !== appointments)
          throw new Error("An existing slot must be reused");
        state.inserted.push(values);
      },
    }),
  },
}));

beforeEach(() => {
  state.rows = [];
  state.inserted = [];
  state.slotLookups = [];
});

describe("provider appointment creation", () => {
  it.each(["none", "weekly"] as const)(
    "reports a past start before overlap for a %s session",
    async (recurrence) => {
      state.rows = [scheduleRow("existing", "2020-01-08", null)];
      await expect(
        createProviderAppointment(
          "provider-id",
          providerAppointmentCreateSchema.parse({
            providerStudentId: "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8",
            recurrence,
            startsAt: "2020-01-08T09:15:00Z",
            endsAt: "2020-01-08T10:00:00Z",
          }),
        ),
      ).rejects.toMatchObject({
        code: "past",
        message: "Choose a future date and time for this session.",
      });
      expect(state.inserted).toHaveLength(0);
    },
  );

  it("rejects creating a pending appointment in the past", async () => {
    await expect(
      createPendingProviderAppointment("provider-id", {
        providerStudentId: "student-id",
        studentId: "account-id",
        startsAt: new Date("2020-01-08T09:00:00Z"),
        endsAt: new Date("2020-01-08T09:45:00Z"),
      }),
    ).rejects.toMatchObject({ code: "past" });
    expect(state.inserted).toHaveLength(0);
  });

  it.each(["one-off", "exception", "future"] as const)(
    "rejects moving a %s session into the past before overlap",
    async (scope) => {
      state.rows = [
        {
          ...scheduleRow("existing", "2030-01-08", null),
          recurrence: scope === "one-off" ? "none" : "weekly",
        },
      ];
      await expect(
        updateProviderAppointment(
          "provider-id",
          "existing",
          providerAppointmentUpdateSchema.parse({
            startsAt: "2020-01-08T09:00:00Z",
            endsAt: "2020-01-08T09:45:00Z",
            editScope: scope === "future" ? "future" : "exception",
            ...(scope === "one-off"
              ? {}
              : { occurrenceStartsAt: "2030-01-08T09:00:00Z" }),
          }),
        ),
      ).rejects.toMatchObject({ code: "past" });
      expect(state.inserted).toHaveLength(0);
    },
  );

  it("does not restore a cancelled session into a time occupied by a weekly session", async () => {
    state.rows = [
      {
        ...scheduleRow("cancelled", "2030-01-08", null),
        recurrence: "none",
        status: "cancelled",
      },
      scheduleRow("occupied", "2030-01-08", null),
    ];
    await expect(
      updateProviderAppointment(
        "provider-id",
        "cancelled",
        providerAppointmentUpdateSchema.parse({ status: "scheduled" }),
      ),
    ).rejects.toThrow("This time overlaps Ada's scheduled session");
    expect(state.inserted).toHaveLength(0);
  });

  it.each(["none", "weekly"] as const)(
    "creates a %s session the day after another session at the same time",
    async (recurrence) => {
      state.rows = [scheduleRow("previous-day", "2030-01-07", null)];
      const input = providerAppointmentCreateSchema.parse({
        providerStudentId: "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8",
        recurrence,
        startsAt: "2030-01-08T12:00:00+03:00",
        endsAt: "2030-01-08T12:45:00+03:00",
      });
      await createProviderAppointment("provider-id", input);
      expect(state.inserted).toHaveLength(1);
      expect(state.inserted[0]).toMatchObject({
        slotId: "reusable-slot",
        recurrence,
      });
    },
  );

  it.each(["none", "weekly"] as const)(
    "reuses the slot of a deleted session when creating a %s replacement",
    async (recurrence) => {
      state.rows = [
        scheduleRow(
          "deleted-session",
          "2030-01-08",
          new Date("2030-01-01T00:00:00Z"),
        ),
      ];
      await createProviderAppointment(
        "provider-id",
        providerAppointmentCreateSchema.parse({
          providerStudentId: "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8",
          recurrence,
          startsAt: "2030-01-08T09:00:00Z",
          endsAt: "2030-01-08T09:45:00Z",
        }),
      );
      expect(state.inserted[0]).toMatchObject({
        slotId: "reusable-slot",
        recurrence,
      });
      // Slot lookup must use the time range, not historical appointment status.
      expect(state.slotLookups).toHaveLength(1);
      expect(state.slotLookups[0]).not.toContain('"appointments"');
    },
  );

  it.each(["none", "weekly"] as const)(
    "rejects an actual overlap before inserting a %s session",
    async (recurrence) => {
      state.rows = [scheduleRow("existing", "2030-01-08", null)];
      await expect(
        createProviderAppointment(
          "provider-id",
          providerAppointmentCreateSchema.parse({
            providerStudentId: "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8",
            recurrence,
            startsAt: "2030-01-08T09:15:00Z",
            endsAt: "2030-01-08T10:00:00Z",
          }),
        ),
      ).rejects.toThrow("This time overlaps Ada's scheduled session");
      expect(state.inserted).toHaveLength(0);
    },
  );
});

function scheduleRow(id: string, day: string, deletedAt: Date | null) {
  return {
    id,
    slotId: "reusable-slot",
    startsAt: new Date(`${day}T09:00:00Z`),
    endsAt: new Date(`${day}T09:45:00Z`),
    recurrence: "weekly",
    recurrenceEndsAt: null,
    exceptionForAppointmentId: null,
    exceptionOriginalStartsAt: null,
    status: "scheduled",
    deletedAt,
    providerStudentName: "Ada",
    accountStudentName: null,
    accountStudentEmail: null,
  };
}
