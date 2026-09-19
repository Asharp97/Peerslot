import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  list: vi.fn(),
  agenda: vi.fn(),
  times: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/student-appointments", () => ({
  listStudentAppointments: mocks.list,
  listAppointmentAgenda: mocks.agenda,
  getStudentRescheduleTimes: mocks.times,
  changeStudentAppointment: mocks.change,
}));
import { GET as list } from "@/app/api/account/appointments/route";
import { GET, PATCH } from "@/app/api/account/appointments/[id]/route";
import { StudentAppointmentChangeError } from "@/lib/student-appointment-policy";
const id = "550e8400-e29b-41d4-a716-446655440000";
const context = { params: Promise.resolve({ id }) };
const original = "2030-01-18T09:00:00Z";
const url = `http://localhost/api/account/appointments/${id}`;
function request(body: unknown, origin?: string) {
  return new Request(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ user: { id: "student-id" } });
  mocks.list.mockResolvedValue([]);
  mocks.agenda.mockResolvedValue({ appointments: [], nextCursor: null });
  mocks.times.mockResolvedValue([]);
});
describe("student appointment API", () => {
  it.each([false, true])(
    "serves the authenticated attendee's calendar regardless of provider capability: %s",
    async (canProvide) => {
      mocks.user.mockResolvedValue({
        user: { id: "attendee" },
        capabilities: { canProvide },
      });
      const response = await list(
        new Request(
          "http://localhost/api/account/appointments?startsAt=2030-01-14T00:00:00Z&endsAt=2030-01-21T00:00:00Z&studentId=other&email=other@example.com",
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.list).toHaveBeenCalledWith("attendee", expect.any(Date), {
        startsAt: new Date("2030-01-14T00:00:00Z"),
        endsAt: new Date("2030-01-21T00:00:00Z"),
      });
    },
  );
  it.each([
    "startsAt=invalid&endsAt=2030-01-21T00:00:00Z",
    "startsAt=2030-01-21T00:00:00Z",
    "startsAt=2030-01-21T00:00:00Z&endsAt=2030-01-14T00:00:00Z",
    "startsAt=2030-01-01T00:00:00Z&endsAt=2031-01-01T00:00:00Z",
  ])("rejects invalid or excessive calendar ranges: %s", async (query) => {
    expect(
      (
        await list(
          new Request(`http://localhost/api/account/appointments?${query}`),
        )
      ).status,
    ).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("requires authentication for both reads and changes", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await list(new Request(url))).status).toBe(401);
    expect(
      (
        await PATCH(
          request({ action: "cancel", occurrenceStartsAt: original }),
          context,
        )
      ).status,
    ).toBe(401);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("uses the authenticated account and forbids client-supplied student identities", async () => {
    await list(new Request(url));
    expect(mocks.list).toHaveBeenCalledWith("student-id");
    const response = await PATCH(
      request({
        action: "cancel",
        occurrenceStartsAt: original,
        studentId: "other",
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("blocks cross-origin writes", async () => {
    expect(
      (
        await PATCH(
          request(
            { action: "cancel", occurrenceStartsAt: original },
            "https://example.invalid",
          ),
          context,
        )
      ).status,
    ).toBe(403);
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it.each([
    ["notice", 403],
    ["reschedule_limit", 403],
    ["not_found", 404],
    ["unavailable", 409],
  ] as const)("returns %s failures", async (code, status) => {
    mocks.change.mockRejectedValue(new StudentAppointmentChangeError(code));
    expect(
      (
        await PATCH(
          request({ action: "cancel", occurrenceStartsAt: original }),
          context,
        )
      ).status,
    ).toBe(status);
  });
  it("validates a bounded availability range and uses private responses", async () => {
    const params = new URLSearchParams({
      occurrenceStartsAt: original,
      startsAt: "2030-01-15T09:00:00Z",
      endsAt: "2030-02-15T09:00:00Z",
    });
    const response = await GET(new Request(`${url}?${params}`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.times).toHaveBeenCalledWith(
      "student-id",
      id,
      new Date(original),
      expect.anything(),
    );
    params.set("endsAt", "2031-01-01T09:00:00Z");
    expect((await GET(new Request(`${url}?${params}`), context)).status).toBe(
      400,
    );
  });
});

describe("appointment agenda API", () => {
  it.each(["upcoming", "past"])(
    "loads %s for the authenticated account only",
    async (view) => {
      const response = await list(
        new Request(
          `http://localhost/api/account/appointments?view=${view}&accountId=someone-else`,
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.agenda).toHaveBeenCalledWith("student-id", { view });
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );
  it.each([
    "view=invalid",
    "view=past&cursor=oops",
    "view=past&cursor=%7B%7D",
    "view=upcoming&startsAt=2030-01-01T00:00:00Z",
    "cursor=oops",
  ])("rejects malformed agenda requests: %s", async (query) => {
    expect(
      (
        await list(
          new Request(`http://localhost/api/account/appointments?${query}`),
        )
      ).status,
    ).toBe(400);
    expect(mocks.agenda).not.toHaveBeenCalled();
  });
});
