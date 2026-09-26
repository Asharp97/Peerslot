"use client";

import {
  Check,
  ChevronDown,
  ImagePlus,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

import { AccountDataControls } from "@/components/account-data-controls";
import { GoogleMeetSettings } from "@/components/provider-workspace/google-meet-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppointmentOfferingSetting } from "@/components/appointment-offering-setting";

import { fetchAccessToken } from "@/lib/auth-browser";
import type { AccountMenuCopy } from "@/components/account-settings-copy";
import { useRouter } from "@/i18n/navigation";
import {
  defaultAccountPreferences,
  parseAccountPreferences,
  type AccountPreferences,
} from "@/lib/account-preferences";

type SessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const preferencesKey = "peerslot:account-preferences";

export function AccountSettingsPage({
  locale,
  copy,
}: {
  locale: string;
  copy: AccountMenuCopy;
}) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [canHost, setCanHost] = useState(false);
  const [preferences, setPreferences] = useState<AccountPreferences>(() =>
    readPreferences(locale),
  );
  const [preferenceState, setPreferenceState] = useState<
    "idle" | "saving" | "saved"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    async function loadAccess() {
      const token = await fetchAccessToken();
      if (cancelled || !token) return;
      setAccessToken(token);
      const preferencesResponse = await fetch("/api/account/preferences", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (preferencesResponse?.ok) {
        const body = (await preferencesResponse.json().catch(() => null)) as {
          preferences?: unknown;
        } | null;
        if (!cancelled && body?.preferences) {
          const next = parseAccountPreferences(body.preferences);
          setPreferences(next);
          localStorage.setItem(preferencesKey, JSON.stringify(next));
        }
      }
      const response = await fetch("/api/provider", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (!cancelled && response?.ok) {
        const setup = (await response.json().catch(() => null)) as {
          offersAppointments?: boolean;
          profile?: { setupCompleted?: boolean };
        } | null;
        setCanHost(
          setup?.offersAppointments === true &&
            setup?.profile?.setupCompleted === true,
        );
      }
    }
    void loadAccess();
    window.addEventListener("peerslot:offering-change", loadAccess);
    return () => {
      cancelled = true;
      window.removeEventListener("peerslot:offering-change", loadAccess);
    };
  }, []);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [image, setImage] = useState("");
  const [imageState, setImageState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [passwordState, setPasswordState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [passwordError, setPasswordError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      const response = await fetch("/api/auth/get-session", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) return;
      const body = (await response.json().catch(() => null)) as {
        user?: SessionUser | null;
      } | null;
      if (!cancelled && body?.user) {
        setUser(body.user);
        setImage(body.user.image ?? "");
      }
    }
    void loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  function updatePreference<K extends keyof AccountPreferences>(
    key: K,
    value: AccountPreferences[K],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setPreferenceState("idle");
  }

  async function savePreferences() {
    setPreferenceState("saving");
    const response = await fetch("/api/account/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferences),
    }).catch(() => null);
    if (!response?.ok) {
      setPreferenceState("idle");
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      preferences?: unknown;
    } | null;
    const saved = parseAccountPreferences(body?.preferences ?? preferences);
    setPreferences(saved);
    localStorage.setItem(preferencesKey, JSON.stringify(saved));
    window.dispatchEvent(
      new CustomEvent("peerslot:preferences-change", { detail: saved }),
    );
    setPreferenceState("saved");
    if (saved.language !== locale) {
      const path = window.location.pathname.replace(/^\/(en|tr)(?=\/|$)/, "");
      router.push(`${path || "/"}${window.location.search}`, {
        locale: saved.language,
      });
      return;
    }
    window.setTimeout(() => setPreferenceState("idle"), 1800);
  }

  async function updateImage(file: File | undefined) {
    if (!file || imageState === "saving") return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 2 * 1024 * 1024
    ) {
      setImageState("error");
      return;
    }
    setImageState("saving");
    const token = await fetchAccessToken().catch(() => null);
    if (!token) {
      setImageState("error");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/account/avatar", {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      user?: { image?: string };
    } | null;
    if (response?.ok && body?.user?.image) {
      setImage(body.user.image);
      setImageState("saved");
      return;
    }
    setImageState("error");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordState("error");
      setPasswordError(copy.passwordMismatch);
      return;
    }
    setPasswordState("saving");
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setPasswordState("error");
      setPasswordError(copy.passwordError);
      return;
    }
    setPasswordState("saved");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    window.setTimeout(() => setPasswordState("idle"), 2200);
  }

  const displayName = user?.name || user?.email || copy.title;

  if (!accessToken) {
    return (
      <div className="grid min-h-64 place-items-center rounded-[28px] border border-black/10 bg-[#fbfaf4] text-sm font-semibold text-black/55">
        {copy.title}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="font-display text-3xl leading-tight tracking-[-0.035em] sm:text-4xl">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-black/55">
          {copy.description}
        </p>
      </header>

      <div className="grid items-center gap-5 rounded-[24px] border border-black/10 bg-[#fbfaf4] p-5 sm:p-6 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-[1.15fr_1fr]">
        <section aria-labelledby="profile-picture-title" className="min-w-0">
          <div className="flex items-start gap-4 sm:gap-5">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-black/5 sm:size-20"
                src={image}
              />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-lavender-whisper sm:size-20">
                <UserRound size={28} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2
                id="profile-picture-title"
                className="text-xs font-semibold text-black/50"
              >
                {copy.profilePicture}
              </h2>
              <p className="mt-1 break-words text-lg font-bold tracking-tight sm:text-xl">
                {displayName}
              </p>
              {user?.email ? (
                <p className="mt-1 break-all text-sm text-black/55">
                  {user.email}
                </p>
              ) : null}
              <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-xs font-semibold transition hover:bg-black/5 focus-within:ring-2 focus-within:ring-vast-ink/30">
                {imageState === "saving" ? (
                  <LoaderCircle
                    className="animate-spin"
                    size={15}
                    aria-hidden="true"
                  />
                ) : (
                  <ImagePlus size={15} aria-hidden="true" />
                )}
                {imageState === "saving" ? copy.uploading : copy.chooseImage}
                <input
                  aria-label={copy.chooseImage}
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={imageState === "saving"}
                  onChange={(event) => {
                    void updateImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-black/55">
            {copy.profilePictureHelp}
          </p>
          {imageState === "saved" ? (
            <p
              role="status"
              className="mt-2 text-xs font-semibold text-emerald-700"
            >
              {copy.imageUpdated}
            </p>
          ) : null}
          {imageState === "error" ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
              {copy.imageError}
            </p>
          ) : null}
        </section>
        <AppointmentOfferingSetting
          accessToken={accessToken}
          className="rounded-2xl border-0 bg-lavender-whisper/40 p-5 sm:p-6"
        />
      </div>

      <div className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <section
          aria-labelledby="account-preferences-title"
          className="@container flex min-w-0 flex-col rounded-[24px] border border-black/10 bg-[#fbfaf4] p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-whisper/60">
              <Globe2 size={19} aria-hidden="true" />
            </span>
            <div>
              <h2
                id="account-preferences-title"
                className="text-base font-bold"
              >
                {copy.preferencesTitle}
              </h2>
              <p className="mt-1 text-xs leading-5 text-black/55">
                {copy.preferencesHelp}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-1 flex-col">
            <div className="space-y-4">
              <PreferenceSelect
                ariaLabel={copy.language}
                onChange={(value) =>
                  updatePreference(
                    "language",
                    value as AccountPreferences["language"],
                  )
                }
                value={preferences.language}
              >
                <option value="en">{copy.english}</option>
                <option value="tr">{copy.turkish}</option>
              </PreferenceSelect>
              <div className="grid gap-4 @sm:grid-cols-2">
                <PreferenceSelect
                  ariaLabel={copy.dateFormat}
                  onChange={(value) =>
                    updatePreference(
                      "dateFormat",
                      value as AccountPreferences["dateFormat"],
                    )
                  }
                  value={preferences.dateFormat}
                >
                  <option value="dmy">{copy.dateDmy}</option>
                  <option value="mdy">{copy.dateMdy}</option>
                  <option value="ymd">{copy.dateYmd}</option>
                </PreferenceSelect>
                <PreferenceSelect
                  ariaLabel={copy.timeFormat}
                  onChange={(value) =>
                    updatePreference(
                      "timeFormat",
                      value as AccountPreferences["timeFormat"],
                    )
                  }
                  value={preferences.timeFormat}
                >
                  <option value="24">{copy.time24}</option>
                  <option value="12">{copy.time12}</option>
                </PreferenceSelect>
              </div>
            </div>
            <div className="mt-auto pt-5">
              <Button
                className="min-h-11 w-full rounded-full px-4 text-sm sm:w-auto"
                disabled={preferenceState === "saving"}
                onClick={() => {
                  void savePreferences();
                }}
                type="button"
                variant="outline"
              >
                {preferenceState === "saved" ? (
                  <Check size={15} />
                ) : preferenceState === "saving" ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : null}
                {preferenceState === "saved"
                  ? copy.preferencesSaved
                  : copy.savePreferences}
              </Button>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="account-password-title"
          className="@container flex min-w-0 flex-col rounded-[24px] border border-black/10 bg-[#fbfaf4] p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/5">
              <LockKeyhole size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 id="account-password-title" className="text-base font-bold">
                {copy.changePassword}
              </h2>
              <p className="mt-1 text-xs leading-5 text-black/55">
                {copy.changePasswordHelp}
              </p>
            </div>
          </div>
          <form className="mt-5 flex flex-1 flex-col" onSubmit={changePassword}>
            <div className="space-y-4">
              <PasswordInput
                autoComplete="current-password"
                label={copy.currentPassword}
                onChange={setCurrentPassword}
                value={currentPassword}
              />
              <div className="grid gap-4 @sm:grid-cols-2">
                <PasswordInput
                  label={copy.newPassword}
                  onChange={setNewPassword}
                  value={newPassword}
                />
                <PasswordInput
                  label={copy.confirmPassword}
                  onChange={setConfirmPassword}
                  value={confirmPassword}
                />
              </div>
            </div>
            {passwordError ? (
              <p
                className="mt-3 text-xs font-semibold text-red-700"
                role="alert"
              >
                {passwordError}
              </p>
            ) : null}
            <div className="mt-auto pt-5">
              <Button
                className="min-h-11 w-full rounded-full px-4 text-sm sm:w-auto"
                disabled={passwordState === "saving"}
                type="submit"
              >
                {passwordState === "saving" ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : passwordState === "saved" ? (
                  <Check size={15} />
                ) : null}
                {passwordState === "saving"
                  ? copy.changingPassword
                  : passwordState === "saved"
                    ? copy.passwordChanged
                    : copy.changePasswordAction}
              </Button>
            </div>
          </form>
        </section>
      </div>

      {canHost ? (
        <GoogleMeetSettings
          accessToken={accessToken}
          copy={copy.googleMeet}
          locale={locale}
          className="mt-0 rounded-[24px] p-5 sm:p-6"
        />
      ) : null}
      <AccountDataControls
        accessToken={accessToken}
        className="rounded-[24px] bg-[#fbfaf4] p-5 sm:p-6"
        copy={copy.accountData}
        redirectAfterDelete="/"
      />
    </div>
  );
}

function PasswordInput({
  label,
  onChange,
  value,
  autoComplete = "new-password",
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
  autoComplete?: "current-password" | "new-password";
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label className="text-xs font-semibold text-black/65" htmlFor={id}>
        {label}
      </Label>
      <Input
        id={id}
        aria-label={label}
        autoComplete={autoComplete}
        className="min-h-11 rounded-xl bg-white text-base sm:text-sm"
        onChange={(event) => onChange(event.target.value)}
        required
        type="password"
        value={value}
      />
    </div>
  );
}

function PreferenceSelect({
  ariaLabel,
  children,
  onChange,
  value,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-xs font-semibold text-black/65">
        {ariaLabel}
      </span>
      <span className="relative block">
        <select
          aria-label={ariaLabel}
          className="min-h-11 w-full appearance-none rounded-xl border border-black/10 bg-white ps-3 pe-9 text-base font-medium outline-none transition focus-visible:border-vast-ink focus-visible:ring-2 focus-visible:ring-vast-ink/15 sm:text-sm"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-black/45"
          size={15}
        />
      </span>
    </label>
  );
}

function readPreferences(locale: string): AccountPreferences {
  const defaults: AccountPreferences = {
    ...defaultAccountPreferences,
    language: locale === "tr" ? "tr" : "en",
  };
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(
      localStorage.getItem(preferencesKey) ?? "null",
    ) as Partial<AccountPreferences> | null;
    return parseAccountPreferences({
      language: stored?.language === "tr" ? "tr" : defaults.language,
      dateFormat: stored?.dateFormat ?? defaults.dateFormat,
      timeFormat: stored?.timeFormat ?? defaults.timeFormat,
    });
  } catch {
    return defaults;
  }
}
