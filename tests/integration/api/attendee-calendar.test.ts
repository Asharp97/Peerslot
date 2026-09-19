import type { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
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
  availabilityWindows,
  bookingPages,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import {
  createProviderAppointment,
  createProviderStudent,
  reviewProviderAppointment,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import { createPublicAppointmentRequest } from "@/lib/public-appointment-request";
import {
  changeStudentAppointment,
  listStudentAppointments,
  listAppointmentAgenda,
} from "@/lib/student-appointments";

vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } =
    await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const database = drizzle(new PGlite({ extensions: { btree_gist } }));
  return {
    db: Object.assign(database, {
      batch: async (queries: PromiseLike<unknown>[]) => {
        const results = [];
        for (const query of queries) results.push(await query);
        return results;
      },
    }),
  };
});
const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const now = new Date("2030-01-10T00:00:00Z");
const range = {
  startsAt: new Date("2030-01-14T00:00:00Z"),
  endsAt: new Date("2030-02-04T00:00:00Z"),
};
const start = new Date("2030-01-15T09:00:00Z");
let studentContactId: string;
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
      id: "ceyda",
      name: "Ceyda",
      email: "ceyda@example.com",
      emailVerified: true,
    },
    {
      id: "attendee",
      name: "Ali",
      email: "ali@example.com",
      emailVerified: true,
    },
    {
      id: "unrelated",
      name: "Other",
      email: "other@example.com",
      emailVerified: true,
    },
  ]);
  await testDb.insert(providerProfiles).values({
    userId: "ceyda",
    displayName: "Ceyda",
    timeZone: "Europe/Istanbul",
    restBetweenSessionsMinutes: 0,
  });
  const [page] = await testDb
    .insert(bookingPages)
    .values({
      providerId: "ceyda",
      slug: "CEYDA123",
      timeZone: "Europe/Istanbul",
      minimumNoticeHours: 24,
      isPublished: true,
    })
    .returning();
  pageId = page.id;
  const contact = await createProviderStudent("ceyda", {
    displayName: "Ali",
    email: "ali@example.com",
  });
  studentContactId = contact.id;
});
afterEach(() => vi.useRealTimers());

async function addWeekly() {
  return createProviderAppointment("ceyda", {
    providerStudentId: studentContactId,
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    recurrence: "weekly",
    color: "#f0d7ff",
    comment: "Private teacher note",
  });
}
const list = (id = "attendee") => listStudentAppointments(id, now, range);

describe("attendee calendar identity and recurrence", () => {
  it.each([false, true])(
    "shows teacher-assigned weekly lessons when the attendee is also a teacher: %s",
    async (isTeacher) => {
      if (isTeacher)
        await testDb.insert(providerProfiles).values({ userId: "attendee" });
      const lesson = await addWeekly();
      await testDb
        .update(providerStudents)
        .set({ email: " ALI@EXAMPLE.COM " })
        .where(eq(providerStudents.id, studentContactId));
      const result = await list();
      expect(result.map((a) => a.startsAt)).toEqual([
        "2030-01-15T09:00:00.000Z",
        "2030-01-22T09:00:00.000Z",
        "2030-01-29T09:00:00.000Z",
      ]);
      expect(
        result.every(
          (a) =>
            a.id === lesson.id &&
            a.providerName === "Ceyda" &&
            a.status === "scheduled",
        ),
      ).toBe(true);
      expect(result[0]).not.toHaveProperty("comment");
      expect(result[0]).not.toHaveProperty("studentEmail");
      expect(await list("unrelated")).toEqual([]);
      expect(await list("ceyda")).toEqual([]);
    },
  );

  it("finds sessions assigned before signup only after the account verifies its email", async () => {
    await testDb.delete(user).where(eq(user.id, "attendee"));
    await addWeekly();
    await testDb.insert(user).values({
      id: "new-attendee",
      name: "Ali",
      email: "ali@example.com",
      emailVerified: false,
    });
    expect(await list("new-attendee")).toEqual([]);
    await expect(
      changeStudentAppointment(
        "new-attendee",
        (await testDb.select().from(appointments))[0].id,
        { action: "cancel", occurrenceStartsAt: start },
      ),
    ).rejects.toThrow("not_found");
    await testDb
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, "new-attendee"));
    expect(await list("new-attendee")).toHaveLength(3);
  });

  it("shows a booking immediately as pending, then reflects teacher acceptance and cancellation", async () => {
    await testDb.insert(availabilityWindows).values({
      bookingPageId: pageId,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      isActive: true,
    });
    const result = await createPublicAppointmentRequest(
      "CEYDA123",
      { startsAt: start },
      {
        studentId: "attendee",
        studentName: "Ali",
        studentEmail: "ali@example.com",
      },
    );
    expect(await list()).toMatchObject([
      { id: result.appointment.id, status: "pending", providerName: "Ceyda" },
    ]);
    await reviewProviderAppointment("ceyda", result.appointment.id, "accept");
    expect(await list()).toMatchObject([
      { id: result.appointment.id, status: "scheduled" },
    ]);
    await changeStudentAppointment("attendee", result.appointment.id, {
      action: "cancel",
      occurrenceStartsAt: start,
    });
    expect(await list()).toEqual([]);
  });

  it("keeps linked bookings with their account when the teacher changes the contact email", async () => {
    const lesson = await addWeekly();
    await testDb
      .update(appointments)
      .set({ studentId: "attendee" })
      .where(eq(appointments.id, lesson.id));
    await testDb
      .update(providerStudents)
      .set({ email: "other@example.com" })
      .where(eq(providerStudents.id, studentContactId));
    expect(await list()).toHaveLength(3);
    expect(await list("unrelated")).toEqual([]);
    await expect(
      changeStudentAppointment("unrelated", lesson.id, {
        action: "cancel",
        occurrenceStartsAt: start,
      }),
    ).rejects.toThrow("not_found");
  });

  it("replaces moved occurrences and removes cancelled occurrences without duplicate originals", async () => {
    const lesson = await addWeekly();
    await updateProviderAppointment("ceyda", lesson.id, {
      editScope: "exception",
      comment: undefined,
      occurrenceStartsAt: start,
      startsAt: new Date("2030-01-16T12:00:00Z"),
      endsAt: new Date("2030-01-16T12:30:00Z"),
    });
    await changeStudentAppointment("attendee", lesson.id, {
      action: "cancel",
      occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
    });
    expect((await list()).map((a) => a.startsAt)).toEqual([
      "2030-01-16T12:00:00.000Z",
      "2030-01-29T09:00:00.000Z",
    ]);
    const moved = (await list())[0];
    expect(moved.occurrenceStartsAt).toBe(start.toISOString());
    await changeStudentAppointment("attendee", moved.id, {
      action: "cancel",
      occurrenceStartsAt: start,
    });
    expect((await list()).map((a) => a.startsAt)).toEqual([
      "2030-01-29T09:00:00.000Z",
    ]);
  });

  it("suppresses an exception assigned to another account without exposing it", async () => {
    const lesson = await addWeekly();
    const moved = await updateProviderAppointment("ceyda", lesson.id, {
      editScope: "exception",
      comment: undefined,
      occurrenceStartsAt: start,
      startsAt: new Date("2030-01-16T12:00:00Z"),
      endsAt: new Date("2030-01-16T12:30:00Z"),
    });
    await testDb
      .update(appointments)
      .set({ studentId: "unrelated" })
      .where(eq(appointments.id, moved.id));
    expect((await list()).map((a) => a.startsAt)).toEqual([
      "2030-01-22T09:00:00.000Z",
      "2030-01-29T09:00:00.000Z",
    ]);
    expect(await list("unrelated")).toMatchObject([
      { id: moved.id, startsAt: "2030-01-16T12:00:00.000Z" },
    ]);
  });

  it("expands weeks beyond 90 days in the teacher's timezone across daylight saving", async () => {
    await testDb
      .update(bookingPages)
      .set({ timeZone: "America/New_York" })
      .where(eq(bookingPages.id, pageId));
    await createProviderAppointment("ceyda", {
      providerStudentId: studentContactId,
      startsAt: new Date("2030-03-03T14:00:00Z"),
      comment: undefined,
      endsAt: new Date("2030-03-03T14:30:00Z"),
      recurrence: "weekly",
      color: "#f0d7ff",
    });
    const result = await listStudentAppointments("attendee", now, {
      startsAt: new Date("2030-03-01T00:00:00Z"),
      endsAt: new Date("2030-03-12T00:00:00Z"),
    });
    expect(result.map((a) => a.startsAt)).toEqual([
      "2030-03-03T14:00:00.000Z",
      "2030-03-10T13:00:00.000Z",
    ]);
    const later = await listStudentAppointments("attendee", now, {
      startsAt: new Date("2030-06-01T00:00:00Z"),
      endsAt: new Date("2030-06-08T00:00:00Z"),
    });
    expect(later.map((a) => a.startsAt)).toEqual(["2030-06-02T13:00:00.000Z"]);
  });
});

describe("appointment agenda real database", () => {
  it("uses the provider avatar, hides internal details, and includes a cancelled recurring exception in Past", async () => {
    await testDb
      .update(user)
      .set({ image: "https://example.com/provider.png" })
      .where(eq(user.id, "ceyda"));
    const lesson = await addWeekly();
    await changeStudentAppointment("attendee", lesson.id, {
      action: "cancel",
      occurrenceStartsAt: start,
    });
    const past = await listAppointmentAgenda("attendee", { view: "past" }, now);
    expect(past.appointments).toHaveLength(1);
    expect(past.appointments[0]).toMatchObject({
      status: "cancelled",
      providerName: "Ceyda",
      providerAvatar: "https://example.com/provider.png",
      occurrenceStartsAt: start.toISOString(),
      meetingUrl: null,
      canChange: false,
      canReschedule: false,
    });
    expect(past.appointments[0]).not.toHaveProperty("comment");
    expect(past.appointments[0]).not.toHaveProperty("studentEmail");
    const upcoming = await listAppointmentAgenda(
      "attendee",
      { view: "upcoming" },
      now,
    );
    expect(upcoming.appointments[0].startsAt).toBe("2030-01-22T09:00:00.000Z");
    expect(
      (await listAppointmentAgenda("unrelated", { view: "past" }, now))
        .appointments,
    ).toEqual([]);
    expect(
      (await listAppointmentAgenda("ceyda", { view: "upcoming" }, now))
        .appointments,
    ).toEqual([]);
  });
  it("lists completed history for verified email ownership, including provider accounts", async () => {
    await testDb.insert(providerProfiles).values({ userId: "attendee" });
    await addWeekly();
    const later = new Date("2030-01-24T12:00:00Z");
    const history = await listAppointmentAgenda(
      "attendee",
      { view: "past" },
      later,
    );
    expect(history.appointments.map((a) => a.startsAt)).toEqual([
      "2030-01-22T09:00:00.000Z",
      "2030-01-15T09:00:00.000Z",
    ]);
    expect(
      history.appointments.every(
        (a) => a.status === "completed" && !a.canChange && !a.canReschedule,
      ),
    ).toBe(true);
    await testDb
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, "attendee"));
    expect(
      (await listAppointmentAgenda("attendee", { view: "past" }, later))
        .appointments,
    ).toEqual([]);
  });
});
