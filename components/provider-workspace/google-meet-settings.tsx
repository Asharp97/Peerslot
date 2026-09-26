"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { GoogleMeetLogo } from "@/components/appointment-meeting";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GoogleMeetSettingsCopy = {
  title: string;
  description: string;
  connect: string;
  reconnect: string;
  disconnect: string;
  connected: string;
  disconnected: string;
  loading: string;
  notConfigured: string;
  error: string;
  connectionError: string;
};

type Connection = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

export function GoogleMeetSettings({
  accessToken,
  locale,
  copy,
  className,
}: {
  accessToken: string;
  locale: string;
  copy: GoogleMeetSettingsCopy;
  className?: string;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/provider/google-meet", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load connection");
        const data = (await response.json()) as Connection;
        if (!cancelled) {
          setConnection(data);
          setError(
            new URLSearchParams(window.location.search).get("meet") === "error"
              ? copy.connectionError
              : "",
          );
        }
      } catch {
        if (!cancelled) setError(copy.error);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, copy.connectionError, copy.error, refreshKey]);

  async function change(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/provider/google-meet", {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(method === "POST" ? { locale } : {}),
      });
      const body = (await response.json()) as { url?: string };
      if (!response.ok) throw new Error("Unable to update connection");
      if (method === "POST") {
        const url = new URL(body.url ?? "");
        if (url.origin !== "https://accounts.google.com")
          throw new Error("Invalid authorization URL");
        window.location.assign(url.toString());
      } else {
        setConnection((current) =>
          current ? { ...current, connected: false, email: null } : current,
        );
      }
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={cn(
        "mt-5 flex flex-col gap-5 rounded-[28px] border border-black/10 bg-[#fbfaf4] p-6 sm:p-8 xl:flex-row xl:items-center xl:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="flex items-center gap-3 text-lg font-bold">
          <GoogleMeetLogo decorative />
          {copy.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
          {copy.description}
        </p>
        {connection ? (
          <p className="mt-2 break-words text-sm font-semibold">
            {!connection.configured
              ? copy.notConfigured
              : connection.connected
                ? copy.connected.replace("{email}", connection.email ?? "")
                : copy.disconnected}
          </p>
        ) : !error ? (
          <p className="mt-3 text-sm">{copy.loading}</p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 empty:hidden">
        {connection?.configured ? (
          <Button
            className="min-h-11 rounded-full px-4"
            type="button"
            disabled={busy}
            onClick={() => change("POST")}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            {connection.connected ? copy.reconnect : copy.connect}
          </Button>
        ) : null}
        {connection?.connected ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full px-4"
            disabled={busy}
            onClick={() => change("DELETE")}
          >
            {copy.disconnect}
          </Button>
        ) : null}
        {!connection && error ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full px-4"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            {copy.reconnect}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
