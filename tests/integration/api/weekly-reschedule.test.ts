import type { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
  bookingPages,
  clientRescheduleUsage,
  providerProfiles,
} from "@/db/schema";
import {
  createProviderAppointment,
  createProviderStudent,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import {
  changeStudentAppointment,
  getStudentRescheduleTimes,
  listAppointmentAgenda,
} from "@/lib/student-appointments";
import { updateBookingPage } from "@/lib/booking-pages";
import {
  consumeClientRescheduleQuery,
  isClientRescheduleLimitError,
} from "@/lib/client-reschedules";

vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } =
    await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite({ extensions: { btree_gist } });
  const database = drizzle(client);
  return {
    db: Object.assign(database, {
      // Match Neon HTTP's transactional batch, including Drizzle result mapping.
      // Each fresh prepared query runs on the PGlite transaction connection.
      batch: async (queries: { _prepare: () => unknown }[]) =>
        client.transaction(async (transaction) => {
          const results = [];
          for (const query of queries) {
            const prepared = query._prepare() as {
              client: unknown;
              execute: () => Promise<unknown>;
            };
            prepared.client = transaction;
            results.push(await prepared.execute());
          }
          return results;
        }),
    }),
  };
});

const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const now = new Date("2030-01-10T09:00:00Z");
const original = new Date("2030-01-18T09:00:00Z");
const target = new Date("2030-01-16T10:00:00Z");
let contactId: string;
let pageId: string;

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}, 30_000);
afterAll(async () => {
  await testDb.$client.close();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  await testDb.execute(sql`truncate table "user" cascade`);
  await testDb.insert(user).values([
    {
      id: "provider",
      name: "Provider",
      email: "provider@example.com",
      emailVerified: true,
    },
    {
      id: "client",
      name: "Client",
      email: "client@example.com",
      emailVerified: true,
    },
    {
      id: "another",
      name: "Another client",
      email: "another@example.com",
      emailVerified: true,
    },
    {
      id: "other-provider",
      name: "Other provider",
      email: "other-provider@example.com",
      emailVerified: true,
    },
  ]);
  await testDb.insert(providerProfiles).values([
    { userId: "provider", restBetweenSessionsMinutes: 0 },
    { userId: "other-provider", restBetweenSessionsMinutes: 0 },
  ]);
  const [page] = await testDb
    .insert(bookingPages)
    .values({
      providerId: "provider",
      slug: "ABCDEFGH",
      timeZone: "Europe/Istanbul",
    })
    .returning();
  pageId = page.id;
  await testDb
    .insert(bookingPages)
    .values({
      providerId: "other-provider",
      slug: "BCDEFGHJ",
      timeZone: "Europe/Istanbul",
    });
  contactId = (
    await createProviderStudent("provider", {
      displayName: "Client",
      email: "client@example.com",
    })
  ).id;
  await testDb
    .insert(availabilityWindows)
    .values({
      bookingPageId: pageId,
      startsAt: target,
      endsAt: new Date("2030-01-16T15:00:00Z"),
      isActive: true,
    });
});
afterEach(() => vi.useRealTimers());

const quota = () => testDb.select().from(clientRescheduleUsage);
const current = (id: string) =>
  testDb
    .select({
      startsAt: availabilitySlots.startsAt,
      status: appointments.status,
    })
    .from(appointments)
    .innerJoin(availabilitySlots, eq(availabilitySlots.id, appointments.slotId))
    .where(eq(appointments.id, id));
async function add(
  startsAt = original,
  recurrence: "none" | "weekly" = "none",
) {
  return createProviderAppointment("provider", {
    providerStudentId: contactId,
    startsAt,
    endsAt: new Date(+startsAt + 1_800_000),
    recurrence,
    color: "#f0d7ff",
    comment: undefined,
  });
}
const reschedule = (
  id: string,
  occurrenceStartsAt = original,
  startsAt = target,
) =>
  changeStudentAppointment("client", id, {
    action: "reschedule",
    occurrenceStartsAt,
    startsAt,
  });

describe("weekly client reschedule enforcement", () => {
  it("defaults to one, persists settings, and enforces database bounds", async () => {
    const [initial] = await testDb
      .select()
      .from(bookingPages)
      .where(eq(bookingPages.id, pageId));
    expect(initial.weeklyRescheduleLimit).toBe(1);
    expect(
      (await updateBookingPage("provider", { weeklyRescheduleLimit: 2 }))
        .weeklyRescheduleLimit,
    ).toBe(2);
    await expect(
      testDb
        .update(bookingPages)
        .set({ weeklyRescheduleLimit: -1 })
        .where(eq(bookingPages.id, pageId)),
    ).rejects.toThrow();
  });

  it("shares the allowance across a client's appointments and keeps cancellation independent", async () => {
    const first = await add();
    const secondStart = new Date("2030-01-19T09:00:00Z");
    const second = await add(secondStart);
    await reschedule(first.id);
    await expect(
      reschedule(second.id, secondStart, new Date(+target + 3_600_000)),
    ).rejects.toThrow("reschedule_limit");
    await expect(
      getStudentRescheduleTimes("client", second.id, secondStart, {
        startsAt: target,
        endsAt: new Date(+target + 7_200_000),
      }),
    ).rejects.toThrow("reschedule_limit");
    const agenda = await listAppointmentAgenda("client", { view: "upcoming" });
    expect(
      agenda.appointments.every(
        (a) => !a.canReschedule && a.canChange && a.reschedulesRemaining === 0,
      ),
    ).toBe(true);
    expect(agenda.appointments[0].rescheduleResetsAt).toBe(
      "2030-01-13T21:00:00.000Z",
    );
    await changeStudentAppointment("client", second.id, {
      action: "cancel",
      occurrenceStartsAt: secondStart,
    });
    expect((await quota())[0].rescheduleCount).toBe(1);
    expect((await current(second.id))[0].status).toBe("cancelled");
  });

  it("cannot reset the allowance by moving a recurring occurrence into a new exception record", async () => {
    const series = await add(original, "weekly");
    const moved = await reschedule(series.id);
    expect(moved.id).not.toBe(series.id);
    await expect(
      reschedule(moved.id, original, new Date(+target + 3_600_000)),
    ).rejects.toThrow("reschedule_limit");
    await expect(
      reschedule(
        series.id,
        new Date(+original + 7 * 86_400_000),
        new Date(+target + 7_200_000),
      ),
    ).rejects.toThrow("reschedule_limit");
    expect((await quota())[0].rescheduleCount).toBe(1);
  });

  it("counts successful moves only, while provider changes and cancellations do not use the allowance", async () => {
    const appointment = await add();
    const providerMovedStart = new Date(+original + 3_600_000);
    await updateProviderAppointment("provider", appointment.id, {
      editScope: "exception",
      occurrenceStartsAt: original,
      startsAt: providerMovedStart,
      endsAt: new Date(+providerMovedStart + 1_800_000),
      comment: undefined,
    });
    expect(await quota()).toEqual([]);
    await expect(
      reschedule(
        appointment.id,
        providerMovedStart,
        new Date("2030-01-17T12:00:00Z"),
      ),
    ).rejects.toThrow("unavailable");
    expect(await quota()).toEqual([]);
    await reschedule(appointment.id, providerMovedStart);
    expect((await quota())[0].rescheduleCount).toBe(1);
  });

  it("applies edited limits immediately and permits cancellation when rescheduling is disabled", async () => {
    const appointment = await add();
    await updateBookingPage("provider", { weeklyRescheduleLimit: 0 });
    await expect(reschedule(appointment.id)).rejects.toThrow(
      "reschedule_limit",
    );
    expect(await quota()).toEqual([]);
    const [listed] = (
      await listAppointmentAgenda("client", { view: "upcoming" })
    ).appointments;
    expect(listed).toMatchObject({
      weeklyRescheduleLimit: 0,
      canChange: true,
      canReschedule: false,
    });
    await updateBookingPage("provider", { weeklyRescheduleLimit: 2 });
    await reschedule(appointment.id);
    await reschedule(appointment.id, target, new Date(+target + 3_600_000));
    expect((await quota())[0].rescheduleCount).toBe(2);
    await updateBookingPage("provider", { weeklyRescheduleLimit: 0 });
    await changeStudentAppointment("client", appointment.id, {
      action: "cancel",
      occurrenceStartsAt: new Date(+target + 3_600_000),
    });
    expect((await quota())[0].rescheduleCount).toBe(2);
  });

  it("keeps separate allowances for different providers and different clients", async () => {
    await db.batch([
      consumeClientRescheduleQuery("provider", {
        clientId: "client",
        changedAt: now,
      }),
    ]);
    await db.batch([
      consumeClientRescheduleQuery("other-provider", {
        clientId: "client",
        changedAt: now,
      }),
    ]);
    await db.batch([
      consumeClientRescheduleQuery("provider", {
        clientId: "another",
        changedAt: now,
      }),
    ]);
    expect(await quota()).toHaveLength(3);
    expect((await quota()).every((row) => row.rescheduleCount === 1)).toBe(
      true,
    );
  });

  it("resets on Monday in the provider timezone, not at UTC midnight or the appointment date", async () => {
    const appointment = await add();
    vi.setSystemTime(new Date("2030-01-13T20:59:59Z"));
    await reschedule(appointment.id);
    expect((await quota())[0].weekStartsOn).toBe("2030-01-07");
    vi.setSystemTime(new Date("2030-01-13T21:00:00Z"));
    const [listed] = (
      await listAppointmentAgenda("client", { view: "upcoming" })
    ).appointments;
    expect(listed).toMatchObject({
      canReschedule: true,
      reschedulesRemaining: 1,
    });
    await reschedule(appointment.id, target, new Date(+target + 3_600_000));
    expect((await quota()).map((row) => row.weekStartsOn).sort()).toEqual([
      "2030-01-07",
      "2030-01-14",
    ]);
  });

  it("calculates the reset correctly across daylight saving", async () => {
    await updateBookingPage("provider", { timeZone: "America/New_York" });
    const laterStart = new Date("2030-03-15T14:00:00Z");
    await add(laterStart);
    const sunday = new Date("2030-03-10T16:00:00Z");
    await db.batch([
      consumeClientRescheduleQuery("provider", {
        clientId: "client",
        changedAt: sunday,
      }),
    ]);
    const [listed] = (
      await listAppointmentAgenda("client", { view: "upcoming" }, sunday)
    ).appointments;
    expect(listed).toMatchObject({
      reschedulesRemaining: 0,
      rescheduleResetsAt: "2030-03-11T04:00:00.000Z",
    });
    const monday = new Date("2030-03-11T04:00:00Z");
    expect(
      (await listAppointmentAgenda("client", { view: "upcoming" }, monday))
        .appointments[0].reschedulesRemaining,
    ).toBe(1);
  });

  it("atomically rejects a racing move without changing its appointment or reserving its target slot", async () => {
    const first = await add();
    const secondStart = new Date("2030-01-19T09:00:00Z");
    const second = await add(secondStart);
    // Bypass the advisory read so both mutations reach the database quota guard.
    const inputs = [first.id, second.id].map((id, index) => ({
      id,
      startsAt: new Date(+target + index * 3_600_000),
      occurrenceStartsAt: index ? secondStart : original,
    }));
    const results = await Promise.allSettled(
      inputs.map((input) =>
        updateProviderAppointment(
          "provider",
          input.id,
          {
            editScope: "exception",
            occurrenceStartsAt: input.occurrenceStartsAt,
            startsAt: input.startsAt,
            endsAt: new Date(+input.startsAt + 1_800_000),
            comment: undefined,
          },
          { clientId: "client", changedAt: now },
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejectedIndex = results.findIndex((r) => r.status === "rejected");
    expect(
      isClientRescheduleLimitError(
        (results[rejectedIndex] as PromiseRejectedResult).reason,
      ),
    ).toBe(true);
    expect((await current(inputs[rejectedIndex].id))[0].startsAt).toEqual(
      inputs[rejectedIndex].occurrenceStartsAt,
    );
    expect(
      await testDb
        .select()
        .from(availabilitySlots)
        .where(
          and(
            eq(availabilitySlots.teacherId, "provider"),
            eq(availabilitySlots.startsAt, inputs[rejectedIndex].startsAt),
          ),
        ),
    ).toEqual([]);
    expect((await quota())[0].rescheduleCount).toBe(1);
  });

  it("rolls back a quota claim when a subsequent statement fails", async () => {
    await expect(
      db.batch([
        consumeClientRescheduleQuery("provider", {
          clientId: "client",
          changedAt: now,
        }),
        db
          .select({ failure: sql<number>`1 / 0` })
          .from(sql`(select 1) as failure`),
      ]),
    ).rejects.toThrow();
    expect(await quota()).toEqual([]);
  });
});
