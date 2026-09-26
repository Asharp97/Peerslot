"use client";

import {
  Check,
  ChevronDown,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AccountDataControls } from "@/components/account-data-controls";
import { GoogleMeetSettings } from "@/components/provider-workspace/google-meet-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
    <div className="space-y-5">
      <header>
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          {copy.label}
        </p>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
          {copy.title}
        </h1>
      </header>
      <div className="rounded-[28px] border border-black/10 bg-[#fbfaf4] p-5 sm:p-8">
        <div className="flex items-center gap-3 border-b border-black/10 pb-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-11 rounded-full object-cover"
              src={image}
            />
          ) : (
            <span className="grid size-11 place-items-center rounded-full bg-lavender-whisper">
              <UserRound size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{displayName}</p>
            {user?.email ? (
              <p className="truncate text-xs text-black/50">{user.email}</p>
            ) : null}
          </div>
        </div>

        <section className="border-b border-black/10 py-4">
          <h2 className="text-sm font-bold">{copy.profilePicture}</h2>
          <p className="mt-1 text-xs leading-5 text-black/55">
            {copy.profilePictureHelp}
          </p>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-bold hover:bg-black/5">
            {imageState === "saving" ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <ImagePlus size={14} />
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
          {imageState === "saved" ? (
            <p
              role="status"
              className="mt-2 text-xs font-semibold text-emerald-700">
              {copy.imageUpdated}
            </p>
          ) : null}
          {imageState === "error" ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
              {copy.imageError}
            </p>
          ) : null}
        </section>

        <AppointmentOfferingSetting accessToken={accessToken} />

        <section className="border-b border-black/10 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <LockKeyhole size={15} /> {copy.changePassword}
          </h2>
          <p className="mt-1 text-xs leading-5 text-black/55">
            {copy.changePasswordHelp}
          </p>
          <form className="mt-3 space-y-2" onSubmit={changePassword}>
            <PasswordInput
              label={copy.currentPassword}
              onChange={setCurrentPassword}
              value={currentPassword}
            />
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
            {passwordError ? (
              <p className="text-xs font-semibold text-red-700" role="alert">
                {passwordError}
              </p>
            ) : null}
            <Button
              className="mt-1 min-h-9 rounded-full text-xs"
              disabled={passwordState === "saving"}
              type="submit">
              {passwordState === "saving" ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : passwordState === "saved" ? (
                <Check size={14} />
              ) : null}
              {passwordState === "saving"
                ? copy.changingPassword
                : passwordState === "saved"
                  ? copy.passwordChanged
                  : copy.changePasswordAction}
            </Button>
          </form>
        </section>

        <section className="border-b border-black/10 py-4">
          <h2 className="text-sm font-bold">{copy.language}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PreferenceSelect
              ariaLabel={copy.language}
              onChange={(value) =>
                updatePreference(
                  "language",
                  value as AccountPreferences["language"],
                )
              }
              value={preferences.language}>
              <option value="en">{copy.english}</option>
              <option value="tr">{copy.turkish}</option>
            </PreferenceSelect>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PreferenceSelect
              ariaLabel={copy.dateFormat}
              onChange={(value) =>
                updatePreference(
                  "dateFormat",
                  value as AccountPreferences["dateFormat"],
                )
              }
              value={preferences.dateFormat}>
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
              value={preferences.timeFormat}>
              <option value="24">{copy.time24}</option>
              <option value="12">{copy.time12}</option>
            </PreferenceSelect>
          </div>
          <Button
            className="mt-3 min-h-9 rounded-full text-xs"
            disabled={preferenceState === "saving"}
            onClick={() => {
              void savePreferences();
            }}
            type="button"
            variant="outline">
            {preferenceState === "saved" ? (
              <Check size={14} />
            ) : preferenceState === "saving" ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : null}
            {preferenceState === "saved"
              ? copy.preferencesSaved
              : preferenceState === "saving"
                ? copy.savePreferences
                : copy.savePreferences}
          </Button>
        </section>

        {canHost ? (
          <div className="border-b border-black/10 py-4">
            <GoogleMeetSettings
              accessToken={accessToken}
              copy={copy.googleMeet}
              locale={locale}
            />
          </div>
        ) : null}
        <AccountDataControls
          accessToken={accessToken}
          className="mt-4 border-0 bg-transparent p-0"
          copy={copy.accountData}
          redirectAfterDelete="/"
        />
      </div>
    </div>
  );
}
function PasswordInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <Label className="sr-only">{label}</Label>
      <Input
        aria-label={label}
        autoComplete="current-password"
        className="min-h-9 rounded-lg bg-white text-xs"
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
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
    <label className="relative block">
      <span className="sr-only">{ariaLabel}</span>
      <select
        aria-label={ariaLabel}
        className={cn(
          "min-h-9 w-full appearance-none rounded-lg border border-black/10 bg-white px-3 pr-8 text-xs font-semibold outline-none focus:border-vast-ink",
        )}
        onChange={(event) => onChange(event.target.value)}
        value={value}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-black/45"
        size={14}
      />
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
