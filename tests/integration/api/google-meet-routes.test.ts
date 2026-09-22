import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "@/app/api/provider/google-meet/route";
import { GET as callback } from "@/app/api/provider/google-meet/callback/route";
import { POST as createMeeting } from "@/app/api/provider/appointments/[id]/meeting/route";
import { clearRateLimitsForTests } from "@/lib/request-security";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  session: vi.fn(),
  createAuth: vi.fn(),
  connection: vi.fn(),
  readAuth: vi.fn(),
  saveAuth: vi.fn(),
  ensureMeeting: vi.fn(),
  deleteConnection: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.session } } }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ id: "provider" }] }),
      }),
    }),
    delete: () => ({ where: mocks.deleteConnection }),
  },
}));
vi.mock("@/lib/google-meet-oauth", () => ({
  googleMeetConfig: () => ({ baseUrl: "https://www.peerslot.com" }),
  createMeetAuthorization: mocks.createAuth,
  getMeetConnection: mocks.connection,
  readMeetAuthorization: mocks.readAuth,
  saveMeetAuthorization: mocks.saveAuth,
  MEET_OAUTH_COOKIE: "peerslot-meet-oauth",
  MEET_OAUTH_PATH: "/api/provider/google-meet/callback",
}));
vi.mock("@/lib/google-meet", () => ({
  ensureAppointmentMeeting: mocks.ensureMeeting,
  createUpcomingMeetings: vi.fn(),
}));
const id = "550e8400-e29b-41d4-a716-446655440000";
function request(method: string, body: unknown = {}) {
  return new Request("https://www.peerslot.com/api/provider/google-meet", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  clearRateLimitsForTests();
  mocks.currentUser.mockResolvedValue({
    user: { id: "provider" },
    capabilities: { canProvide: true },
  });
  mocks.session.mockResolvedValue({ user: { id: "provider" } });
  mocks.createAuth.mockResolvedValue({
    url: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
    cookie: "encrypted-state",
  });
  mocks.connection.mockResolvedValue(null);
});

describe("Google Meet route authorization", () => {
  it("requires authentication before any Google operation", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect((await POST(request("POST", { locale: "en" }))).status).toBe(401);
    expect(
      (
        await createMeeting(request("POST"), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(401);
    expect(mocks.createAuth).not.toHaveBeenCalled();
    expect(mocks.ensureMeeting).not.toHaveBeenCalled();
  });
  it("requires provider privileges", async () => {
    mocks.currentUser.mockResolvedValue({
      user: { id: "student" },
      capabilities: { canProvide: false },
    });
    expect(
      (
        await createMeeting(request("POST"), {
          params: Promise.resolve({ id }),
        })
      ).status,
    ).toBe(403);
    expect((await DELETE(request("DELETE"))).status).toBe(403);
  });
  it("returns only connection metadata without Google credentials", async () => {
    mocks.connection.mockResolvedValue({
      email: "host@gmail.com",
      encryptedRefreshToken: "secret-material",
      googleAccountId: "google-id",
    });
    const response = await GET(request("GET"));
    expect(await response.json()).toEqual({
      configured: true,
      connected: true,
      email: "host@gmail.com",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("binds authorization to the current provider and protects the OAuth cookie", async () => {
    const response = await POST(request("POST", { locale: "tr" }));
    expect(mocks.createAuth).toHaveBeenCalledWith("provider", "tr");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain("Path=/api/provider/google-meet/callback");
  });
  it("passes the authenticated owner to meeting creation and hides foreign appointments", async () => {
    mocks.ensureMeeting.mockResolvedValue({ status: "not_found" });
    const response = await createMeeting(
      request("POST", { providerId: "someone-else" }),
      { params: Promise.resolve({ id }) },
    );
    expect(mocks.ensureMeeting).toHaveBeenCalledWith("provider", id);
    expect(response.status).toBe(404);
  });
  it("rejects missing or mismatched callback state before exchanging a code", async () => {
    mocks.readAuth.mockResolvedValue(null);
    const response = await callback(
      new NextRequest(
        "https://www.peerslot.com/api/provider/google-meet/callback?state=wrong&code=code",
        { headers: { cookie: "peerslot-meet-oauth=encrypted-state" } },
      ),
    );
    expect(mocks.readAuth).toHaveBeenCalledWith(
      "encrypted-state",
      "wrong",
      "provider",
    );
    expect(mocks.saveAuth).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://www.peerslot.com/en/account-settings?meet=error",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("returns to the correct locale after connecting and schedules existing sessions", async () => {
    mocks.readAuth.mockResolvedValue({
      locale: "tr",
      providerId: "provider",
      verifier: "verifier",
    });
    const response = await callback(
      new NextRequest(
        "https://www.peerslot.com/api/provider/google-meet/callback?state=state&code=code",
        { headers: { cookie: "peerslot-meet-oauth=encrypted-state" } },
      ),
    );
    expect(mocks.saveAuth).toHaveBeenCalledWith("provider", "code", "verifier");
    expect(response.headers.get("location")).toBe(
      "https://www.peerslot.com/tr/account-settings?meet=connected",
    );
    expect(mocks.after).toHaveBeenCalledOnce();
  });
  it("does not exchange a code when Google consent is denied", async () => {
    mocks.readAuth.mockResolvedValue({
      locale: "tr",
      providerId: "provider",
      verifier: "verifier",
    });
    const response = await callback(
      new NextRequest(
        "https://www.peerslot.com/api/provider/google-meet/callback?state=state&error=access_denied",
      ),
    );
    expect(mocks.saveAuth).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain(
      "/tr/account-settings?meet=error",
    );
  });
});
