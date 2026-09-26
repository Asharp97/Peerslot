import { legalConsentAdditionalFields } from "@/lib/legal-consent";

export async function fetchAccessToken() {
  const response = await fetch("/api/auth/token", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) return null;

  return ((await response.json()) as { token?: string }).token ?? null;
}

/**
 * Sends an authenticated request and retries once with a newly issued JWT if
 * the short-lived access token has expired while the page was open.
 */
export async function fetchWithAccessToken(
  input: RequestInfo | URL,
  token: string,
  init: RequestInit = {},
) {
  const request = (accessToken: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers, credentials: "include" });
  };

  let response = await request(token);
  if (response.status !== 401) return response;

  const refreshed = await fetchAccessToken();
  if (!refreshed || refreshed === token) return response;
  response = await request(refreshed);
  return response;
}

export function requestEmailSignIn(
  email: string,
  password: string,
  callbackURL?: string,
) {
  return fetch("/api/auth/sign-in/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, rememberMe: true, callbackURL }),
  });
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return fetch("/api/auth/request-password-reset", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirectTo }),
  });
}

export function resendVerificationEmail(email: string, callbackURL: string) {
  return fetch("/api/auth/send-verification-email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, callbackURL }),
  });
}

export async function createGoogleSignInUrl(input: {
  offersAppointments?: boolean;
  callbackURL: string;
  errorCallbackURL?: string;
}) {
  const response = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      disableRedirect: true,
      callbackURL: input.callbackURL,
      errorCallbackURL: input.errorCallbackURL ?? input.callbackURL,
      // Every Google button sits beside the Terms/Privacy notice and supports
      // both existing accounts and first-time visitors, regardless of email tab.
      requestSignUp: true,
      additionalData: { ...legalConsentAdditionalFields, offersAppointments: input.offersAppointments === true },
    }),
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as {
    url?: string;
  } | null;

  return response?.ok ? (body?.url ?? null) : null;
}

export async function readAuthError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return body?.message || fallback;
}
