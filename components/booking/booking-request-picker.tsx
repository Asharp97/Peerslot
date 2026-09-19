"use client";

import {
  ArrowRight,
  Check,
  LockKeyhole,
  LoaderCircle,
  MailCheck,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { GoogleAuthButton } from "@/components/google-auth-button";
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
import {
  createGoogleSignInUrl,
  readAuthError,
  requestEmailSignIn,
} from "@/lib/auth-browser";
import { legalConsentAdditionalFields } from "@/lib/legal-consent";

import { BookingSlotPicker } from "@/components/booking/booking-slot-picker";
import {
  groupBookingSlots,
  presentBookingSlot,
  type BookingSlot,
  type PresentedBookingSlot,
} from "@/lib/booking-slot-presentation";

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
  sending: string;
  requestedTitle: string;
  requestedBody: string;
  requestError: string;
  pastTimeError: string;
  minimumNoticeError: string;
  upcomingAppointmentError: string;
  unavailableTimeError: string;
  sessionExpiredError: string;
  emailUnverifiedError: string;
  rateLimitError: string;
  pageUnavailableError: string;
  authError: string;
  socialError: string;
  intentError: string;
  consentError: string;
};

type AuthenticatedUser = { name: string; email: string };
type BookingPhase =
  "checking" | "details" | "auth" | "verify-email" | "confirm";
type AuthMode = "sign-in" | "register";

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
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [password, setPassword] = useState("");
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
      setAuthMode("register");
      setPhase("auth");
    }
    setSaving(false);
  }

  async function handleEmailAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const returnPath = await createBookingAuthIntent();
      if (!returnPath) {
        setError(copy.intentError);
        return;
      }

      // A duplicate signup returns a synthetic, unverified user even when the
      // real account is verified. Authenticate first, regardless of the tab.
      const signIn = await requestEmailSignIn(
        studentEmail,
        password,
        returnPath,
      );
      if (signIn.ok) {
        await continueAfterAuthentication();
        return;
      }

      const failure = (await signIn.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (signIn.status === 403 && failure?.code === "EMAIL_NOT_VERIFIED") {
        setPhase("verify-email");
        return;
      }
      if (
        authMode !== "register" ||
        signIn.status !== 401 ||
        failure?.code !== "INVALID_EMAIL_OR_PASSWORD"
      ) {
        setError(failure?.message || copy.authError);
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
        return;
      }

      setPhase("verify-email");
    } catch {
      setError(copy.authError);
    } finally {
      setSaving(false);
    }
  }

  async function handleSocialAuth() {
    if (!selected) return;
    setSaving(true);
    setError("");

    const returnPath = await createBookingAuthIntent();
    if (!returnPath) {
      setError(copy.intentError);
      setSaving(false);
      return;
    }

    const callbackURL = new URL(returnPath, window.location.origin).toString();
    const url = await createGoogleSignInUrl({
      callbackURL,
      errorCallbackURL: callbackURL,
      requestSignUp: authMode === "register",
      additionalData:
        authMode === "register" ? legalConsentAdditionalFields : undefined,
    });

    if (!url) {
      setError(copy.socialError);
      setSaving(false);
      return;
    }

    window.location.assign(url);
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
      if (!response.ok) {
        setError(await bookingRequestError(response, copy, locale));
        return;
      }
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
      <BookingSlotPicker
        slots={slots}
        locale={locale}
        timeZone={timeZone}
        copy={copy}
        disabled={!sessionChecked}
        onSelect={chooseSlot}
      />

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
                    <GoogleAuthButton
                      className="w-full font-bold"
                      disabled={saving}
                      onClick={handleSocialAuth}
                    >
                      {copy.googleAction}
                    </GoogleAuthButton>
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
                      <p className="text-sm leading-6 text-black/55">
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
                      </p>
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

async function bookingRequestError(
  response: Response,
  copy: BookingRequestCopy,
  locale: string,
) {
  const body = (await response.json().catch(() => null)) as {
    code?: string;
    minimumNoticeHours?: number;
  } | null;
  if (response.status === 401) return copy.sessionExpiredError;
  if (response.status === 429) return copy.rateLimitError;
  switch (body?.code) {
    case "past":
      return copy.pastTimeError;
    case "unavailable":
      return copy.unavailableTimeError;
    case "page_not_found":
      return copy.pageUnavailableError;
    case "email_unverified":
      return copy.emailUnverifiedError;
    case "minimum_notice":
    case "upcoming_appointment": {
      if (
        typeof body.minimumNoticeHours !== "number" ||
        !Number.isFinite(body.minimumNoticeHours) ||
        body.minimumNoticeHours < 0
      )
        return copy.requestError;
      const notice = new Intl.NumberFormat(locale, {
        style: "unit",
        unit: "hour",
        unitDisplay: "long",
      }).format(body.minimumNoticeHours);
      return (
        body.code === "minimum_notice"
          ? copy.minimumNoticeError
          : copy.upcomingAppointmentError
      ).replace("{notice}", notice);
    }
    default:
      return copy.requestError;
  }
}
