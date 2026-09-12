import {
  PATCH as moveAvailable,
  DELETE as deleteMovedAvailable,
} from "@/app/api/availability-windows/[id]/move/route";
import {
  PATCH as movePersonal,
  DELETE as deleteMovedPersonal,
} from "@/app/api/provider/personal-activities/schedules/[id]/move/route";
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

async function calendarWindow(recurrence: "none" | "weekly" = "none") {
  const [window] = await testDb
    .insert(availabilityWindows)
    .values({
      bookingPageId: pageId,
      startsAt: new Date(start),
      endsAt: new Date("2030-01-15T12:00:00Z"),
      recurrence,
    })
    .returning();
  return window;
}
async function publicStarts(
  from = "2030-01-15T00:00:00Z",
  to = "2030-01-24T00:00:00Z",
) {
  const result = await getAvailableTimesForPublishedBookingPage("testpage", {
    startsAt: new Date(from),
    endsAt: new Date(to),
  });
  return result!.availableTimes.map((slot) => slot.startsAt.toISOString());
}
async function bookedTime(startsAt: string, windowId?: string) {
  const [student] = await testDb
    .insert(providerStudents)
    .values({ providerId: provider, displayName: "Ada" })
    .returning();
  const [slot] = await testDb
    .insert(availabilitySlots)
    .values({
      teacherId: provider,
      availabilityWindowId: windowId,
      startsAt: new Date(startsAt),
      endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
    })
    .returning();
  const [appointment] = await testDb
    .insert(appointments)
    .values({
      providerStudentId: student.id,
      slotId: slot.id,
      status: "scheduled",
    })
    .returning();
  return { slot, appointment };
}
describe("dragging individual calendar blocks", () => {
  it.each(["none", "weekly"] as const)(
    "moves one available block in a %s window, preserving neighbors and other weeks",
    async (recurrence) => {
      const window = await calendarWindow(recurrence);
      const before = await publicStarts();
      const originalStartsAt = "2030-01-15T10:00:00.000Z",
        startsAt = "2030-01-16T13:10:00.000Z";
      const response = await moveAvailable(
        request({ originalStartsAt, startsAt }, "PATCH"),
        context(window.id),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        startsAt,
        endsAt: "2030-01-16T13:40:00.000Z",
      });
      expect(await publicStarts()).toEqual(
        [
          ...before.filter((time) => time !== originalStartsAt),
          startsAt,
        ].sort(),
      );
      const [saved] = await testDb.select().from(availabilityWindows);
      expect(saved.startsAt).toEqual(window.startsAt);
      expect(saved.endsAt).toEqual(window.endsAt);
      expect(saved.recurrence).toBe(recurrence);
      expect(await testDb.select().from(appointments)).toEqual([]);
    },
  );

  it("moves a free block even when another block in that window is booked, preserving the appointment", async () => {
    const window = await calendarWindow("weekly");
    const booked = await bookedTime(start, window.id);
    const response = await moveAvailable(
      request(
        {
          originalStartsAt: "2030-01-15T11:00:00Z",
          startsAt: "2030-01-16T14:00:00Z",
        },
        "PATCH",
      ),
      context(window.id),
    );
    expect(response.status).toBe(200);
    expect(await testDb.select().from(appointments)).toEqual([
      booked.appointment,
    ]);
    expect(await testDb.select().from(availabilitySlots)).toEqual([
      booked.slot,
    ]);
  });

  it("keeps a move visible before its source window and permits moving it again without resurrecting its original time", async () => {
    const window = await calendarWindow();
    const originalStartsAt = start;
    for (const startsAt of [
      "2030-01-12T09:00:00.000Z",
      "2030-02-18T09:10:00.000Z",
    ]) {
      const response = await moveAvailable(
        request({ originalStartsAt, startsAt }, "PATCH"),
        context(window.id),
      );
      expect(response.status).toBe(200);
      expect(
        await publicStarts(
          startsAt,
          new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
        ),
      ).toEqual([startsAt]);
    }
    expect(
      await publicStarts("2030-01-12T00:00:00Z", "2030-01-13T00:00:00Z"),
    ).toEqual([]);
    expect(await publicStarts()).not.toContain(start);
    expect(
      (
        await deleteMovedAvailable(
          request({ originalStartsAt }, "DELETE"),
          context(window.id),
        )
      ).status,
    ).toBe(200);
    expect(
      await publicStarts("2030-02-18T00:00:00Z", "2030-02-19T00:00:00Z"),
    ).toEqual([]);
    expect(await publicStarts()).not.toContain(start);
    expect(await publicStarts()).toContain("2030-01-15T10:00:00.000Z");
  });

  it.each([
    "booked source",
    "booked destination",
    "personal activity",
    "available block",
  ])(
    "rejects a move conflicting with %s without changing availability",
    async (kind) => {
      const window = await calendarWindow();
      const originalStartsAt = start,
        startsAt =
          kind === "available block"
            ? "2030-01-15T10:00:00Z"
            : "2030-01-16T09:00:00Z";
      if (kind === "booked source") await bookedTime(start, window.id);
      if (kind === "booked destination") await bookedTime(startsAt);
      if (kind === "personal activity")
        await schedule({
          ...payload(),
          startsAt,
          endsAt: "2030-01-16T09:07:00Z",
        });
      const response = await moveAvailable(
        request({ originalStartsAt, startsAt }, "PATCH"),
        context(window.id),
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "calendar_block_conflict",
      });
      expect(
        (await testDb.select().from(availabilityWindows))[0].moves,
      ).toEqual({});
    },
  );

  it("cannot remove a moved available block after a student books it", async () => {
    const window = await calendarWindow();
    const startsAt = "2030-01-16T09:00:00Z";
    expect(
      (
        await moveAvailable(
          request({ originalStartsAt: start, startsAt }, "PATCH"),
          context(window.id),
        )
      ).status,
    ).toBe(200);
    await bookedTime(startsAt);
    expect(
      (
        await deleteMovedAvailable(
          request({ originalStartsAt: start }, "DELETE"),
          context(window.id),
        )
      ).status,
    ).toBe(409);
  });

  it("moves only one weekly personal occurrence, releases its old booking time, and blocks only its new duration", async () => {
    await calendarWindow("weekly");
    const saved = await schedule({ ...payload(), recurrence: "weekly" });
    const originalStartsAt = "2030-01-22T09:00:00.000Z",
      startsAt = "2030-01-22T10:00:00.000Z";
    const response = await movePersonal(
      request({ originalStartsAt, startsAt }, "PATCH"),
      context(saved.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      startsAt,
      endsAt: "2030-01-22T10:07:00.000Z",
    });
    const activities = (
      await (
        await listSchedules(
          rangeRequest("2030-01-15T00:00:00Z", "2030-01-31T00:00:00Z"),
        )
      ).json()
    ).activities;
    expect(
      activities.map((item: { startsAt: string }) => item.startsAt).sort(),
    ).toEqual([start, startsAt, "2030-01-29T09:00:00.000Z"]);
    expect(
      activities.find((item: { isMoved: boolean }) => item.isMoved),
    ).toMatchObject({ originalStartsAt, startsAt });
    const available = await publicStarts();
    expect(available).not.toContain(start);
    expect(available).toContain(originalStartsAt);
    expect(available).not.toContain(startsAt);
    expect(available).toContain("2030-01-22T11:00:00.000Z");
    expect(
      (
        await deleteMovedPersonal(
          request({ originalStartsAt }, "DELETE"),
          context(saved.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await (
          await listSchedules(
            rangeRequest("2030-01-22T00:00:00Z", "2030-01-23T00:00:00Z"),
          )
        ).json()
      ).activities,
    ).toEqual([]);
    expect(
      (await testDb.select().from(personalActivitySchedules))[0].recurrence,
    ).toBe("weekly");
  });

  it("finds a personal activity moved to a different month and preserves its independent duration when dragged again", async () => {
    const saved = await schedule();
    for (const startsAt of ["2030-02-12T23:59:00Z", "2030-02-14T08:00:00Z"]) {
      expect(
        (
          await movePersonal(
            request({ originalStartsAt: start, startsAt }, "PATCH"),
            context(saved.id),
          )
        ).status,
      ).toBe(200);
    }
    const activities = (
      await (
        await listSchedules(
          rangeRequest("2030-02-01T00:00:00Z", "2030-02-28T00:00:00Z"),
        )
      ).json()
    ).activities;
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      startsAt: "2030-02-14T08:00:00.000Z",
      endsAt: "2030-02-14T08:07:00.000Z",
      originalStartsAt: start,
    });
    expect(
      (await (await listSchedules(rangeRequest())).json()).activities,
    ).toEqual([]);
  });

  it("protects move and occurrence-delete routes with authentication and ownership", async () => {
    const window = await calendarWindow();
    const saved = await schedule();
    const operations = () => [
      moveAvailable(
        request(
          { originalStartsAt: start, startsAt: "2030-02-15T09:00:00Z" },
          "PATCH",
        ),
        context(window.id),
      ),
      movePersonal(
        request(
          { originalStartsAt: start, startsAt: "2030-02-15T09:00:00Z" },
          "PATCH",
        ),
        context(saved.id),
      ),
      deleteMovedAvailable(
        request({ originalStartsAt: start }, "DELETE"),
        context(window.id),
      ),
      deleteMovedPersonal(
        request({ originalStartsAt: start }, "DELETE"),
        context(saved.id),
      ),
    ];
    for (const status of [401, 403, 404]) {
      if (status === 401) vi.mocked(getCurrentUser).mockResolvedValue(null);
      else if (status === 403) signIn(provider, false);
      else signIn(other);
      expect(
        (await Promise.all(operations())).map((response) => response.status),
      ).toEqual(Array(4).fill(status));
    }
  });

  it("reports past, missing and invalid times separately from conflicts", async () => {
    const window = await calendarWindow();
    for (const [body, status, code] of [
      [
        { originalStartsAt: start, startsAt: "2020-01-01T09:00:00Z" },
        400,
        "calendar_block_past",
      ],
      [
        {
          originalStartsAt: "2030-01-15T09:10:00Z",
          startsAt: "2030-02-01T09:00:00Z",
        },
        404,
        "calendar_block_missing",
      ],
      [
        { originalStartsAt: start, startsAt: "invalid" },
        400,
        "calendar_block_invalid",
      ],
      [
        {
          originalStartsAt: start,
          startsAt: "2030-02-01T09:00:00Z",
          endsAt: "2030-02-01T10:00:00Z",
        },
        400,
        "calendar_block_invalid",
      ],
    ] as const) {
      const response = await moveAvailable(
        request(body, "PATCH"),
        context(window.id),
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    }
    expect((await testDb.select().from(availabilityWindows))[0].moves).toEqual(
      {},
    );
  });
});

describe("calendar move edge cases", () => {
  it("keeps moved blocks editable after appointment duration and interval settings change", async () => {
    const window = await calendarWindow();
    const originalStartsAt = "2030-01-15T10:00:00Z";
    expect(
      (
        await moveAvailable(
          request(
            { originalStartsAt, startsAt: "2030-01-16T09:00:00Z" },
            "PATCH",
          ),
          context(window.id),
        )
      ).status,
    ).toBe(200);
    await testDb
      .update(bookingPages)
      .set({ appointmentDurationMinutes: 45, bookingIntervalMinutes: 75 })
      .where(eq(bookingPages.id, pageId));
    const response = await moveAvailable(
      request({ originalStartsAt, startsAt: "2030-01-16T10:10:00Z" }, "PATCH"),
      context(window.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      startsAt: "2030-01-16T10:10:00.000Z",
      endsAt: "2030-01-16T10:55:00.000Z",
    });
  });
  it("honors session rest at the destination and accepts its exact boundary", async () => {
    const window = await calendarWindow();
    await bookedTime("2030-01-16T09:00:00Z");
    expect(
      (
        await moveAvailable(
          request(
            { originalStartsAt: start, startsAt: "2030-01-16T09:50:00Z" },
            "PATCH",
          ),
          context(window.id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await moveAvailable(
          request(
            { originalStartsAt: start, startsAt: "2030-01-16T10:00:00Z" },
            "PATCH",
          ),
          context(window.id),
        )
      ).status,
    ).toBe(200);
  });
  it("preserves other moved blocks when saving another exception", async () => {
    const window = await calendarWindow();
    for (const [originalStartsAt, startsAt] of [
      [start, "2030-01-16T09:00:00Z"],
      ["2030-01-15T10:00:00Z", "2030-01-16T10:00:00Z"],
    ]) {
      expect(
        (
          await moveAvailable(
            request({ originalStartsAt, startsAt }, "PATCH"),
            context(window.id),
          )
        ).status,
      ).toBe(200);
    }
    expect(await publicStarts()).toEqual([
      "2030-01-15T11:00:00.000Z",
      "2030-01-16T09:00:00.000Z",
      "2030-01-16T10:00:00.000Z",
    ]);
  });
  it("resizes one weekly personal occurrence without changing its series or default duration", async () => {
    const saved = await schedule({ ...payload(), recurrence: "weekly" });
    const originalStartsAt = "2030-01-22T09:00:00Z";
    expect(
      (
        await movePersonal(
          request(
            {
              originalStartsAt,
              startsAt: originalStartsAt,
              endsAt: "2030-01-22T09:19:00Z",
            },
            "PATCH",
          ),
          context(saved.id),
        )
      ).status,
    ).toBe(200);
    const [stored] = await testDb.select().from(personalActivitySchedules);
    expect(stored.startsAt.toISOString()).toBe(start);
    expect(stored.endsAt.toISOString()).toBe(end);
    expect(stored.recurrence).toBe("weekly");
    expect(
      (await testDb.select().from(personalActivities))[0]
        .defaultDurationMinutes,
    ).toBeNull();
  });
});
