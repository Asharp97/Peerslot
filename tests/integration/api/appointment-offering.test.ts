import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { eq, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } =
    await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite({ extensions: { btree_gist } });
  return {
    db: Object.assign(drizzle(client), {
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
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/google-meet", () => ({ attachAppointmentMeeting: vi.fn() }));

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
  bookingPages,
  personalActivities,
  providerProfiles,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { PATCH as changeOffering } from "@/app/api/account/appointment-offering/route";
import { GET as workspace, POST as onboarding } from "@/app/api/provider/route";
import { POST as newSession } from "@/app/api/provider/appointments/route";
import { POST as newAvailability } from "@/app/api/availability-windows/route";
import { PATCH as publish } from "@/app/api/booking-page/route";
import { POST as newClient } from "@/app/api/provider/students/route";
import { POST as newActivity } from "@/app/api/provider/personal-activities/route";
import { POST as scheduleActivity } from "@/app/api/provider/personal-activities/schedules/route";
import { findPublishedBookingPage } from "@/lib/booking-pages";
import { getAvailableTimesForPublishedBookingPage } from "@/lib/available-times";
import {
  createPublicAppointmentRequest,
  PublicAppointmentRequestPageNotFoundError,
} from "@/lib/public-appointment-request";
import {
  changeStudentAppointment,
  listAppointmentAgenda,
} from "@/lib/student-appointments";
import { isPostgresError } from "@/lib/database-errors";

const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const range = {
  startsAt: new Date("2030-01-14T00:00:00Z"),
  endsAt: new Date("2030-01-21T00:00:00Z"),
};
const startsAt = new Date("2030-01-15T09:00:00Z");
const endsAt = new Date("2030-01-15T09:30:00Z");
let identity: string | null = "host";
const request = (body: unknown = {}, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/account/appointment-offering", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
const toggle = (offersAppointments: boolean) =>
  changeOffering(request({ offersAppointments }));

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}, 30_000);
afterAll(async () => {
  await testDb.$client.close();
});
beforeEach(async () => {
  await testDb.execute(sql`truncate table "user" cascade`);
  await testDb.insert(user).values([
    {
      id: "host",
      name: "Ceyda",
      email: "host@example.com",
      offersAppointments: true,
      emailVerified: true,
    },
    {
      id: "client",
      name: "Ali",
      email: "client@example.com",
      emailVerified: true,
    },
  ]);
  await testDb
    .insert(providerProfiles)
    .values({
      userId: "host",
      displayName: "Ceyda",
      restBetweenSessionsMinutes: 0,
    });
  await testDb
    .insert(bookingPages)
    .values({
      providerId: "host",
      slug: "CEYDA123",
      title: "Ceyda appointments",
      minimumNoticeHours: 0,
    });
  identity = "host";
  vi.mocked(getCurrentUser).mockImplementation(async () => {
    if (!identity) return null;
    const [row] = await testDb
      .select({ user, provider: providerProfiles })
      .from(user)
      .leftJoin(providerProfiles, eq(user.id, providerProfiles.userId))
      .where(eq(user.id, identity));
    return {
      ...row,
      authentication: "jwt",
      capabilities: { canBook: true, canProvide: row.provider !== null },
    };
  });
});

async function addAppointment(status: "pending" | "scheduled" = "scheduled") {
  const [slot] = await testDb
    .insert(availabilitySlots)
    .values({ teacherId: "host", startsAt, endsAt })
    .returning();
  const [appointment] = await testDb
    .insert(appointments)
    .values({ slotId: slot.id, studentId: "client", status })
    .returning();
  return appointment;
}

describe("appointment offering", () => {
  it("backfills existing providers on and clients off without losing records", async () => {
    const old = new PGlite({ extensions: { btree_gist } });
    try {
      const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
      for (const migration of migrations.slice(0, -1))
        for (const statement of migration.sql) await old.exec(statement);
      await old.exec(`INSERT INTO "user" (id,name,email) VALUES ('host','Ceyda','h@example.com'),('client','Ali','c@example.com');
        INSERT INTO provider_profiles (user_id) VALUES ('host');`);
      await old.exec(
        readFileSync("drizzle/0029_appointment_offering.sql", "utf8"),
      );
      expect(
        (
          await old.query(
            'SELECT id, offers_appointments FROM "user" ORDER BY id',
          )
        ).rows,
      ).toEqual([
        { id: "client", offers_appointments: false },
        { id: "host", offers_appointments: true },
      ]);
      expect(
        (await old.query("SELECT setup_completed FROM provider_profiles")).rows,
      ).toEqual([{ setup_completed: true }]);
    } finally {
      await old.close();
    }
  });

  it("requires authentication and rejects cross-origin or malformed changes", async () => {
    identity = null;
    expect((await toggle(false)).status).toBe(401);
    identity = "host";
    expect(
      (
        await changeOffering(
          request({ offersAppointments: false }, "https://other.example"),
        )
      ).status,
    ).toBe(403);
    for (const body of [
      {},
      { offersAppointments: "false" },
      { offersAppointments: false, userId: "client" },
    ]) {
      expect((await changeOffering(request(body))).status).toBe(400);
    }
    expect(
      (await testDb.select().from(user).where(eq(user.id, "host")))[0]
        .offersAppointments,
    ).toBe(true);
  });

  it("persists both directions, preserves link/settings, and never affects another account", async () => {
    const [page] = await testDb.select().from(bookingPages);
    expect((await toggle(false)).status).toBe(200);
    expect(await (await workspace(request())).json()).toMatchObject({
      offersAppointments: false,
      status: "active",
    });
    expect(await (await toggle(true)).json()).toEqual({
      offersAppointments: true,
      setupRequired: false,
    });
    expect((await testDb.select().from(bookingPages))[0]).toEqual(page);
    expect(
      (await testDb.select().from(user).where(eq(user.id, "client")))[0]
        .offersAppointments,
    ).toBe(false);
  });

  it("requires pending requests to be reviewed before pausing", async () => {
    const appointment = await addAppointment("pending");
    const response = await toggle(false);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "pending_requests" });
    expect(
      (await testDb.select().from(user).where(eq(user.id, "host")))[0]
        .offersAppointments,
    ).toBe(true);
    await testDb
      .update(appointments)
      .set({ status: "declined" })
      .where(eq(appointments.id, appointment.id));
    expect((await toggle(false)).status).toBe(200);
  });

  it("keeps an unpublished page unpublished after pausing and resuming", async () => {
    await testDb.update(bookingPages).set({ isPublished: false });
    await toggle(false);
    await toggle(true);
    expect(await findPublishedBookingPage("CEYDA123")).toBeNull();
    expect((await testDb.select().from(bookingPages))[0].slug).toBe("CEYDA123");
  });

  it("blocks public page, availability and stale booking requests while paused", async () => {
    expect(await findPublishedBookingPage("CEYDA123")).not.toBeNull();
    await toggle(false);
    expect(await findPublishedBookingPage("CEYDA123")).toBeNull();
    expect(
      await getAvailableTimesForPublishedBookingPage("CEYDA123", range),
    ).toBeNull();
    await expect(
      createPublicAppointmentRequest(
        "CEYDA123",
        { startsAt },
        {
          studentId: "client",
          studentName: "Ali",
          studentEmail: "client@example.com",
        },
      ),
    ).rejects.toBeInstanceOf(PublicAppointmentRequestPageNotFoundError);
    // A browser that read the page before the switch cannot bypass the DB guard.
    await expect(addAppointment("pending")).rejects.toSatisfy(
      (error: unknown) =>
        isPostgresError(error, "P0001", "appointment_offering_paused"),
    );
    expect(await testDb.select().from(appointments)).toHaveLength(0);
    await toggle(true);
    expect(await findPublishedBookingPage("CEYDA123")).not.toBeNull();
  });

  it.each([
    ["client sessions", newSession],
    ["availability", newAvailability],
    ["publishing", publish],
    ["clients", newClient],
  ])("blocks direct API creation of %s while off", async (_name, handler) => {
    await toggle(false);
    expect((await handler(request())).status).toBe(403);
  });

  it("keeps existing appointments visible to both parties and cancellable", async () => {
    const appointment = await addAppointment();
    await toggle(false);
    const hostAgenda = await listAppointmentAgenda("host", {
      view: "upcoming",
    });
    const clientAgenda = await listAppointmentAgenda("client", {
      view: "upcoming",
    });
    expect(
      hostAgenda.appointments.some((item) => item.id === appointment.id),
    ).toBe(true);
    expect(
      clientAgenda.appointments.some((item) => item.id === appointment.id),
    ).toBe(true);
    expect(
      await changeStudentAppointment("client", appointment.id, {
        occurrenceStartsAt: startsAt,
        action: "cancel",
      }),
    ).toMatchObject({ status: "cancelled" });
  });

  it("allows eligible existing appointments to be rescheduled while new bookings are paused", async () => {
    const appointment = await addAppointment();
    const [page] = await testDb.select().from(bookingPages);
    const target = new Date("2030-01-16T10:00:00Z");
    await testDb
      .insert(availabilityWindows)
      .values({
        bookingPageId: page.id,
        startsAt: target,
        endsAt: new Date("2030-01-16T10:30:00Z"),
      });
    await toggle(false);
    const changed = await changeStudentAppointment("client", appointment.id, {
      occurrenceStartsAt: startsAt,
      action: "reschedule",
      startsAt: target,
    });
    expect(new Date(changed.startsAt)).toEqual(target);
    expect(changed.status).toBe("scheduled");
    expect(
      (await testDb.select().from(user).where(eq(user.id, "host")))[0]
        .offersAppointments,
    ).toBe(false);
  });

  it("initializes a private personal calendar and supports activities without enabling hosting", async () => {
    identity = "client";
    const setup = await (await workspace(request())).json();
    expect(setup).toMatchObject({
      offersAppointments: false,
      status: "active",
      profile: { setupCompleted: false },
      bookingPage: { isPublished: false },
    });
    const named = await newActivity(
      request({ name: "Lunch", defaultDurationMinutes: 7 }),
    );
    expect(named.status).toBe(201);
    const { activity } = await named.json();
    expect(
      (
        await scheduleActivity(
          request({
            activityId: activity.id,
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 7 * 60_000).toISOString(),
            recurrence: "none",
          }),
        )
      ).status,
    ).toBe(201);
    expect(await testDb.select().from(appointments)).toHaveLength(0);
    expect(await testDb.select().from(personalActivities)).toHaveLength(1);
    expect(await findPublishedBookingPage(setup.bookingPage.slug)).toBeNull();
    expect((await onboarding(request({}))).status).toBe(403);
    expect(await (await toggle(true)).json()).toMatchObject({
      setupRequired: true,
    });
    const configured = await onboarding(
      request({
        locale: "en",
        displayName: "Ali",
        professionalTitle: "Coach",
        timeZone: "Europe/Istanbul",
        defaultAppointmentDurationMinutes: 45,
        minimumBookingNoticeMinutes: 60,
        restBetweenSessionsMinutes: 5,
      }),
    );
    expect(configured.status).toBe(200);
    expect(await configured.json()).toMatchObject({
      profile: { setupCompleted: true },
      bookingPage: {
        slug: setup.bookingPage.slug,
        timeZone: "Europe/Istanbul",
        appointmentDurationMinutes: 45,
        isPublished: true,
      },
    });
    expect(await testDb.select().from(personalActivities)).toHaveLength(1);
  });
});
