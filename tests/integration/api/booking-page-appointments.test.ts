import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicAppointmentPolicyError } from "@/lib/public-appointment-policy";
import { clearRateLimitsForTests } from "@/lib/request-security";

import { POST } from "@/app/api/booking-pages/[slug]/appointments/route";

const mocks = vi.hoisted(() => {
  class PageNotFoundError extends Error {}
  class UnavailableError extends Error {}
  return {
    create: vi.fn(),
    getSession: vi.fn(),
    notifyProvider: vi.fn(),
    PageNotFoundError,
    UnavailableError,
  };
});

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@/lib/public-appointment-request", () => ({
  createPublicAppointmentRequest: mocks.create,
  PublicAppointmentRequestPageNotFoundError: mocks.PageNotFoundError,
  PublicAppointmentRequestUnavailableError: mocks.UnavailableError,
}));

vi.mock("@/lib/public-appointment-request-schema", async (importOriginal) =>
  importOriginal(),
);
vi.mock("@/lib/email-notifications", () => ({
  emailLocaleFromRequest: () => "en",
  notifyProviderOfBookingRequest: mocks.notifyProvider,
}));

import { createPublicAppointmentRequest } from "@/lib/public-appointment-request";

const slug = "ABCDEFGH";
const startsAt = "2030-01-15T09:00:00.000Z";

describe("public appointment request API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitsForTests();
  });

  beforeEach(() => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: "student-user-id",
        name: "Authenticated Ada",
        email: "auth@example.com",
        emailVerified: true,
      },
    });
  });

  it("requires email verification before matching existing appointments", async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: "student-user-id",
        name: "Ada",
        email: "auth@example.com",
        emailVerified: false,
      },
    });
    const response = await POST(request(), {
      params: Promise.resolve({ slug }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "email_unverified" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notifyProvider).not.toHaveBeenCalled();
  });

  it.each([
    ["past", 400, undefined],
    ["minimum_notice", 400, 24],
    ["upcoming_appointment", 409, 24],
  ] as const)(
    "returns the %s reason without creating a notification",
    async (code, status, hours) => {
      mocks.create.mockRejectedValue(
        new PublicAppointmentPolicyError(code, hours),
      );
      const response = await POST(request(), {
        params: Promise.resolve({ slug }),
      });
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        code,
        ...(hours === undefined ? {} : { minimumNoticeHours: hours }),
      });
      expect(mocks.notifyProvider).not.toHaveBeenCalled();
    },
  );

  it("rejects client-supplied identity so another email cannot bypass the notice guard", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/booking-pages/" + slug + "/appointments",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt,
            studentEmail: "different@example.com",
            studentId: "other-account",
          }),
        },
      ),
      { params: Promise.resolve({ slug }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a pending appointment request", async () => {
    vi.mocked(createPublicAppointmentRequest).mockResolvedValue({
      appointment: {
        id: "appointment-id",
        status: "pending",
        startsAt: new Date(startsAt),
        endsAt: new Date("2030-01-15T09:30:00.000Z"),
        comment: "LGS preparation",
      },
      provider: {
        email: "provider@example.com",
        name: "Ceyda",
        timeZone: "Europe/Istanbul",
      },
    } as Awaited<ReturnType<typeof createPublicAppointmentRequest>>);

    const response = await POST(request(), {
      params: Promise.resolve({ slug }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      appointment: { id: "appointment-id", status: "pending" },
    });
    expect(createPublicAppointmentRequest).toHaveBeenCalledWith(
      slug,
      {
        startsAt: new Date(startsAt),
        comment: "LGS preparation",
      },
      {
        studentId: "student-user-id",
        studentName: "Authenticated Ada",
        studentEmail: "auth@example.com",
      },
    );
    expect(mocks.notifyProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: "appointment-id",
        providerEmail: "provider@example.com",
        studentEmail: "auth@example.com",
      }),
    );
  });

  it("requires an authenticated booking session", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request(), {
      params: Promise.resolve({ slug }),
    });

    expect(response.status).toBe(401);
    expect(createPublicAppointmentRequest).not.toHaveBeenCalled();
  });

  it("rejects cross-origin confirmation attempts", async () => {
    const response = await POST(
      new Request(`http://localhost/api/booking-pages/${slug}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.example",
        },
        body: JSON.stringify({
          studentName: "Ada Student",
          studentEmail: "ada@example.com",
          startsAt,
        }),
      }),
      { params: Promise.resolve({ slug }) },
    );

    expect(response.status).toBe(403);
    expect(createPublicAppointmentRequest).not.toHaveBeenCalled();
  });

  it("returns a conflict when the selected time was just reserved", async () => {
    vi.mocked(createPublicAppointmentRequest).mockRejectedValue(
      new mocks.UnavailableError(),
    );

    const response = await POST(request(), {
      params: Promise.resolve({ slug }),
    });

    expect(response.status).toBe(409);
  });

  it("rejects invalid booking details", async () => {
    const response = await POST(
      new Request(`http://localhost/api/booking-pages/${slug}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: "not-a-timestamp" }),
      }),
      { params: Promise.resolve({ slug }) },
    );

    expect(response.status).toBe(400);
    expect(createPublicAppointmentRequest).not.toHaveBeenCalled();
  });
});

function request() {
  return new Request(
    `http://localhost/api/booking-pages/${slug}/appointments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({
        startsAt,
        comment: "LGS preparation",
      }),
    },
  );
}
