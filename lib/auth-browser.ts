import { legalConsentAdditionalFields } from "@/lib/legal-consent";

export async function fetchAccessToken() {
  const response = await fetch("/api/auth/token", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) return null;

  return ((await response.json()) as { token?: string }).token ?? null;
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

export async function createGoogleSignInUrl(input: {
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
      additionalData: legalConsentAdditionalFields,
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
