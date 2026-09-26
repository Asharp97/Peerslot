import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, PATCH } from "@/app/api/provider/students/[id]/route";

import {
  deleteProviderStudent,
  updateProviderStudent,
} from "@/lib/provider-appointments";
import { ProviderStudentEmailConflictError } from "@/lib/provider-student-errors";
import { getCurrentUser } from "@/lib/current-user";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/provider-appointments", () => ({
  ProviderAppointmentConflictError: class extends Error {},
  ProviderAppointmentNotFoundError: class extends Error {},
  ProviderAppointmentValidationError: class extends Error {},
  ProviderStudentNotFoundError: class extends Error {},
  deleteProviderStudent: vi.fn(),
  updateProviderStudent: vi.fn(),
}));

const providerId = "provider-id";
const studentId = "7d45e9f4-6260-4dca-a95a-b5fa6c068cb8";

describe("provider students API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      user: { id: providerId, offersAppointments: true },
      capabilities: { canProvide: true },
    } as Awaited<ReturnType<typeof getCurrentUser>>);
  });

  it("identifies the visible student whose email conflicts", async () => {
    vi.mocked(updateProviderStudent).mockRejectedValue(
      new ProviderStudentEmailConflictError("Existing Ada"),
    );
    const response = await PATCH(
      jsonRequest("http://localhost/api/provider/students/" + studentId, {
        email: "ada@example.com",
      }),
      { params: Promise.resolve({ id: studentId }) },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This email already belongs to Existing Ada.",
      code: "student_email_conflict",
      studentName: "Existing Ada",
    });
  });

  it("edits an owned student", async () => {
    vi.mocked(updateProviderStudent).mockResolvedValue({
      id: studentId,
      displayName: "Ada Updated",
      email: null,
    } as Awaited<ReturnType<typeof updateProviderStudent>>);

    const response = await PATCH(
      jsonRequest(`http://localhost/api/provider/students/${studentId}`, {
        displayName: "Ada Updated",
        email: "",
      }),
      { params: Promise.resolve({ id: studentId }) },
    );

    expect(response.status).toBe(200);
    expect(updateProviderStudent).toHaveBeenCalledWith(providerId, studentId, {
      displayName: "Ada Updated",
      email: null,
    });
  });

  it("removes an owned student while preserving appointments", async () => {
    vi.mocked(deleteProviderStudent).mockResolvedValue({
      deleted: true,
      appointmentsPreserved: true,
      id: studentId,
    });

    const response = await DELETE(
      new Request(`http://localhost/api/provider/students/${studentId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: studentId }) },
    );

    expect(response.status).toBe(200);
    expect(deleteProviderStudent).toHaveBeenCalledWith(providerId, studentId);
  });
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
