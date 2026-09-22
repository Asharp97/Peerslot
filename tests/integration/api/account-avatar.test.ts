import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeApiUser: vi.fn(),
  deleteAvatar: vi.fn(),
  enforceRateLimit: vi.fn(),
  isCurrentAvatar: vi.fn(),
  updateUserAvatar: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock("@/lib/api-authorization", () => ({
  authorizeApiUser: mocks.authorizeApiUser,
}));
vi.mock("@/lib/account-avatar", () => ({
  isCurrentAvatar: mocks.isCurrentAvatar,
  updateUserAvatar: mocks.updateUserAvatar,
}));
vi.mock("@/lib/avatar-storage", () => ({
  AVATAR_MAX_BYTES: 2 * 1024 * 1024,
  AvatarStorageConfigurationError: class AvatarStorageConfigurationError extends Error {},
  InvalidAvatarError: class InvalidAvatarError extends Error {},
  avatarBelongsToUser: vi.fn(() => true),
  avatarKeyFromUrl: vi.fn(() => null),
  avatarUrlForKey: (key: string) => `/api/account/avatar?key=${encodeURIComponent(key)}`,
  deleteAvatar: mocks.deleteAvatar,
  isAvatarContentType: (value: string) => ["image/png", "image/jpeg", "image/webp"].includes(value),
  isSafeAvatarKey: (key: string) => key.startsWith("users/"),
  signedAvatarUrl: vi.fn(),
  uploadAvatar: mocks.uploadAvatar,
}));
vi.mock("@/lib/request-security", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));

import { GET, POST } from "@/app/api/account/avatar/route";

describe("account avatar API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceRateLimit.mockReturnValue(null);
    mocks.authorizeApiUser.mockResolvedValue({
      authorized: true,
      currentUser: {
        user: { id: "user-id", image: null },
      },
    });
    mocks.uploadAvatar.mockResolvedValue("users/hash/avatar.webp");
    mocks.updateUserAvatar.mockResolvedValue(true);
  });

  it("requires an authenticated account", async () => {
    mocks.authorizeApiUser.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    const response = await POST(new Request("http://localhost/api/account/avatar", {
      method: "POST",
    }));
    expect(response.status).toBe(401);
    expect(mocks.uploadAvatar).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types before storage", async () => {
    const body = new FormData();
    body.append("file", new File(["not-an-image"], "avatar.gif", { type: "image/gif" }));
    const response = await POST(new Request("http://localhost/api/account/avatar", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body,
    }));
    expect(response.status).toBe(415);
    expect(mocks.uploadAvatar).not.toHaveBeenCalled();
  });

  it("uploads the avatar, stores a scoped URL, and returns it", async () => {
    const body = new FormData();
    body.append("file", new File([new Uint8Array([1, 2, 3])], "avatar.png", { type: "image/png" }));
    const response = await POST(new Request("http://localhost/api/account/avatar", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { image: "/api/account/avatar?key=users%2Fhash%2Favatar.webp" },
    });
    expect(mocks.updateUserAvatar).toHaveBeenCalledWith(
      "user-id",
      "/api/account/avatar?key=users%2Fhash%2Favatar.webp",
      null,
    );
  });

  it("only redirects to a currently referenced avatar", async () => {
    mocks.isCurrentAvatar.mockResolvedValue(false);
    const response = await GET(new Request(
      "http://localhost/api/account/avatar?key=users%2Fhash%2Favatar.webp",
    ));
    expect(response.status).toBe(404);
  });

  it("redirects a current avatar to a short-lived storage URL", async () => {
    mocks.isCurrentAvatar.mockResolvedValue(true);
    const { signedAvatarUrl } = await import("@/lib/avatar-storage");
    vi.mocked(signedAvatarUrl).mockResolvedValue("https://storage.example/avatar.webp");
    const response = await GET(new Request(
      "http://localhost/api/account/avatar?key=users%2Fhash%2Favatar.webp",
    ));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example/avatar.webp");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
