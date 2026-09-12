import type { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
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
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
  bookingPages,
  personalActivities,
  personalActivitySchedules,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import {
  GET as listNames,
  POST as createName,
} from "@/app/api/provider/personal-activities/route";
import {
  PATCH as rename,
  DELETE as deleteName,
} from "@/app/api/provider/personal-activities/[id]/route";
import {
  GET as listSchedules,
  POST as createSchedule,
} from "@/app/api/provider/personal-activities/schedules/route";
import {
  PATCH as editSchedule,
  DELETE as deleteSchedule,
} from "@/app/api/provider/personal-activities/schedules/[id]/route";
import { getCurrentUser } from "@/lib/current-user";
import { getAvailableTimesForPublishedBookingPage } from "@/lib/available-times";
import { buildAccountExport } from "@/lib/account-data";

vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } =
    await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } })) };
});
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const provider = "provider-one",
  other = "provider-two";
let activityId: string;
let pageId: string;
const start = "2030-01-15T09:00:00.000Z",
  end = "2030-01-15T09:07:00.000Z";
const request = (body?: unknown, method = "POST") =>
  new Request("http://localhost/api/provider/personal-activities", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const rangeRequest = (
  startsAt = "2030-01-14T00:00:00Z",
  endsAt = "2030-01-21T00:00:00Z",
) =>
  new Request(
    `http://localhost/api/provider/personal-activities/schedules?startsAt=${startsAt}&endsAt=${endsAt}`,
  );
function signIn(id = provider, canProvide = true) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    user: { id },
    capabilities: { canProvide },
  } as Awaited<ReturnType<typeof getCurrentUser>>);
}
const payload = () => ({
  activityId,
  startsAt: start,
  endsAt: end,
  recurrence: "none",
});
async function schedule(input = payload()) {
  const response = await createSchedule(request(input));
  expect(response.status).toBe(201);
  return (await response.json()).schedule as {
    id: string;
    startsAt: string;
    endsAt: string;
  };
}

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}, 30_000);
afterAll(async () => {
  await testDb.$client.close();
});
beforeEach(async () => {
  await testDb.execute(sql`truncate table "user" cascade`);
  await testDb.insert(user).values([
    { id: provider, name: "Provider", email: "p@example.com" },
    { id: other, name: "Other", email: "o@example.com" },
  ]);
  await testDb
    .insert(providerProfiles)
    .values([
      { userId: provider, restBetweenSessionsMinutes: 30 },
      { userId: other },
    ]);
  const [page] = await testDb
    .insert(bookingPages)
    .values({
      providerId: provider,
      slug: "testpage",
      timeZone: "Europe/Istanbul",
      appointmentDurationMinutes: 30,
      bookingIntervalMinutes: 60,
      minimumNoticeHours: 24,
    })
    .returning();
  pageId = page.id;
  const [activity] = await testDb
    .insert(personalActivities)
    .values({ providerId: provider, name: "Prayer" })
    .returning();
  activityId = activity.id;
  signIn();
});

describe("personal activities with real PostgreSQL migrations and routes", () => {
  it("protects every endpoint from signed-out and non-provider users", async () => {
    for (const status of [401, 403]) {
      if (status === 401) vi.mocked(getCurrentUser).mockResolvedValue(null);
      else signIn(provider, false);
      const responses = await Promise.all([
        listNames(request(undefined, "GET")),
        createName(request({ name: "Gym" })),
        rename(request({ name: "Gym" }, "PATCH"), context(activityId)),
        deleteName(request(undefined, "DELETE"), context(activityId)),
        listSchedules(rangeRequest()),
        createSchedule(request(payload())),
        editSchedule(request(payload(), "PATCH"), context(activityId)),
        deleteSchedule(request(undefined, "DELETE"), context(activityId)),
      ]);
      expect(responses.map((response) => response.status)).toEqual(
        Array(8).fill(status),
      );
    }
    expect(await testDb.select().from(personalActivitySchedules)).toHaveLength(
      0,
    );
  });

  it("accepts a seven-minute activity without creating appointments or slots", async () => {
    const saved = await schedule();
    expect(saved).toMatchObject({ startsAt: start, endsAt: end });
    expect(await testDb.select().from(appointments)).toEqual([]);
    expect(await testDb.select().from(availabilitySlots)).toEqual([]);
    expect(
      await getAvailableTimesForPublishedBookingPage("testpage", {
        startsAt: new Date(start),
        endsAt: new Date("2030-01-15T12:00:00Z"),
      }),
    ).toMatchObject({ availableTimes: [] });
  });

  it("accepts personal time inside the appointment notice period and longer than a session", async () => {
    const soon = new Date(Date.now() + 60_000);
    const later = new Date(soon.getTime() + 3 * 60 * 60_000);
    await schedule({
      ...payload(),
      startsAt: soon.toISOString(),
      endsAt: later.toISOString(),
    });
  });

  it("rejects invalid times and invalid or extra name fields with meaningful codes", async () => {
    for (const endsAt of [
      start,
      "2030-01-14T09:00:00Z",
      "2030-01-16T09:01:00Z",
      "invalid",
    ]) {
      const response = await createSchedule(request({ ...payload(), endsAt }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        code: "invalid_activity_time",
      });
    }
    for (const body of [
      { name: "   " },
      { name: "Gym", email: "private@example.com" },
    ])
      expect((await createName(request(body))).status).toBe(400);
  });

  it("keeps names unique within each provider, ignoring case and surrounding spaces", async () => {
    expect((await createName(request({ name: " prayer " }))).status).toBe(409);
    const gym = await createName(request({ name: "Gym" }));
    const id = (await gym.json()).activity.id;
    const response = await rename(
      request({ name: "PRAYER" }, "PATCH"),
      context(id),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "activity_name_conflict",
    });
    signIn(other);
    expect((await createName(request({ name: "Prayer" }))).status).toBe(201);
    expect(
      (await (await listNames(request(undefined, "GET"))).json()).activities,
    ).toHaveLength(1);
  });

  it("prevents another provider from reading, scheduling, renaming or deleting personal time", async () => {
    const saved = await schedule();
    signIn(other);
    const [otherActivity] = await testDb
      .insert(personalActivities)
      .values({ providerId: other, name: "Lunch" })
      .returning();
    expect(
      (await (await listSchedules(rangeRequest())).json()).activities,
    ).toEqual([]);
    const responses = await Promise.all([
      createSchedule(request(payload())),
      rename(request({ name: "Stolen" }, "PATCH"), context(activityId)),
      deleteName(request(undefined, "DELETE"), context(activityId)),
      editSchedule(
        request({ ...payload(), activityId: otherActivity.id }, "PATCH"),
        context(saved.id),
      ),
      deleteSchedule(request(undefined, "DELETE"), context(saved.id)),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404, 404,
    ]);
    expect(await testDb.select().from(personalActivitySchedules)).toHaveLength(
      1,
    );
    expect(
      (
        await testDb
          .select()
          .from(personalActivities)
          .where(eq(personalActivities.id, activityId))
      )[0].name,
    ).toBe("Prayer");
  });

  it("renames scheduled occurrences and deletes only the selected schedule", async () => {
    const first = await schedule(),
      second = await schedule({
        ...payload(),
        startsAt: "2030-01-16T09:00:00Z",
        endsAt: "2030-01-16T09:07:00Z",
      });
    expect(
      (await rename(request({ name: "Lunch" }, "PATCH"), context(activityId)))
        .status,
    ).toBe(200);
    const list = await listSchedules(rangeRequest());
    expect(list.headers.get("Cache-Control")).toBe("no-store");
    expect(
      (await list.json()).activities.map((a: { name: string }) => a.name),
    ).toEqual(["Lunch", "Lunch"]);
    expect(
      (await deleteSchedule(request(undefined, "DELETE"), context(first.id)))
        .status,
    ).toBe(200);
    expect(
      (await testDb.select().from(personalActivitySchedules)).map((s) => s.id),
    ).toEqual([second.id]);
    expect(await testDb.select().from(personalActivities)).toHaveLength(1);
  });

  it("moves and resizes scheduled personal time without session duration restrictions", async () => {
    const saved = await schedule();
    const response = await editSchedule(
      request(
        {
          ...payload(),
          startsAt: "2030-01-16T10:13:00Z",
          endsAt: "2030-01-16T12:32:00Z",
        },
        "PATCH",
      ),
      context(saved.id),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).schedule).toMatchObject({
      startsAt: "2030-01-16T10:13:00.000Z",
      endsAt: "2030-01-16T12:32:00.000Z",
    });
  });

  it("blocks only exact activity times inside available windows, without adding rest or leaking names", async () => {
    await testDb.insert(availabilityWindows).values({
      bookingPageId: pageId,
      startsAt: new Date("2030-01-15T09:00:00Z"),
      endsAt: new Date("2030-01-15T12:00:00Z"),
    });
    await schedule({
      ...payload(),
      startsAt: "2030-01-15T09:30:00Z",
      endsAt: "2030-01-15T10:00:00Z",
    });
    await schedule({
      ...payload(),
      startsAt: "2030-01-15T11:12:00Z",
      endsAt: "2030-01-15T11:19:00Z",
    });
    const result = await getAvailableTimesForPublishedBookingPage("testpage", {
      startsAt: new Date("2030-01-15T09:00:00Z"),
      endsAt: new Date("2030-01-15T12:00:00Z"),
    });
    expect(
      result?.availableTimes.map((time) => time.startsAt.toISOString()),
    ).toEqual(["2030-01-15T09:00:00.000Z", "2030-01-15T10:00:00.000Z"]);
    expect(JSON.stringify(result)).not.toContain("Prayer");
    expect(JSON.stringify(result)).not.toContain(activityId);
  });

  it("expands weekly personal time on the correct day and preserves local time across DST", async () => {
    await testDb
      .update(bookingPages)
      .set({ timeZone: "America/New_York" })
      .where(eq(bookingPages.id, pageId));
    await schedule({
      ...payload(),
      startsAt: "2030-03-03T14:00:00Z",
      endsAt: "2030-03-03T14:17:00Z",
      recurrence: "weekly",
    });
    const result = await (
      await listSchedules(
        rangeRequest("2030-03-09T00:00:00Z", "2030-03-11T00:00:00Z"),
      )
    ).json();
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      startsAt: "2030-03-10T13:00:00.000Z",
      endsAt: "2030-03-10T13:17:00.000Z",
    });
    expect(
      (
        await (
          await listSchedules(
            rangeRequest("2030-03-09T00:00:00Z", "2030-03-10T00:00:00Z"),
          )
        ).json()
      ).activities,
    ).toEqual([]);
  });

  it("supports an overnight activity and includes it when viewing the following day", async () => {
    await schedule({
      ...payload(),
      startsAt: "2030-01-15T20:00:00Z",
      endsAt: "2030-01-15T22:17:00Z",
    });
    const result = await (
      await listSchedules(
        rangeRequest("2030-01-15T21:00:00Z", "2030-01-16T21:00:00Z"),
      )
    ).json();
    expect(result.activities).toHaveLength(1);
  });

  it("exports owned activities and removes their schedules when a name is deleted, preserving students and appointments", async () => {
    await schedule();
    const [student] = await testDb
      .insert(providerStudents)
      .values({ providerId: provider, displayName: "Ada" })
      .returning();
    const [slot] = await testDb
      .insert(availabilitySlots)
      .values({
        teacherId: provider,
        startsAt: new Date(start),
        endsAt: new Date("2030-01-15T09:30:00Z"),
      })
      .returning();
    await testDb
      .insert(appointments)
      .values({ providerStudentId: student.id, slotId: slot.id });
    await testDb
      .insert(personalActivities)
      .values({ providerId: other, name: "Other private activity" });
    const exported = await buildAccountExport(provider);
    expect(exported?.personalActivities).toHaveLength(1);
    expect(exported?.personalActivitySchedules).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("Other private activity");
    expect(
      (await deleteName(request(undefined, "DELETE"), context(activityId)))
        .status,
    ).toBe(200);
    expect(await testDb.select().from(personalActivitySchedules)).toEqual([]);
    expect(await testDb.select().from(providerStudents)).toHaveLength(1);
    expect(await testDb.select().from(appointments)).toHaveLength(1);
  });
});

describe("optional personal activity defaults", () => {
  it("stores and lists an optional duration while preserving existing schedules and omitted values", async () => {
    const saved = await schedule();
    const response = await rename(
      request({ name: "Prayer", defaultDurationMinutes: 17 }, "PATCH"),
      context(activityId),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).activity.defaultDurationMinutes).toBe(17);
    expect(
      (await (await listNames(request(undefined, "GET"))).json()).activities,
    ).toEqual([{ id: activityId, name: "Prayer", defaultDurationMinutes: 17 }]);
    expect(
      (
        await rename(
          request({ name: "Prayer break" }, "PATCH"),
          context(activityId),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await testDb
          .select()
          .from(personalActivities)
          .where(eq(personalActivities.id, activityId))
      )[0].defaultDurationMinutes,
    ).toBe(17);
    expect(
      (
        await testDb
          .select()
          .from(personalActivitySchedules)
          .where(eq(personalActivitySchedules.id, saved.id))
      )[0],
    ).toMatchObject({ startsAt: new Date(start), endsAt: new Date(end) });
    const cleared = await rename(
      request({ name: "Prayer break", defaultDurationMinutes: null }, "PATCH"),
      context(activityId),
    );
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).activity.defaultDurationMinutes).toBeNull();
  });

  it("creates names with or without duration, including limits independent of session length", async () => {
    for (const [name, duration] of [
      ["Gym", 90],
      ["Short break", 1],
      ["Day off", 1440],
      ["Custom", null],
    ] as const) {
      const response = await createName(
        request({ name, defaultDurationMinutes: duration }),
      );
      expect(response.status).toBe(201);
      expect((await response.json()).activity.defaultDurationMinutes).toBe(
        duration,
      );
    }
    const response = await createName(request({ name: "No default" }));
    expect((await response.json()).activity.defaultDurationMinutes).toBeNull();
  });

  it("rejects invalid durations on create and edit instead of silently coercing them", async () => {
    for (const duration of [0, -5, 1.5, 1441, "30", ""]) {
      const created = await createName(
        request({ name: "Gym", defaultDurationMinutes: duration }),
      );
      const updated = await rename(
        request({ name: "Prayer", defaultDurationMinutes: duration }, "PATCH"),
        context(activityId),
      );
      expect(created.status).toBe(400);
      expect(updated.status).toBe(400);
      expect(await updated.json()).toMatchObject({ code: "invalid_activity" });
    }
    expect(
      (
        await testDb
          .select()
          .from(personalActivities)
          .where(eq(personalActivities.id, activityId))
      )[0].defaultDurationMinutes,
    ).toBeNull();
  });
});
