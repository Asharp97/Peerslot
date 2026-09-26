import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  loadProviderWorkspace: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/provider-workspace", () => ({
  loadProviderWorkspace: mocks.loadProviderWorkspace,
}));

import { GET } from "@/app/api/provider/dashboard/route";

describe("provider dashboard API integration", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.loadProviderWorkspace.mockReset();
  });

  it("requires JWT authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/provider/dashboard"),
    );

    expect(response.status).toBe(401);
    expect(mocks.loadProviderWorkspace).not.toHaveBeenCalled();
  });

  it("requires provider capability", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "student-id" },
      capabilities: { canProvide: false },
    });

    const response = await GET(
      new Request("http://localhost/api/provider/dashboard"),
    );

    expect(response.status).toBe(403);
  });

  it("returns the combined provider workspace without caching", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "provider-id", offersAppointments: true },
      capabilities: { canProvide: true },
    });
    mocks.loadProviderWorkspace.mockResolvedValue({
      profile: { displayName: "Ceyda" },
      bookingPage: { slug: "ABCDEFGH" },
      upcomingAppointments: [],
      recentBookings: [],
      openTimesThisWeek: [],
    });

    const response = await GET(
      new Request("http://localhost/api/provider/dashboard"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.bookingPage.slug).toBe("ABCDEFGH");
    expect(mocks.loadProviderWorkspace).toHaveBeenCalledWith("provider-id");
  });
});
