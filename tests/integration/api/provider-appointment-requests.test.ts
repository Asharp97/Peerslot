import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/provider/appointment-requests/route";
import { PATCH } from "@/app/api/provider/appointment-requests/[id]/route";

import { getCurrentUser } from "@/lib/current-user";
import { attachAppointmentMeeting } from "@/lib/google-meet";
import {
  listPendingProviderAppointments,
  reviewProviderAppointment,
} from "@/lib/provider-appointments";

const notificationMocks = vi.hoisted(() => ({
  notifyStudent: vi.fn(),
}));

vi.mock("@/lib/google-meet", () => ({ attachAppointmentMeeting: vi.fn(async (_providerId: string, appointment: unknown) => appointment) }));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/provider-appointments", () => ({
  ProviderAppointmentConflictError: class extends Error {},
  ProviderAppointmentNotFoundError: class extends Error {},
  ProviderAppointmentReviewConflictError: class extends Error {},
  ProviderAppointmentValidationError: class extends Error {},
  ProviderStudentNotFoundError: class extends Error {},
  listPendingProviderAppointments: vi.fn(),
  reviewProviderAppointment: vi.fn(),
}));
vi.mock("@/lib/email-notifications", () => ({
  emailLocaleFromRequest: () => "en",
  notifyStudentOfBookingDecision: notificationMocks.notifyStudent,
}));

const providerId = "provider-id";
const appointmentId = "550e8400-e29b-41d4-a716-446655440000";

describe("provider appointment requests API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      user: { id: providerId, name: "Ceyda" },
      provider: { displayName: "Ceyda", timeZone: "Europe/Istanbul" },
      capabilities: { canProvide: true },
    } as Awaited<ReturnType<typeof getCurrentUser>>);
  });

  it("lists only the provider's pending requests without caching", async () => {
    vi.mocked(listPendingProviderAppointments).mockResolvedValue([
      { id: appointmentId, status: "pending" },
    ] as Awaited<ReturnType<typeof listPendingProviderAppointments>>);

    const response = await GET(
      new Request("http://localhost/api/provider/appointment-requests"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(listPendingProviderAppointments).toHaveBeenCalledWith(providerId);
  });

  it.each(["accept", "decline"] as const)(
    "%ss a pending request",
    async (decision) => {
      vi.mocked(reviewProviderAppointment).mockResolvedValue({
        id: appointmentId,
        status: decision === "accept" ? "scheduled" : "declined",
        startsAt: new Date("2030-01-15T09:00:00.000Z"),
        endsAt: new Date("2030-01-15T09:30:00.000Z"),
        studentEmail: "student@example.com",
        studentName: "Ada",
      } as Awaited<ReturnType<typeof reviewProviderAppointment>>);

      const response = await PATCH(
        jsonRequest(
          `http://localhost/api/provider/appointment-requests/${appointmentId}`,
          { decision },
        ),
        { params: Promise.resolve({ id: appointmentId }) },
      );

      expect(response.status).toBe(200);
      expect(attachAppointmentMeeting).toHaveBeenCalledWith(providerId, expect.objectContaining({ id: appointmentId, status: decision === "accept" ? "scheduled" : "declined" }));
      expect(reviewProviderAppointment).toHaveBeenCalledWith(
        providerId,
        appointmentId,
        decision,
      );
      expect(notificationMocks.notifyStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId,
          decision,
          studentEmail: "student@example.com",
        }),
      );
    },
  );

  it("rejects an unsupported review decision", async () => {
    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/provider/appointment-requests/${appointmentId}`,
        { decision: "maybe" },
      ),
      { params: Promise.resolve({ id: appointmentId }) },
    );

    expect(response.status).toBe(400);
    expect(reviewProviderAppointment).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
