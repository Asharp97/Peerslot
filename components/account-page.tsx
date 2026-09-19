"use client";

import { appointmentDirection } from "@/lib/appointment-presentation";
import { FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  AccountDataControls,
  type AccountDataCopy,
} from "@/components/account-data-controls";
import { Button } from "@/components/ui/button";
import { AppointmentsSkeleton } from "@/components/appointments/appointments-states";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AppointmentAgenda,
  type AppointmentsCopy,
} from "@/components/appointments/appointment-agenda";
import {
  createGoogleSignInUrl,
  fetchAccessToken,
  requestEmailSignIn,
} from "@/lib/auth-browser";

export type AccountPageCopy = AccountDataCopy & {
  eyebrow: string;
  title: string;
  intro: string;
  loading: string;
  signedOutTitle: string;
  signedOutBody: string;
  signInAction: string;
  emailLabel: string;
  passwordLabel: string;
  googleAction: string;
  orContinue: string;
  authError: string;
};

export function AccountPage({
  copy,
  locale,
  appointmentsCopy,
}: {
  copy: AccountPageCopy;
  locale: string;
  appointmentsCopy: AppointmentsCopy;
}) {
  const [accessToken, setAccessToken] = useState<string | null | undefined>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadToken() {
      const token = await fetchAccessToken();
      if (!cancelled) setAccessToken(token);
    }

    void loadToken();
    return () => {
      cancelled = true;
    };
  }, []);

  async function signInWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setAuthError("");

    const response = await requestEmailSignIn(email, password);
    if (!response.ok) {
      setAuthError(copy.authError);
      setSubmitting(false);
      return;
    }

    const token = await fetchAccessToken();
    setAccessToken(token);
    if (!token) setAuthError(copy.authError);
    setSubmitting(false);
  }

  async function signInWithGoogle() {
    setSubmitting(true);
    setAuthError("");
    const callbackURL = `${window.location.origin}/${locale}/account`;
    const url = await createGoogleSignInUrl({
      callbackURL,
      errorCallbackURL: callbackURL,
      requestSignUp: false,
    });
    if (!url) {
      setAuthError(copy.authError);
      setSubmitting(false);
      return;
    }
    window.location.assign(url);
  }

  return (
    <main id="main-content" className="flex-1 px-5 py-16 sm:py-24">
      <div
        dir={appointmentDirection(locale)}
        className="mx-auto w-full max-w-3xl text-vast-ink"
      >
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-5xl tracking-[-0.04em] sm:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">
          {copy.intro}
        </p>

        {accessToken === undefined ? (
          <div className="mt-10">
            <AppointmentsSkeleton label={copy.loading} />
          </div>
        ) : accessToken ? (
          <>
            <AppointmentAgenda
              accessToken={accessToken}
              locale={locale}
              copy={appointmentsCopy}
            />
            <details className="mt-12 border-t border-black/10 pt-6">
              <summary className="cursor-pointer text-sm font-semibold text-black/60">
                {copy.dataPrivacy}
              </summary>
              <AccountDataControls
                accessToken={accessToken}
                className="mt-4"
                copy={copy}
              />
            </details>
          </>
        ) : (
          <section className="mt-10 max-w-xl rounded-[28px] border border-black/10 bg-white p-8">
            <h2 className="font-display text-3xl">{copy.signedOutTitle}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-black/55">
              {copy.signedOutBody}
            </p>
            <Button
              className="mt-6 w-full rounded-full"
              disabled={submitting}
              onClick={signInWithGoogle}
              type="button"
              variant="outline"
            >
              {copy.googleAction}
            </Button>
            <div className="my-5 flex items-center gap-3 text-[11px] font-bold tracking-[0.08em] text-black/40 uppercase">
              <span className="h-px flex-1 bg-black/10" />
              {copy.orContinue}
              <span className="h-px flex-1 bg-black/10" />
            </div>
            <form className="space-y-4" onSubmit={signInWithEmail}>
              <div>
                <Label htmlFor="account-email">{copy.emailLabel}</Label>
                <Input
                  autoComplete="email"
                  className="mt-2"
                  id="account-email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <Label htmlFor="account-password">{copy.passwordLabel}</Label>
                <Input
                  autoComplete="current-password"
                  className="mt-2"
                  id="account-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              {authError ? (
                <p className="text-sm font-semibold text-red-700">
                  {authError}
                </p>
              ) : null}
              <Button
                className="w-full rounded-full bg-vast-ink text-white"
                disabled={submitting}
                type="submit"
              >
                {submitting ? <LoaderCircle className="animate-spin" /> : null}
                {copy.signInAction}
              </Button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
