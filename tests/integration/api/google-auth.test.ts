import type { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-google-auth-secret-with-at-least-32-characters");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-secret");
});
vi.mock("@/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  return { db: drizzle(new PGlite({ extensions: { btree_gist } })) };
});
vi.mock("@/lib/email-notifications", () => ({
  emailLocaleFromRequest: () => "en",
  sendVerificationEmail: vi.fn(),
}));

import { db } from "@/db";
import { account, user } from "@/db/auth-schema";
import { profiles } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createGoogleSignInUrl } from "@/lib/auth-browser";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal-consent";

const testDb = db as unknown as PgliteDatabase & { $client: PGlite };
const baseURL = "http://localhost:3000";
const googleUser = { id: "google-user-id", email: "google@example.com", name: "Google User", emailVerified: true };

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: "./drizzle" });
  const context = await auth.$context;
  const provider = context.socialProviders.find((provider) => provider.id === "google")!;
  vi.spyOn(provider, "validateAuthorizationCode").mockResolvedValue({ accessToken: "test-token", scopes: ["openid", "email", "profile"] });
  vi.spyOn(provider, "getUserInfo").mockResolvedValue({ user: googleUser, data: googleUser });
}, 30_000);

beforeEach(async () => {
  await testDb.execute(sql`truncate table "user", verification cascade`);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await testDb.$client.close();
});

async function startGoogle(body?: Record<string, unknown>) {
  let cookies = "";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const response = await auth.handler(new Request(new URL(url, baseURL), init));
    cookies = cookieHeader(response);
    return response;
  }));
  const callbackURL = `${baseURL}/en/auth/provider`;
  let url: string;
  if (body) {
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL: callbackURL, ...body }),
    });
    url = (await response.json()).url;
  } else {
    url = (await createGoogleSignInUrl({ callbackURL }))!;
  }
  expect(url).toBeTruthy();
  const state = new URL(url).searchParams.get("state")!;
  return auth.handler(new Request(`${baseURL}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`, {
    headers: { cookie: cookies },
  }));
}

function cookieHeader(response: Response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

describe("Google authentication callback", () => {
  it.each([true, false])("persists the signed Google registration preference: %s", async (offersAppointments) => {
    await startGoogle({ requestSignUp: true, additionalData: { termsAccepted: true, offersAppointments } });
    const [created] = await testDb.select().from(user);
    expect(created.offersAppointments).toBe(offersAppointments);
    // A different entry point on a later login must never reset the preference.
    await startGoogle({ requestSignUp: true, additionalData: { offersAppointments: !offersAppointments } });
    expect((await testDb.select().from(user))[0].offersAppointments).toBe(offersAppointments);
  });

  it.each([true, false, undefined])("persists the email signup preference: %s", async (offersAppointments) => {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New User", email: "new@example.com", password: "test-password-long-enough", offersAppointments }),
    }));
    expect(response.status).toBe(200);
    expect((await testDb.select().from(user))[0].offersAppointments).toBe(offersAppointments === true);
  });

  it("cannot bypass the guarded account endpoint through Better Auth update-user", async () => {
    const signedIn = await startGoogle({ requestSignUp: true, additionalData: { offersAppointments: true } });
    await auth.handler(new Request(`${baseURL}/api/auth/update-user`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie: cookieHeader(signedIn), origin: baseURL },
      body: JSON.stringify({ offersAppointments: false }),
    }));
    expect((await testDb.select().from(user))[0].offersAppointments).toBe(true);
  });

  it("creates a verified account and session through the shared Google button flow", async () => {
    const response = await startGoogle();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${baseURL}/en/auth/provider`);
    const accounts = await testDb.select().from(user);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ email: googleUser.email, emailVerified: true, termsAccepted: true });
    expect(accounts[0].termsAcceptedAt).toBeInstanceOf(Date);
    expect(await testDb.select().from(profiles)).toHaveLength(1);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(response) }) });
    expect(session?.user.id).toBe(accounts[0].id);
  });

  it("signs an existing Google user back in without duplicating their account", async () => {
    await startGoogle();
    const [original] = await testDb.select().from(user);
    const response = await startGoogle();
    expect(response.headers.get("location")).toBe(`${baseURL}/en/auth/provider`);
    expect(await testDb.select().from(user)).toHaveLength(1);
    expect(await testDb.select().from(account)).toHaveLength(1);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(response) }) });
    expect(session?.user.id).toBe(original.id);
  });

  it("links a matching verified email account without changing its identity", async () => {
    await testDb.insert(user).values({ id: "existing-user", name: "Existing User", email: googleUser.email, emailVerified: true, termsAccepted: true });
    const response = await startGoogle();
    expect(response.headers.get("location")).toBe(`${baseURL}/en/auth/provider`);
    expect(await testDb.select().from(user)).toHaveLength(1);
    expect((await testDb.select().from(account))[0].userId).toBe("existing-user");
  });

  it("records server-owned consent when the OAuth request has no client field", async () => {
    const response = await startGoogle({ requestSignUp: true });
    expect(response.headers.get("location")).toBe(`${baseURL}/en/auth/provider`);
    const [created] = await testDb.select().from(user);
    expect(created).toMatchObject({ termsAccepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    expect(created.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("records the same service-use acceptance for email registration", async () => {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Email User", email: "email@example.com", password: "test-password-long-enough" }),
    }));
    expect(response.status).toBe(200);
    const [created] = await testDb.select().from(user);
    expect(created).toMatchObject({ termsAccepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
    expect(created.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("still rejects an explicitly false acceptance value", async () => {
    const response = await auth.handler(new Request(`${baseURL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Email User", email: "email@example.com", password: "test-password-long-enough", termsAccepted: false }),
    }));
    expect(response.status).toBe(400);
    expect(await testDb.select().from(user)).toHaveLength(0);
  });

  it("reproduces signup_disabled with the old login-only request", async () => {
    const response = await startGoogle({ requestSignUp: false });
    expect(response.headers.get("location")).toContain("error=signup_disabled");
    expect(await testDb.select().from(user)).toHaveLength(0);
  });
});
