import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/provider/appointments/route";
import { DELETE, PATCH } from "@/app/api/provider/appointments/[id]/route";

import {
  createProviderAppointment,
  ProviderAppointmentValidationError,
  deleteProviderAppointment,
  listProviderAppointments,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import { getCurrentUser } from "@/lib/current-user";
import { attachAppointmentMeeting } from "@/lib/google-meet";

vi.mock("@/lib/google-meet", () => ({ attachAppointmentMeeting: vi.fn(async (_providerId: string, appointment: unknown) => appointment) }));

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/provider-appointments", () => ({
  ProviderAppointmentConflictError: class extends Error {},
  ProviderAppointmentNotFoundError: class extends Error {},
  ProviderAppointmentReviewConflictError: class extends Error {},
  ProviderAppointmentValidationError: class extends Error {},
  ProviderStudentNotFoundError: class extends Error {},
  createProviderAppointment: vi.fn(),
  deleteProviderAppointment: vi.fn(),
  listProviderAppointments: vi.fn(),
  updateProviderAppointment: vi.fn(),
}));

const providerId = "provider-id";
const appointmentId = "550e8400-e29b-41d4-a716-446655440000";
const providerStudentId = "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8";

describe("provider appointments API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      user: { id: providerId, offersAppointments: true },
      capabilities: { canProvide: true },
    } as Awaited<ReturnType<typeof getCurrentUser>>);
  });

  it("loads the visible calendar range for the authenticated provider", async () => {
    vi.mocked(listProviderAppointments).mockResolvedValue([]);
    const response = await GET(
      new Request(
        "http://localhost/api/provider/appointments?startsAt=2030-01-15T00%3A00%3A00Z&endsAt=2030-01-22T00%3A00%3A00Z",
      ),
    );

    expect(response.status).toBe(200);
    expect(listProviderAppointments).toHaveBeenCalledWith(providerId, {
      startsAt: new Date("2030-01-15T00:00:00Z"),
      endsAt: new Date("2030-01-22T00:00:00Z"),
    });
    expect(await response.json()).toEqual({ appointments: [] });
  });

  it("returns an actionable validation error for a past session", async () => {
    vi.mocked(createProviderAppointment).mockRejectedValue(
      Object.assign(
        new ProviderAppointmentValidationError(
          "Choose a future date and time for this session.",
        ),
        { code: "past" },
      ),
    );
    const response = await POST(
      jsonRequest("http://localhost/api/provider/appointments", "POST", {
        providerStudentId,
        startsAt: "2020-01-15T09:00:00Z",
        endsAt: "2020-01-15T09:45:00Z",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "past",
      error: "Choose a future date and time for this session.",
    });
  });

  it("creates a session with a provider-managed student", async () => {
    vi.mocked(createProviderAppointment).mockResolvedValue({
      id: appointmentId,
    } as Awaited<ReturnType<typeof createProviderAppointment>>);
    const response = await POST(
      jsonRequest("http://localhost/api/provider/appointments", "POST", {
        providerStudentId,
        startsAt: "2030-01-15T09:00:00+03:00",
        endsAt: "2030-01-15T09:45:00+03:00",
        comment: "Focus on geometry",
      }),
    );

    expect(response.status).toBe(201);
    expect(attachAppointmentMeeting).toHaveBeenCalledWith(providerId, expect.objectContaining({ id: appointmentId }));
    expect(createProviderAppointment).toHaveBeenCalledWith(
      providerId,
      expect.objectContaining({
        providerStudentId,
        startsAt: new Date("2030-01-15T06:00:00Z"),
        comment: "Focus on geometry",
      }),
    );
  });

  it("moves only the selected appointment as an exception", async () => {
    vi.mocked(updateProviderAppointment).mockResolvedValue({
      id: appointmentId,
      rescheduleCount: 1,
    } as Awaited<ReturnType<typeof updateProviderAppointment>>);
    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/provider/appointments/${appointmentId}`,
        "PATCH",
        {
          startsAt: "2030-01-16T10:00:00Z",
          endsAt: "2030-01-16T10:45:00Z",
        },
      ),
      { params: Promise.resolve({ id: appointmentId }) },
    );

    expect(response.status).toBe(200);
    expect(updateProviderAppointment).toHaveBeenCalledWith(
      providerId,
      appointmentId,
      {
        editScope: "exception",
        startsAt: new Date("2030-01-16T10:00:00Z"),
        endsAt: new Date("2030-01-16T10:45:00Z"),
        occurrenceStartsAt: undefined,
      },
    );
  });

  it("edits the selected and future recurring sessions", async () => {
    vi.mocked(updateProviderAppointment).mockResolvedValue({
      id: appointmentId,
    } as Awaited<ReturnType<typeof updateProviderAppointment>>);
    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/provider/appointments/${appointmentId}`,
        "PATCH",
        {
          startsAt: "2030-01-22T10:00:00Z",
          endsAt: "2030-01-22T10:45:00Z",
          editScope: "future",
          occurrenceStartsAt: "2030-01-22T09:00:00Z",
        },
      ),
      { params: Promise.resolve({ id: appointmentId }) },
    );

    expect(response.status).toBe(200);
    expect(updateProviderAppointment).toHaveBeenCalledWith(
      providerId,
      appointmentId,
      expect.objectContaining({
        editScope: "future",
        startsAt: new Date("2030-01-22T10:00:00Z"),
        occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
      }),
    );
  });

  it.each(["occurrence", "future"] as const)(
    "deletes the requested recurring %s scope",
    async (deleteScope) => {
      vi.mocked(deleteProviderAppointment).mockResolvedValue({
        deleted: true,
        scope: deleteScope,
      });
      const response = await DELETE(
        jsonRequest(
          `http://localhost/api/provider/appointments/${appointmentId}`,
          "DELETE",
          {
            deleteScope,
            occurrenceStartsAt: "2030-01-22T09:00:00Z",
          },
        ),
        { params: Promise.resolve({ id: appointmentId }) },
      );

      expect(response.status).toBe(200);
      expect(deleteProviderAppointment).toHaveBeenCalledWith(
        providerId,
        appointmentId,
        {
          deleteScope,
          occurrenceStartsAt: new Date("2030-01-22T09:00:00Z"),
        },
      );
      expect(await response.json()).toEqual({
        deleted: true,
        scope: deleteScope,
      });
    },
  );

  it("rejects providers that have not completed setup", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      user: { id: providerId, offersAppointments: true },
      capabilities: { canProvide: false },
    } as Awaited<ReturnType<typeof getCurrentUser>>);

    const response = await GET(
      new Request(
        "http://localhost/api/provider/appointments?startsAt=2030-01-15T00%3A00%3A00Z&endsAt=2030-01-22T00%3A00%3A00Z",
      ),
    );

    expect(response.status).toBe(403);
    expect(listProviderAppointments).not.toHaveBeenCalled();
  });
});

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
