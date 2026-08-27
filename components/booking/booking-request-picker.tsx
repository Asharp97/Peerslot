"use client";

import {
  ArrowRight,
  Check,
  LockKeyhole,
  LoaderCircle,
  MailCheck,
  MoonStar,
  SunMedium,
  Sunrise,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { legalConsentAdditionalFields } from "@/lib/legal-consent";

type BookingSlot = {
  startsAt: string;
};

export type BookingRequestCopy = {
  morning: string;
  afternoon: string;
  evening: string;
  requestTitle: string;
  requestBody: string;
  name: string;
  email: string;
  comment: string;
  commentPlaceholder: string;
  continue: string;
  authTitle: string;
  authBody: string;
  googleAction: string;
  facebookAction: string;
  orEmail: string;
  signInTab: string;
  registerTab: string;
  password: string;
  signInAction: string;
  registerAction: string;
  consentPrefix: string;
  termsLink: string;
  privacyLink: string;
  consentJoin: string;
  verifyTitle: string;
  verifyBody: string;
  verifyAction: string;
  confirmTitle: string;
  confirmBody: string;
  bookingAs: string;
  confirmRequest: string;
  sendRequest: string;
  sending: string;
  requestedTitle: string;
  requestedBody: string;
  requestError: string;
  authError: string;
  socialError: string;
  intentError: string;
  consentError: string;
};

type AuthenticatedUser = { name: string; email: string };
type BookingPhase =
  "checking" | "details" | "auth" | "verify-email" | "confirm";
type AuthMode = "sign-in" | "register";
type SocialProvider = "facebook" | "google";

export function BookingRequestPicker({
  bookingPageId,
  bookingTitle,
  locale,
  slug,
  slots,
  timeZone,
  copy,
}: {
  bookingPageId: string;
  bookingTitle: string;
  locale: string;
  slug: string;
  slots: BookingSlot[];
  timeZone: string;
  copy: BookingRequestCopy;
}) {
  const days = useMemo(
    () => groupBookingSlots(slots, locale, timeZone),
    [locale, slots, timeZone],
  );
  const [selected, setSelected] = useState<PresentedBookingSlot | null>(null);
  const [phase, setPhase] = useState<BookingPhase>("checking");
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const shouldResume = new URLSearchParams(window.location.search).has(
        "booking",
      );
      const [user, intent] = await Promise.all([
        fetchSessionUser(),
        shouldResume ? fetchBookingIntent() : Promise.resolve(null),
      ]);

      if (cancelled) return;

      setCurrentUser(user);
      setSessionChecked(true);

      if (!intent) return;
      if (intent.bookingPageId !== bookingPageId) {
        void clearBookingIntent();
        return;
      }

      const presented =
        days
          .flatMap((day) => day.periods.flatMap((period) => period.slots))
          .find((slot) => slot.startsAt === intent.selectedStartTime) ??
        presentBookingSlot(
          { startsAt: intent.selectedStartTime },
          locale,
          timeZone,
        );

      const draft = readDraft(bookingPageId);
      let resumedUser = user;
      if (user && !user.name.trim() && draft.studentName) {
        resumedUser = await updateDisplayName(user, draft.studentName);
        if (cancelled) return;
        setCurrentUser(resumedUser);
      }

      setComment(draft.comment);
      if (resumedUser) {
        setStudentName(resumedUser.name || draft.studentName);
        setStudentEmail(resumedUser.email);
      } else {
        setStudentName(draft.studentName);
        setStudentEmail(draft.studentEmail);
      }
      setSelected(presented);
      if (new URLSearchParams(window.location.search).has("error")) {
        setError(copy.socialError);
      }
      setPhase(
        resumedUser?.name.trim() ? "confirm" : resumedUser ? "details" : "auth",
      );
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [bookingPageId, copy.socialError, days, locale, slots, timeZone]);

  function chooseSlot(slot: PresentedBookingSlot) {
    if (!sessionChecked) return;

    setSelected(slot);
    setRequested(false);
    setError("");

    if (currentUser?.name.trim()) {
      setStudentName(currentUser.name);
      setStudentEmail(currentUser.email);
      setPhase("confirm");
      return;
    }

    setPhase("details");
  }

  async function continueFromDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    let user = currentUser ?? (await fetchSessionUser());
    if (user) {
      if (!user.name.trim()) {
        user = await updateDisplayName(user, studentName);
      }
      if (!user.name.trim()) {
        setError(copy.authError);
        setSaving(false);
        return;
      }
      setCurrentUser(user);
      setStudentName(user.name);
      setStudentEmail(user.email);
      setPhase("confirm");
    } else {
      setAuthMode("sign-in");
      setPhase("auth");
    }
    setSaving(false);
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    if (authMode === "register") {
      const returnPath = await createBookingAuthIntent();
      if (!returnPath) {
        setError(copy.intentError);
        setSaving(false);
        return;
      }
      const registration = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: studentName,
          email: studentEmail,
          password,
          callbackURL: returnPath,
          ...legalConsentAdditionalFields,
        }),
      });
      if (!registration.ok) {
        setError(await readAuthError(registration, copy.authError));
        setSaving(false);
        return;
      }

      setPhase("verify-email");
      setSaving(false);
      return;
    }

    const signIn = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: studentEmail,
        password,
        rememberMe: true,
      }),
    });
    if (!signIn.ok) {
      setError(await readAuthError(signIn, copy.authError));
      setSaving(false);
      return;
    }

    await continueAfterAuthentication();
  }

  async function handleSocialAuth(provider: SocialProvider) {
    if (!selected) return;
    if (authMode === "register" && !termsAccepted) {
      setError(copy.consentError);
      return;
    }
    setSaving(true);
    setError("");

    const returnPath = await createBookingAuthIntent();
    if (!returnPath) {
      setError(copy.intentError);
      setSaving(false);
      return;
    }

    const callbackURL = new URL(returnPath, window.location.origin).toString();
    const response = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
        requestSignUp: authMode === "register",
        additionalData:
          authMode === "register" ? legalConsentAdditionalFields : undefined,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      url?: string;
    } | null;

    if (!response.ok || !body?.url) {
      setError(copy.socialError);
      setSaving(false);
      return;
    }

    window.location.assign(body.url);
  }

  async function createBookingAuthIntent() {
    if (!selected) return null;

    saveDraft(bookingPageId, { studentName, studentEmail, comment });
    const intent = await fetch("/api/booking-intent", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingPageId,
        selectedStartTime: selected.startsAt,
        locale,
      }),
    });
    if (!intent.ok) return null;

    const intentBody = (await intent.json().catch(() => null)) as {
      returnPath?: string;
    } | null;
    if (
      !intentBody?.returnPath?.startsWith("/") ||
      intentBody.returnPath.startsWith("//")
    ) {
      return null;
    }

    const callback = new URL(intentBody.returnPath, window.location.origin);
    return callback.origin === window.location.origin
      ? intentBody.returnPath
      : null;
  }

  async function continueAfterAuthentication() {
    const user = await fetchSessionUser();
    if (!user) {
      setError(copy.authError);
      setSaving(false);
      return;
    }

    setCurrentUser(user);
    setStudentName(user.name);
    setStudentEmail(user.email);
    setPassword("");
    setPhase("confirm");
    setSaving(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/booking-pages/${slug}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: selected.startsAt,
          comment: comment || undefined,
        }),
      });
      if (!response.ok) throw new Error(copy.requestError);
      sessionStorage.removeItem(draftKey(bookingPageId));
      setRequested(true);
    } catch {
      setError(copy.requestError);
    } finally {
      setSaving(false);
    }
  }

  function close(open: boolean) {
    if (open) return;
    setSelected(null);
    setRequested(false);
    setPhase(currentUser ? "confirm" : "details");
    setPassword("");
    setError("");
  }

  return (
    <>
      <div className="mt-8 space-y-5">
        {days.map((day) => (
          <section
            className="overflow-hidden rounded-[24px] border border-black/10 bg-[#fbfaf4]"
            key={day.dateKey}
          >
            <header className="flex items-center gap-4 border-b border-black/8 bg-lavender-whisper/45 px-4 py-4 sm:px-5">
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-vast-ink font-display text-3xl leading-none text-white">
                {day.day}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-2xl leading-none tracking-[-0.025em] capitalize">
                  {day.weekday}
                </h3>
                <p className="mt-1.5 text-[11px] font-bold tracking-[0.09em] text-black/45 uppercase">
                  {day.monthYear}
                </p>
              </div>
            </header>

            <div className="divide-y divide-black/8 px-4 sm:px-5">
              {day.periods.map((period) => (
                <div
                  className="grid gap-3 py-4 sm:grid-cols-[7.5rem_1fr] sm:items-start"
                  key={period.period}
                >
                  <div className="flex items-center gap-2 pt-1 text-xs font-bold text-black/45">
                    <PeriodIcon period={period.period} />
                    <span>{copy[period.period]}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {period.slots.map((slot) => (
                      <button
                        aria-label={slot.accessibleLabel}
                        className="min-h-11 min-w-22 rounded-full border border-vast-ink/15 bg-white px-4 text-center text-sm font-extrabold tabular-nums text-vast-ink transition hover:-translate-y-0.5 hover:border-vast-ink hover:bg-vast-ink hover:text-white disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:text-vast-ink"
                        key={slot.startsAt}
                        disabled={!sessionChecked}
                        onClick={() => chooseSlot(slot)}
                        type="button"
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={selected !== null} onOpenChange={close}>
        <DialogContent className="border-2 border-vast-ink bg-lumen-cream sm:max-w-lg">
          {requested ? (
            <div className="py-8 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-lavender-whisper">
                <Check size={20} />
              </span>
              <DialogTitle className="mt-5 font-display text-3xl">
                {copy.requestedTitle}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {copy.requestedBody}
              </DialogDescription>
            </div>
          ) : (
            <>
              {phase === "checking" ? (
                <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold">
                  <LoaderCircle className="animate-spin" size={20} />
                  {copy.sending}
                </div>
              ) : null}

              {phase === "details" ? (
                <form onSubmit={continueFromDetails}>
                  <DialogHeader>
                    <DialogTitle className="font-display text-3xl">
                      {copy.requestTitle}
                    </DialogTitle>
                    <DialogDescription>
                      {selected?.accessibleLabel}. {copy.requestBody}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-6 grid gap-4">
                    <IdentityFields
                      copy={copy}
                      email={studentEmail}
                      name={studentName}
                      setEmail={setStudentEmail}
                      setName={setStudentName}
                    />
                    <CommentField
                      comment={comment}
                      copy={copy}
                      setComment={setComment}
                    />
                    <ErrorMessage message={error} />
                  </div>
                  <DialogFooter className="mt-6">
                    <Button
                      className="h-11 rounded-full bg-forest-ink px-5 text-white"
                      disabled={saving}
                      type="submit"
                    >
                      {saving ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {copy.continue}
                      {!saving ? <ArrowRight size={17} /> : null}
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}

              {phase === "auth" ? (
                <form onSubmit={handleEmailAuth}>
                  <DialogHeader>
                    <span className="mb-3 grid size-11 place-items-center rounded-2xl bg-lavender-whisper">
                      <LockKeyhole size={19} />
                    </span>
                    <DialogTitle className="font-display text-3xl">
                      {copy.authTitle}
                    </DialogTitle>
                    <DialogDescription>{copy.authBody}</DialogDescription>
                  </DialogHeader>

                  <BookingSummary
                    bookingTitle={bookingTitle}
                    selected={selected}
                    timeZone={timeZone}
                  />

                  <div className="mt-5 grid gap-3">
                    <SocialButton
                      disabled={saving}
                      label={copy.googleAction}
                      onClick={handleSocialAuth}
                      provider="google"
                    />
                    {/* Facebook OAuth is hidden until PeerSlot can complete
                        Meta Business Verification through its future parent company.
                    <SocialButton
                      disabled={saving}
                      label={copy.facebookAction}
                      onClick={handleSocialAuth}
                      provider="facebook"
                    />
                    */}
                  </div>

                  <div className="my-5 flex items-center gap-3 text-[11px] font-bold tracking-[0.08em] text-black/45 uppercase">
                    <span className="h-px flex-1 bg-black/10" />
                    {copy.orEmail}
                    <span className="h-px flex-1 bg-black/10" />
                  </div>

                  <div className="mb-4 grid grid-cols-2 rounded-xl border border-black/10 bg-lumen-stone p-1">
                    {(["sign-in", "register"] as const).map((mode) => (
                      <button
                        className={`min-h-9 rounded-lg text-sm font-bold ${
                          authMode === mode
                            ? "bg-white shadow-sm"
                            : "text-black/50"
                        }`}
                        key={mode}
                        onClick={() => {
                          setAuthMode(mode);
                          setError("");
                        }}
                        type="button"
                      >
                        {mode === "sign-in" ? copy.signInTab : copy.registerTab}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-4">
                    {authMode === "register" ? (
                      <div>
                        <Label className="mb-2 font-bold" htmlFor="auth-name">
                          {copy.name}
                        </Label>
                        <Input
                          autoComplete="name"
                          id="auth-name"
                          minLength={2}
                          onChange={(event) =>
                            setStudentName(event.target.value)
                          }
                          required
                          value={studentName}
                        />
                      </div>
                    ) : null}
                    <div>
                      <Label className="mb-2 font-bold" htmlFor="auth-email">
                        {copy.email}
                      </Label>
                      <Input
                        autoComplete="email"
                        id="auth-email"
                        onChange={(event) =>
                          setStudentEmail(event.target.value)
                        }
                        required
                        type="email"
                        value={studentEmail}
                      />
                    </div>
                    <div>
                      <Label className="mb-2 font-bold" htmlFor="auth-password">
                        {copy.password}
                      </Label>
                      <Input
                        autoComplete={
                          authMode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        id="auth-password"
                        minLength={8}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type="password"
                        value={password}
                      />
                    </div>
                    {authMode === "register" ? (
                      <label className="flex items-start gap-3 text-sm leading-6 text-black/55">
                        <input
                          checked={termsAccepted}
                          className="mt-1 size-4 accent-vast-ink"
                          onChange={(event) =>
                            setTermsAccepted(event.target.checked)
                          }
                          required
                          type="checkbox"
                        />
                        <span>
                          {copy.consentPrefix}{" "}
                          <a
                            className="font-semibold text-vast-ink underline underline-offset-3"
                            href={`/${locale}/policy/terms-agreements`}
                            target="_blank"
                          >
                            {copy.termsLink}
                          </a>{" "}
                          {copy.consentJoin}{" "}
                          <a
                            className="font-semibold text-vast-ink underline underline-offset-3"
                            href={`/${locale}/policy/privacy`}
                            target="_blank"
                          >
                            {copy.privacyLink}
                          </a>
                        </span>
                      </label>
                    ) : null}
                    <ErrorMessage message={error} />
                  </div>
                  <DialogFooter className="mt-5">
                    <Button
                      className="h-11 rounded-full bg-forest-ink px-5 text-white"
                      disabled={saving}
                      type="submit"
                    >
                      {saving ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {authMode === "register"
                        ? copy.registerAction
                        : copy.signInAction}
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}

              {phase === "verify-email" ? (
                <div className="py-6 text-center">
                  <span className="mx-auto grid size-16 place-items-center rounded-2xl border-2 border-vast-ink bg-lavender-whisper">
                    <MailCheck size={28} aria-hidden="true" />
                  </span>
                  <DialogTitle className="mt-5 font-display text-3xl">
                    {copy.verifyTitle}
                  </DialogTitle>
                  <DialogDescription className="mt-3">
                    {copy.verifyBody.replace("{email}", studentEmail)}
                  </DialogDescription>
                  <Button
                    className="mt-6 h-11 rounded-full"
                    onClick={() => {
                      setAuthMode("sign-in");
                      setPhase("auth");
                    }}
                    type="button"
                    variant="outline"
                  >
                    {copy.verifyAction}
                  </Button>
                </div>
              ) : null}

              {phase === "confirm" ? (
                <form onSubmit={submit}>
                  <DialogHeader>
                    <DialogTitle className="font-display text-3xl">
                      {copy.confirmTitle}
                    </DialogTitle>
                    <DialogDescription>{copy.confirmBody}</DialogDescription>
                  </DialogHeader>
                  <BookingSummary
                    bookingTitle={bookingTitle}
                    selected={selected}
                    timeZone={timeZone}
                  />
                  <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
                    <p className="text-[11px] font-bold tracking-[0.09em] text-black/45 uppercase">
                      {copy.bookingAs}
                    </p>
                    <p className="mt-1 font-bold">{studentName}</p>
                    <p className="text-sm text-black/55">{studentEmail}</p>
                  </div>
                  <div className="mt-5">
                    <CommentField
                      comment={comment}
                      copy={copy}
                      setComment={setComment}
                    />
                    <ErrorMessage message={error} />
                  </div>
                  <DialogFooter className="mt-6">
                    <Button
                      className="h-11 rounded-full bg-forest-ink px-5 text-white"
                      disabled={saving}
                      type="submit"
                    >
                      {saving ? (
                        <LoaderCircle className="animate-spin" />
                      ) : null}
                      {saving ? copy.sending : copy.confirmRequest}
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IdentityFields({
  copy,
  name,
  email,
  setName,
  setEmail,
}: {
  copy: BookingRequestCopy;
  name: string;
  email: string;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
}) {
  return (
    <>
      <div>
        <Label className="mb-2 font-bold" htmlFor="booking-name">
          {copy.name}
        </Label>
        <Input
          autoComplete="name"
          id="booking-name"
          minLength={2}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div>
        <Label className="mb-2 font-bold" htmlFor="booking-email">
          {copy.email}
        </Label>
        <Input
          autoComplete="email"
          id="booking-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
    </>
  );
}

function CommentField({
  copy,
  comment,
  setComment,
}: {
  copy: BookingRequestCopy;
  comment: string;
  setComment: (value: string) => void;
}) {
  return (
    <div>
      <Label className="mb-2 font-bold" htmlFor="booking-comment">
        {copy.comment}
      </Label>
      <Textarea
        id="booking-comment"
        maxLength={1000}
        onChange={(event) => setComment(event.target.value)}
        placeholder={copy.commentPlaceholder}
        value={comment}
      />
    </div>
  );
}

function BookingSummary({
  bookingTitle,
  selected,
  timeZone,
}: {
  bookingTitle: string;
  selected: PresentedBookingSlot | null;
  timeZone: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border-2 border-vast-ink bg-lavender-whisper/55 p-4">
      <p className="font-display text-xl">{bookingTitle}</p>
      <p className="mt-1 text-sm font-semibold">{selected?.accessibleLabel}</p>
      <p className="mt-2 text-xs font-bold text-black/45">{timeZone}</p>
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
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-vast-ink bg-white px-3 text-sm font-bold transition hover:bg-lumen-cream disabled:opacity-60"
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
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
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
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path
        fill="#fff"
        d="M13.6 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H7.8v3h2.7v8h3.1Z"
      />
    </svg>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
      {message}
    </p>
  ) : null;
}

async function fetchSessionUser() {
  const response = await fetch("/api/auth/get-session", {
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    user?: AuthenticatedUser;
  } | null;
  return body?.user ?? null;
}

async function fetchBookingIntent() {
  const response = await fetch("/api/booking-intent", {
    credentials: "include",
    headers: { "Cache-Control": "no-store" },
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = (await response.json()) as {
    intent: {
      bookingPageId: string;
      selectedStartTime: string;
    };
  };
  return body.intent;
}

async function clearBookingIntent() {
  await fetch("/api/booking-intent", {
    method: "DELETE",
    credentials: "include",
  }).catch(() => null);
}

async function readAuthError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message || fallback;
}

function draftKey(bookingPageId: string) {
  return `peerslot:booking:${bookingPageId}`;
}

function saveDraft(
  bookingPageId: string,
  draft: { studentName: string; studentEmail: string; comment: string },
) {
  try {
    sessionStorage.setItem(draftKey(bookingPageId), JSON.stringify(draft));
  } catch {
    // The signed booking intent still preserves the selected time.
  }
}

function readDraft(bookingPageId: string) {
  const emptyDraft = { studentName: "", studentEmail: "", comment: "" };
  try {
    const value = sessionStorage.getItem(draftKey(bookingPageId));
    if (!value) return emptyDraft;
    const draft = JSON.parse(value) as {
      studentName?: string;
      studentEmail?: string;
      comment?: string;
    };
    return {
      studentName: draft.studentName ?? "",
      studentEmail: draft.studentEmail ?? "",
      comment: draft.comment ?? "",
    };
  } catch {
    sessionStorage.removeItem(draftKey(bookingPageId));
    return emptyDraft;
  }
}

async function updateDisplayName(user: AuthenticatedUser, name: string) {
  const displayName = name.trim();
  if (user.name.trim() || displayName.length < 2) return user;

  const response = await fetch("/api/auth/update-user", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: displayName }),
  }).catch(() => null);

  return response?.ok ? { ...user, name: displayName } : user;
}

type TimePeriod = "morning" | "afternoon" | "evening";

type PresentedBookingSlot = BookingSlot & {
  accessibleLabel: string;
  time: string;
};

type BookingDay = {
  dateKey: string;
  day: string;
  weekday: string;
  monthYear: string;
  periods: Array<{
    period: TimePeriod;
    slots: PresentedBookingSlot[];
  }>;
};

export function groupBookingSlots(
  slots: BookingSlot[],
  locale: string,
  timeZone: string,
) {
  const days = new Map<
    string,
    Omit<BookingDay, "periods"> & Record<TimePeriod, PresentedBookingSlot[]>
  >();

  for (const slot of slots) {
    const startsAt = new Date(slot.startsAt);
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(startsAt);
    const values = Object.fromEntries(
      dateParts.map(({ type, value }) => [type, value]),
    );
    const dateKey = `${values.year}-${values.month}-${values.day}`;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      })
        .formatToParts(startsAt)
        .find(({ type }) => type === "hour")?.value,
    );
    const period: TimePeriod =
      hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const presentedSlot = presentBookingSlot(slot, locale, timeZone);

    const existing = days.get(dateKey);
    if (existing) {
      existing[period].push(presentedSlot);
      continue;
    }

    days.set(dateKey, {
      dateKey,
      day: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        timeZone,
      }).format(startsAt),
      weekday: new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "long",
      }).format(startsAt),
      monthYear: new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone,
        year: "numeric",
      }).format(startsAt),
      morning: period === "morning" ? [presentedSlot] : [],
      afternoon: period === "afternoon" ? [presentedSlot] : [],
      evening: period === "evening" ? [presentedSlot] : [],
    });
  }

  return [...days.values()].map(({ morning, afternoon, evening, ...day }) => ({
    ...day,
    periods: [
      { period: "morning" as const, slots: morning },
      { period: "afternoon" as const, slots: afternoon },
      { period: "evening" as const, slots: evening },
    ].filter(({ slots: periodSlots }) => periodSlots.length > 0),
  }));
}

function presentBookingSlot(
  slot: BookingSlot,
  locale: string,
  timeZone: string,
): PresentedBookingSlot {
  const startsAt = new Date(slot.startsAt);
  return {
    ...slot,
    accessibleLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(startsAt),
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(startsAt),
  };
}

function PeriodIcon({ period }: { period: TimePeriod }) {
  if (period === "morning") return <Sunrise aria-hidden="true" size={15} />;
  if (period === "afternoon") {
    return <SunMedium aria-hidden="true" size={15} />;
  }
  return <MoonStar aria-hidden="true" size={15} />;
}
