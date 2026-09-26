"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
import { fetchWithAccessToken } from "@/lib/auth-browser";

export function AppointmentOfferingSetting({
  accessToken,
}: {
  accessToken: string;
}) {
  const t = useTranslations("AppointmentOffering");
  const router = useRouter();
  const [offering, setOffering] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<
    "load" | "save" | "pending_requests" | null
  >(null);
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (savingRef.current) return;
      const version = ++requestVersion.current;
      try {
        const response = await fetchWithAccessToken(
          "/api/provider",
          accessToken,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!cancelled && version === requestVersion.current) {
          setOffering(body.offersAppointments);
          setError(null);
        }
      } catch {
        if (!cancelled && version === requestVersion.current) setError("load");
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [accessToken, retry]);

  async function change(next: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    requestVersion.current += 1;
    setSaving(true);
    setError(null);
    try {
      const response = await fetchWithAccessToken(
        "/api/account/appointment-offering",
        accessToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offersAppointments: next }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.code === "pending_requests" ? "pending_requests" : "save",
        );
        return;
      }
      setOffering(body.offersAppointments);
      window.dispatchEvent(new Event("peerslot:offering-change"));
      if (body.setupRequired) router.push("/auth/provider");
    } catch {
      setError("save");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="border-b border-black/10 py-5" aria-busy={saving}>
      <div className="flex items-center justify-between gap-6">
        <div>
          <label htmlFor="offers-appointments" className="text-sm font-bold">
            {t("label")}
          </label>
          <p
            id="offering-hint"
            className="mt-1 text-xs leading-5 text-black/55"
          >
            {t("hint")}
          </p>
        </div>
        <Switch
          id="offers-appointments"
          aria-describedby="offering-hint offering-effect"
          checked={offering === true}
          disabled={offering === null || saving}
          onCheckedChange={(next) => {
            void change(next);
          }}
        />
      </div>
      {error ? (
        <div role="alert" className="mt-3 text-xs font-semibold text-red-700">
          <p>{t(error)}</p>
          {error === "pending_requests" ? (
            <Link
              href="/provider/requests"
              className="mt-2 inline-block underline"
            >
              {t("review")}
            </Link>
          ) : null}
          {error === "load" ? (
            <button
              type="button"
              className="mt-2 underline"
              onClick={() => setRetry((value) => value + 1)}
            >
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
