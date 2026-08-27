"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  LoaderCircle,
  MailCheck,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useRouter } from "@/i18n/navigation";
import { legalConsentAdditionalFields } from "@/lib/legal-consent";
import {
  appointmentDurationOptions,
  restTimeOptions,
} from "@/lib/scheduling-options";

type ProviderAuthCopy = {
  checking: string;
  brandTagline: string;
  signInTab: string;
  registerTab: string;
  signInTitle: string;
  registerTitle: string;
  signInBody: string;
  registerBody: string;
  verifyTitle: string;
  verifyBody: string;
  verifyAction: string;
  nameLabel: string;
  emailLabel: string;
  passwordLabel: string;
  signInAction: string;
  registerAction: string;
  orContinue: string;
  googleAction: string;
  facebookAction: string;
  consentPrefix: string;
  termsLink: string;
  privacyLink: string;
  consentJoin: string;
  onboardingEyebrow: string;
  onboardingTitle: string;
  onboardingBody: string;
  displayNameLabel: string;
  professionalTitleLabel: string;
  professionalTitlePlaceholder: string;
  timeZoneLabel: string;
  durationLabel: string;
  noticeLabel: string;
  restLabel: string;
  restHelp: string;
  createAction: string;
  minutes: string;
  noticeOptions: Record<string, string>;
  errors: {
    auth: string;
    social: string;
    session: string;
    onboarding: string;
    consent: string;
  };
};

type AuthMode = "sign-in" | "register";
type Phase = "checking" | "auth" | "verify-email" | "onboarding";
type SocialProvider = "facebook" | "google";

type ProviderSetupResponse = {
  status: "active" | "setup_required";
  user: { email: string; name: string };
};

const noticeOptions = [0, 60, 240, 720, 1440, 2880];

export function ProviderAuthFlow({
  copy,
  locale,
}: {
  copy: ProviderAuthCopy;
  locale: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [mode, setMode] = useState<AuthMode>("register");
  const [accessToken, setAccessToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [settings, setSettings] = useState({
    displayName: "",
    professionalTitle: "",
    timeZone: "Europe/Istanbul",
    defaultAppointmentDurationMinutes: 30,
    minimumBookingNoticeMinutes: 1440,
    restBetweenSessionsMinutes: 10,
  });

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const jwt = await mintAccessToken();

      if (cancelled) return;

      if (!jwt) {
        setPhase("auth");
        return;
      }

      const setup = await fetchProviderSetup(jwt);

      if (cancelled) return;

      if (!setup) {
        setPhase("auth");
        return;
      }

      if (setup.status === "active") {
        router.replace("/provider/dashboard");
        return;
      }

      const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setAccessToken(jwt);
      setEmail(setup.user.email);
      setSettings((current) => ({
        ...current,
        displayName: setup.user.name,
        timeZone: browserTimeZone || current.timeZone,
      }));
      setPhase("onboarding");
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    if (mode === "register") {
      const registration = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          callbackURL: `/${locale}/auth/provider`,
          ...legalConsentAdditionalFields,
        }),
      });

      if (!registration.ok) {
        setError(await readAuthError(registration, copy.errors.auth));
        setSubmitting(false);
        return;
      }

      setPhase("verify-email");
      setSubmitting(false);
      return;
    }

    const signIn = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: true }),
    });

    if (!signIn.ok) {
      setError(await readAuthError(signIn, copy.errors.auth));
      setSubmitting(false);
      return;
    }

    await continueAfterAuthentication();
  }

  async function handleSocialAuth(provider: SocialProvider) {
    if (mode === "register" && !termsAccepted) {
      setError(copy.errors.consent);
      return;
    }

    setSubmitting(true);
    setError("");

    const callbackURL = `${window.location.origin}/${locale}/auth/provider`;
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        callbackURL,
        disableRedirect: true,
        requestSignUp: mode === "register",
        additionalData:
          mode === "register" ? legalConsentAdditionalFields : undefined,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      url?: string;
    } | null;

    if (!response.ok || !body?.url) {
      setError(copy.errors.social);
      setSubmitting(false);
      return;
    }

    window.location.assign(body.url);
  }

  async function continueAfterAuthentication() {
    const jwt = await mintAccessToken();

    if (!jwt) {
      setError(copy.errors.session);
      setSubmitting(false);
      return;
    }

    const setup = await fetchProviderSetup(jwt);

    if (!setup) {
      setError(copy.errors.session);
      setSubmitting(false);
      return;
    }

    if (setup.status === "active") {
      router.replace("/provider/dashboard");
      return;
    }

    setAccessToken(jwt);
    setSettings((current) => ({
      ...current,
      displayName: setup.user.name || name,
      timeZone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || current.timeZone,
    }));
    setPhase("onboarding");
    setSubmitting(false);
  }

  async function handleOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    let jwt = accessToken;
    let response = await submitProviderSettings(jwt, settings);

    if (response.status === 401) {
      jwt = (await mintAccessToken()) ?? "";
      response = jwt ? await submitProviderSettings(jwt, settings) : response;
    }

    if (!response.ok) {
      setError(copy.errors.onboarding);
      setSubmitting(false);
      return;
    }

    router.replace("/provider/dashboard");
  }

  if (phase === "checking") {
    return (
      <div className="flex min-h-100 items-center justify-center gap-3 text-sm font-semibold">
        <LoaderCircle className="animate-spin" size={20} aria-hidden="true" />
        {copy.checking}
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <form className="space-y-5" onSubmit={handleEmailAuth}>
        <div className="grid grid-cols-2 rounded-xl border-2 border-vast-ink bg-lumen-stone p-1">
          {(["register", "sign-in"] as const).map((value) => (
            <button
              className={`min-h-10 rounded-lg text-sm font-semibold transition ${
                mode === value ? "bg-white shadow-sm" : "text-[#606058]"
              }`}
              key={value}
              onClick={() => {
                setMode(value);
                setError("");
              }}
              type="button"
            >
              {value === "register" ? copy.registerTab : copy.signInTab}
            </button>
          ))}
        </div>

        <div>
          <h2 className="font-display text-4xl tracking-[-0.03em]">
            {mode === "register" ? copy.registerTitle : copy.signInTitle}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#62625a]">
            {mode === "register" ? copy.registerBody : copy.signInBody}
          </p>
        </div>

        {mode === "register" ? (
          <Field
            label={copy.nameLabel}
            name="name"
            value={name}
            onChange={setName}
            autoComplete="name"
          />
        ) : null}
        <Field
          label={copy.emailLabel}
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />

        <Field
          label={copy.passwordLabel}
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={
            mode === "register" ? "new-password" : "current-password"
          }
          minLength={8}
        />

        {error ? <ErrorMessage message={error} /> : null}
        {mode === "register" ? (
          <label className="flex items-start gap-3 text-sm leading-6 text-[#62625a]">
            <input
              checked={termsAccepted}
              className="mt-1 size-4 accent-vast-ink"
              onChange={(event) => setTermsAccepted(event.target.checked)}
              required
              type="checkbox"
            />
            <span>
              {copy.consentPrefix}{" "}
              <Link
                className="font-semibold text-vast-ink underline underline-offset-3"
                href="/policy/terms-agreements"
                target="_blank"
              >
                {copy.termsLink}
              </Link>{" "}
              {copy.consentJoin}{" "}
              <Link
                className="font-semibold text-vast-ink underline underline-offset-3"
                href="/policy/privacy"
                target="_blank"
              >
                {copy.privacyLink}
              </Link>
            </span>
          </label>
        ) : null}
        <button
          className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border-2 border-vast-ink bg-vast-ink px-5 text-sm font-semibold text-lumen-cream disabled:cursor-wait disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : null}
          {mode === "register" ? copy.registerAction : copy.signInAction}
          {!submitting ? <ArrowRight size={18} aria-hidden="true" /> : null}
        </button>

        <div className="flex items-center gap-3 text-[11px] font-bold tracking-[0.08em] text-[#727269] uppercase">
          <span className="h-px flex-1 bg-lumen-stone" />
          {copy.orContinue}
          <span className="h-px flex-1 bg-lumen-stone" />
        </div>

        <div className="grid gap-3">
          <SocialButton
            label={copy.googleAction}
            provider="google"
            disabled={submitting}
            onClick={handleSocialAuth}
          />
          {/* Facebook OAuth is hidden until PeerSlot can complete Meta
              Business Verification through its future parent company.
          <SocialButton
            label={copy.facebookAction}
            provider="facebook"
            disabled={submitting}
            onClick={handleSocialAuth}
          />
          */}
        </div>
      </form>
    );
  }

  if (phase === "verify-email") {
    return (
      <div className="space-y-6 py-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl border-2 border-vast-ink bg-lavender-whisper">
          <MailCheck size={28} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-4xl tracking-[-0.03em]">
            {copy.verifyTitle}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#62625a]">
            {copy.verifyBody.replace("{email}", email)}
          </p>
        </div>
        <button
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-vast-ink bg-white px-5 text-sm font-semibold"
          onClick={() => {
            setMode("sign-in");
            setPhase("auth");
          }}
          type="button"
        >
          {copy.verifyAction}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleOnboarding}>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl border-2 border-vast-ink bg-lavender-whisper">
          <CalendarClock size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] font-bold tracking-[0.12em] text-[#686860] uppercase">
            {copy.onboardingEyebrow}
          </p>
          <h2 className="font-display text-4xl tracking-[-0.03em]">
            {copy.onboardingTitle}
          </h2>
        </div>
      </div>
      <p className="text-sm leading-6 text-[#62625a]">{copy.onboardingBody}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={copy.displayNameLabel}
          name="displayName"
          value={settings.displayName}
          onChange={(displayName) =>
            setSettings((current) => ({ ...current, displayName }))
          }
          autoComplete="name"
        />
        <Field
          label={copy.professionalTitleLabel}
          name="professionalTitle"
          value={settings.professionalTitle}
          onChange={(professionalTitle) =>
            setSettings((current) => ({ ...current, professionalTitle }))
          }
          placeholder={copy.professionalTitlePlaceholder}
          autoComplete="organization-title"
        />
      </div>

      {/* <label className="block text-sm font-semibold" htmlFor="timeZone">
        {copy.timeZoneLabel}
        <select
          className={fieldClassName}
          id="timeZone"
          value={settings.timeZone}
          onChange={(event) =>
            setSettings((current) => ({
              ...current,
              timeZone: event.target.value,
            }))
          }
        >
          {getTimeZones(settings.timeZone).map((timeZone) => (
            <option key={timeZone} value={timeZone}>
              {timeZone}
            </option>
          ))}
        </select>
      </label> */}

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberSelect
          label={copy.durationLabel}
          value={settings.defaultAppointmentDurationMinutes}
          options={appointmentDurationOptions}
          renderOption={(value) => `${value} ${copy.minutes}`}
          onChange={(defaultAppointmentDurationMinutes) =>
            setSettings((current) => ({
              ...current,
              defaultAppointmentDurationMinutes,
            }))
          }
        />
        <NumberSelect
          label={copy.noticeLabel}
          value={settings.minimumBookingNoticeMinutes}
          options={noticeOptions}
          renderOption={(value) => copy.noticeOptions[String(value)]}
          onChange={(minimumBookingNoticeMinutes) =>
            setSettings((current) => ({
              ...current,
              minimumBookingNoticeMinutes,
            }))
          }
        />
        <NumberSelect
          label={copy.restLabel}
          value={settings.restBetweenSessionsMinutes}
          options={restTimeOptions}
          renderOption={(value) => `${value} ${copy.minutes}`}
          onChange={(restBetweenSessionsMinutes) =>
            setSettings((current) => ({
              ...current,
              restBetweenSessionsMinutes,
            }))
          }
        />
      </div>
      <p className="-mt-3 text-xs leading-5 text-[#6b6b63]">{copy.restHelp}</p>

      {error ? <ErrorMessage message={error} /> : null}

      <button
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border-2 border-vast-ink bg-vast-ink px-5 text-sm font-semibold text-lumen-cream disabled:cursor-wait disabled:opacity-60"
        disabled={submitting}
        type="submit"
      >
        {submitting ? (
          <LoaderCircle className="animate-spin" size={18} />
        ) : null}
        {copy.createAction}
        {!submitting ? <ArrowRight size={18} aria-hidden="true" /> : null}
      </button>
    </form>
  );
}

const fieldClassName =
  "mt-2 min-h-12 w-full rounded-xl border-2 border-vast-ink bg-white px-3.5 font-normal outline-none transition focus:border-vast-ink focus:ring-0";

type FieldProps = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  type?: "email" | "password" | "text";
  placeholder?: string;
  minLength?: number;
};

function Field({
  label,
  name,
  value,
  onChange,
  autoComplete,
  type = "text",
  placeholder,
  minLength,
}: FieldProps) {
  return (
    <label className="block text-sm font-semibold" htmlFor={name}>
      {label}
      <input
        className={fieldClassName}
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        required
      />
    </label>
  );
}

function NumberSelect({
  label,
  value,
  options,
  renderOption,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  renderOption: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col justify-between text-sm font-semibold">
      <span>{label}</span>
      <Select
        onValueChange={(nextValue) => onChange(Number(nextValue))}
        value={String(value)}
      >
        <SelectTrigger
          className={`${fieldClassName} focus-visible:border-vast-ink focus-visible:ring-0`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-48 overflow-y-auto">
          {options.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {renderOption(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SocialButton({
  label,
  provider,
  disabled,
  onClick,
}: {
  label: string;
  provider: SocialProvider;
  disabled: boolean;
  onClick: (provider: SocialProvider) => void;
}) {
  return (
    <button
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-vast-ink bg-white px-3 text-sm font-semibold transition hover:bg-lumen-cream disabled:opacity-60"
      disabled={disabled}
      onClick={() => onClick(provider)}
      type="button"
    >
      {provider === "google" ? <GoogleMark /> : <FacebookMark />}
      {label}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.5 14a6 6 0 0 1 0-4V7.4H3.2a10 10 0 0 0 0 9.2L6.5 14Z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.4L6.5 10A5.8 5.8 0 0 1 12 6Z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path
        fill="#fff"
        d="M13.6 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H7.8v3h2.7v8h3.1Z"
      />
    </svg>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl border-2 border-vast-ink bg-ember-glow px-4 py-3 text-sm font-semibold"
      role="alert"
    >
      {message}
    </p>
  );
}

async function mintAccessToken() {
  const response = await fetch("/api/auth/token", {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { token?: string };
  return body.token ?? null;
}

async function fetchProviderSetup(jwt: string) {
  const response = await fetch("/api/provider", {
    headers: { Authorization: `Bearer ${jwt}` },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json()) as ProviderSetupResponse;
}

async function submitProviderSettings(
  jwt: string,
  settings: {
    displayName: string;
    professionalTitle: string;
    timeZone: string;
    defaultAppointmentDurationMinutes: number;
    minimumBookingNoticeMinutes: number;
    restBetweenSessionsMinutes: number;
  },
) {
  return fetch("/api/provider", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });
}

async function readAuthError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? fallback;
}
