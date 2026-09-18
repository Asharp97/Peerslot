// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProviderAppointmentRequests,
  type ProviderAppointmentRequestsCopy,
} from "@/components/provider-workspace/provider-appointment-requests";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/components/provider-workspace/provider-shell", () => ({
  useProviderWorkspace: () => ({
    accessToken: "access-token",
    refreshPendingRequestCount: vi.fn(),
    data: { bookingPage: { timeZone: "Europe/Istanbul" } },
  }),
}));

describe("provider appointment requests", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts a pending request and removes it from the queue", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          appointments: [
            {
              id: "appointment-id",
              studentName: "Ada Student",
              studentEmail: "ada@example.com",
              startsAt: "2030-01-15T09:00:00.000Z",
              endsAt: "2030-01-15T09:45:00.000Z",
              comment: "LGS preparation",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          appointment: { id: "appointment-id", status: "scheduled" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProviderAppointmentRequests copy={copy} />);

    expect(await screen.findByText("Ada Student")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "accept" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/provider/appointment-requests/appointment-id",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ decision: "accept" }),
        }),
      );
      expect(screen.queryByText("Ada Student")).toBeNull();
    });
  });
});

const copy = new Proxy(
  {},
  { get: (_target, property) => String(property) },
) as ProviderAppointmentRequestsCopy;
