import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAccountExport: vi.fn(),
  permanentlyDeleteAccount: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/account-data", () => ({
  buildAccountExport: mocks.buildAccountExport,
  permanentlyDeleteAccount: mocks.permanentlyDeleteAccount,
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

import { DELETE, GET } from "@/app/api/account/route";

describe("account data API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires authentication for exports", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/account"));

    expect(response.status).toBe(401);
    expect(mocks.buildAccountExport).not.toHaveBeenCalled();
  });

  it("downloads only the authenticated account export without caching", async () => {
    mocks.getCurrentUser.mockResolvedValue({ user: { id: "user-id" } });
    mocks.buildAccountExport.mockResolvedValue({
      account: { email: "ada@example.com" },
      appointments: { hosted: [], requested: [] },
    });

    const response = await GET(new Request("http://localhost/api/account"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain(
      'attachment; filename="peerslot-account-',
    );
    expect(body.account.email).toBe("ada@example.com");
    expect(mocks.buildAccountExport).toHaveBeenCalledWith("user-id");
  });

  it("requires the explicit deletion phrase", async () => {
    mocks.getCurrentUser.mockResolvedValue({ user: { id: "user-id" } });

    const response = await DELETE(
      jsonDeleteRequest({ confirmation: "delete" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.permanentlyDeleteAccount).not.toHaveBeenCalled();
  });

  it("permanently deletes the authenticated account", async () => {
    mocks.getCurrentUser.mockResolvedValue({ user: { id: "user-id" } });
    mocks.permanentlyDeleteAccount.mockResolvedValue(true);

    const response = await DELETE(
      jsonDeleteRequest({ confirmation: "DELETE" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Clear-Site-Data")).toContain("cookies");
    expect(mocks.permanentlyDeleteAccount).toHaveBeenCalledWith("user-id");
  });
});

function jsonDeleteRequest(body: unknown) {
  return new Request("http://localhost/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
