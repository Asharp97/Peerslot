import type { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
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
  bookingPages,
  providerGoogleMeetConnections,
  providerProfiles,
} from "@/db/schema";
import {
  attachAppointmentMeeting,
  ensureAppointmentMeeting,
  createUpcomingMeetings,
} from "@/lib/google-meet";
import {
  createMeetAuthorization,
  GOOGLE_MEET_SCOPE,
  readMeetAuthorization,
  saveMeetAuthorization,
} from "@/lib/google-meet-oauth";
import {
  createProviderAppointment,
  createProviderStudent,
  listProviderAppointments,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import { listStudentAppointments } from "@/lib/student-appointments";

const google = vi.hoisted(() => ({
  create: vi.fn(),
  options: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@google-apps/meet", () => ({
  SpacesServiceClient: class {
    constructor(options: unknown) {
      google.options(options);
    }
    createSpace = google.create;
    close = google.close;
  },
}));
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
const start = new Date("2030-01-15T09:00:00Z");
const range = {
  startsAt: new Date("2030-01-14T00:00:00Z"),
  endsAt: new Date("2030-02-04T00:00:00Z"),
};
const meetingUrl = "https://meet.google.com/abc-defg-hij";
const secret = "test-only-secret-with-at-least-32-characters";
let studentId: string;
beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
}, 30_000);
afterAll(async () => {
  await testDb.$client.close();
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_MEET_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_MEET_CLIENT_SECRET", "");
  vi.stubEnv("BETTER_AUTH_SECRET", secret);
  vi.stubEnv("BETTER_AUTH_URL", "https://www.peerslot.com");
  google.create.mockResolvedValue([
    { name: "spaces/test-space", meetingUri: meetingUrl },
  ]);
  google.close.mockResolvedValue(undefined);
  await testDb.execute(sql`truncate table "user" cascade`);
  await testDb.insert(user).values([
    {
      id: "ceyda",
      name: "Ceyda",
      email: "ceyda@example.com",
      emailVerified: true,
    },
    { id: "ali", name: "Ali", email: "ali@example.com", emailVerified: true },
    {
      id: "other",
      name: "Other",
      email: "other@example.com",
      emailVerified: true,
    },
  ]);
  await testDb
    .insert(providerProfiles)
    .values({
      userId: "ceyda",
      displayName: "Ceyda",
      timeZone: "UTC",
      restBetweenSessionsMinutes: 0,
    });
  await testDb
    .insert(bookingPages)
    .values({
      providerId: "ceyda",
      slug: "CEYDA123",
      timeZone: "UTC",
      minimumNoticeHours: 24,
    });
  studentId = (
    await createProviderStudent("ceyda", {
      displayName: "Ali",
      email: "ali@example.com",
    })
  ).id;
  await testDb
    .insert(providerGoogleMeetConnections)
    .values({
      providerId: "ceyda",
      googleAccountId: "google-account",
      email: "host@gmail.com",
      encryptedRefreshToken: await symmetricEncrypt({
        key: secret,
        data: "refresh-token",
      }),
    });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const add = (recurrence: "none" | "weekly" = "none") =>
  createProviderAppointment("ceyda", {
    providerStudentId: studentId,
    startsAt: start,
    endsAt: new Date(start.getTime() + 30 * 60_000),
    recurrence,
    color: "#f0d7ff",
    comment: undefined,
  });

describe("Google Meet appointment lifecycle", () => {
  it("creates one stored room and shares it with the provider and verified attendee only", async () => {
    const appointment = await add("weekly");
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "ready",
      meetingUrl,
    });
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "ready",
      meetingUrl,
    });
    expect(google.create).toHaveBeenCalledOnce();
    expect(google.options).toHaveBeenCalledWith(
      expect.objectContaining({
        fallback: true,
        credentials: expect.objectContaining({
          type: "authorized_user",
          refresh_token: "refresh-token",
        }),
      }),
    );
    const provider = await listProviderAppointments("ceyda", range);
    const student = await listStudentAppointments("ali", now, range);
    expect(provider).toHaveLength(3);
    expect(student).toHaveLength(3);
    expect(
      [...provider, ...student].every((row) => row.meetingUrl === meetingUrl),
    ).toBe(true);
    expect(await listStudentAppointments("other", now, range)).toEqual([]);
    expect(student[0]).not.toHaveProperty("encryptedRefreshToken");
  });

  it.each(["pending", "declined", "cancelled"] as const)(
    "does not create rooms for %s appointments",
    async (status) => {
      const appointment = await add();
      await testDb
        .update(appointments)
        .set({ status })
        .where(eq(appointments.id, appointment.id));
      expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
        status: "unavailable",
      });
      expect(google.create).not.toHaveBeenCalled();
    },
  );

  it("rejects other providers and deleted appointments before contacting Google", async () => {
    const appointment = await add();
    expect(await ensureAppointmentMeeting("other", appointment.id)).toEqual({
      status: "not_found",
    });
    await testDb
      .update(appointments)
      .set({ deletedAt: now })
      .where(eq(appointments.id, appointment.id));
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "not_found",
    });
    expect(google.create).not.toHaveBeenCalled();
  });

  it("does not create historical rooms", async () => {
    const appointment = await add();
    vi.setSystemTime(new Date("2031-01-01"));
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "unavailable",
    });
    expect(google.create).not.toHaveBeenCalled();
  });

  it("keeps appointments saved without a Google connection", async () => {
    const appointment = await add();
    await testDb.delete(providerGoogleMeetConnections);
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "not_connected",
    });
    expect(await attachAppointmentMeeting("ceyda", appointment)).toMatchObject({
      id: appointment.id,
      status: "scheduled",
      meetingUrl: null,
    });
    expect(google.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent creation attempts using the database lease", async () => {
    const appointment = await add();
    let finish!: (value: unknown[]) => void;
    google.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = ensureAppointmentMeeting("ceyda", appointment.id);
    await vi.waitFor(() => expect(google.create).toHaveBeenCalledOnce());
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "creating",
    });
    finish([{ name: "spaces/test-space", meetingUri: meetingUrl }]);
    expect(await first).toEqual({ status: "ready", meetingUrl });
    expect(google.create).toHaveBeenCalledOnce();
  });

  it("releases failed leases and permits a retry without losing the booking", async () => {
    const appointment = await add();
    google.create.mockRejectedValueOnce(new Error("Google unavailable"));
    expect(await attachAppointmentMeeting("ceyda", appointment)).toMatchObject({
      id: appointment.id,
      status: "scheduled",
      meetingUrl: null,
    });
    const [saved] = await testDb.select().from(appointments);
    expect(saved.meetingCreatingAt).toBeNull();
    expect(saved.status).toBe("scheduled");
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "ready",
      meetingUrl,
    });
  });

  it("recovers an expired creation lease", async () => {
    const appointment = await add();
    await testDb
      .update(appointments)
      .set({ meetingCreatingAt: new Date(now.getTime() - 121_000) })
      .where(eq(appointments.id, appointment.id));
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "ready",
      meetingUrl,
    });
  });

  it("does not publish a link if the session was cancelled while Google was responding", async () => {
    const appointment = await add();
    google.create.mockImplementationOnce(async () => {
      await testDb
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, appointment.id));
      return [{ name: "spaces/test-space", meetingUri: meetingUrl }];
    });
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "unavailable",
    });
    expect((await testDb.select().from(appointments))[0].meetingUrl).toBeNull();
  });

  it("preserves a weekly room across an occurrence move and future-series split", async () => {
    const appointment = await add("weekly");
    await ensureAppointmentMeeting("ceyda", appointment.id);
    const moved = await updateProviderAppointment("ceyda", appointment.id, {
      editScope: "exception",
      comment: undefined,
      occurrenceStartsAt: start,
      startsAt: new Date("2030-01-16T10:00:00Z"),
      endsAt: new Date("2030-01-16T10:30:00Z"),
    });
    expect(moved.meetingUrl).toBe(meetingUrl);
    const split = await updateProviderAppointment("ceyda", appointment.id, {
      editScope: "future",
      comment: undefined,
      occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
      startsAt: new Date("2030-01-23T10:00:00Z"),
      endsAt: new Date("2030-01-23T10:30:00Z"),
    });
    expect(split.meetingUrl).toBe(meetingUrl);
    expect(
      (await listStudentAppointments("ali", now, range)).every(
        (row) => row.meetingUrl === meetingUrl,
      ),
    ).toBe(true);
    expect(google.create).toHaveBeenCalledOnce();
  });

  it("prepares existing upcoming sessions after connecting", async () => {
    const appointment = await add();
    await createUpcomingMeetings("ceyda");
    expect(await ensureAppointmentMeeting("ceyda", appointment.id)).toEqual({
      status: "ready",
      meetingUrl,
    });
    expect(google.create).toHaveBeenCalledOnce();
  });
});

describe("Google Meet OAuth", () => {
  it("uses offline consent, PKCE and state bound to the initiating provider", async () => {
    const flow = await createMeetAuthorization("ceyda", "tr");
    const params = new URL(flow.url).searchParams;
    expect(params.get("redirect_uri")).toBe(
      "https://www.peerslot.com/api/provider/google-meet/callback",
    );
    expect(params.get("scope")).toContain(GOOGLE_MEET_SCOPE);
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(
      await readMeetAuthorization(flow.cookie, params.get("state"), "ceyda"),
    ).toMatchObject({ locale: "tr", providerId: "ceyda" });
    expect(
      await readMeetAuthorization(flow.cookie, "wrong-state", "ceyda"),
    ).toBeNull();
    expect(
      await readMeetAuthorization(flow.cookie, params.get("state"), "other"),
    ).toBeNull();
    expect(
      await readMeetAuthorization(
        `${flow.cookie}tampered`,
        params.get("state"),
        "ceyda",
      ),
    ).toBeNull();
    vi.setSystemTime(new Date(now.getTime() + 601_000));
    expect(
      await readMeetAuthorization(flow.cookie, params.get("state"), "ceyda"),
    ).toBeNull();
  });

  it("encrypts the granted refresh token and accepts a different verified Google email", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "access",
          refresh_token: "new-refresh",
          scope: `openid email ${GOOGLE_MEET_SCOPE}`,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: "google-other",
          email: "other-google@gmail.com",
          email_verified: true,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await saveMeetAuthorization("ceyda", "auth-code", "verifier");
    const [connection] = await testDb
      .select()
      .from(providerGoogleMeetConnections);
    expect(connection.email).toBe("other-google@gmail.com");
    expect(connection.encryptedRefreshToken).not.toBe("new-refresh");
    expect(
      await symmetricDecrypt({
        key: secret,
        data: connection.encryptedRefreshToken,
      }),
    ).toBe("new-refresh");
    expect(fetchMock.mock.calls[0][1].body.get("code_verifier")).toBe(
      "verifier",
    );
  });

  it.each([
    { access_token: "access", refresh_token: "refresh", scope: "openid email" },
    { access_token: "access", scope: GOOGLE_MEET_SCOPE },
  ])(
    "does not replace the connection when offline access or Meet permission is missing",
    async (tokens) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(tokens)));
      await expect(
        saveMeetAuthorization("ceyda", "code", "verifier"),
      ).rejects.toThrow();
      expect(
        (await testDb.select().from(providerGoogleMeetConnections))[0].email,
      ).toBe("host@gmail.com");
    },
  );
});
