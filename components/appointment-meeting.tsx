"use client";

import Image from "next/image";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isGoogleMeetUrl } from "@/lib/google-meet-url";
import type { AppointmentMeetingResult } from "@/lib/google-meet";

export type AppointmentMeetingCopy = {
  join: string;
  opensNewTab: string;
  create: string;
  creating: string;
  connect: string;
  notConfigured: string;
  failed: string;
  unavailable: string;
  retry: string;
};

export function GoogleMeetLogo({
  decorative = false,
}: { decorative?: boolean } = {}) {
  return (
    <Image
      src="/google-meet.png"
      alt={decorative ? "" : "Google Meet"}
      width={20}
      height={20}
      className="size-5 shrink-0"
    />
  );
}

export function JoinMeeting({
  meetingUrl,
  status,
  copy,
}: {
  meetingUrl?: string | null;
  status: string;
  copy: AppointmentMeetingCopy;
}) {
  if (status !== "scheduled" || !isGoogleMeetUrl(meetingUrl)) return null;
  return (
    <Button asChild className="shrink-0 gap-2" variant="outline">
      <a
        href={meetingUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`${copy.join} Google Meet — ${copy.opensNewTab}`}
      >
        <GoogleMeetLogo />
        {copy.join}
        <ExternalLink size={14} aria-hidden="true" />
        <span className="sr-only">{copy.opensNewTab}</span>
      </a>
    </Button>
  );
}

export function ProviderAppointmentMeeting({
  appointmentId,
  meetingUrl,
  status,
  accessToken,
  locale,
  copy,
  onCreated,
}: {
  appointmentId: string;
  meetingUrl?: string | null;
  status: string;
  accessToken: string;
  locale: string;
  copy: AppointmentMeetingCopy;
  onCreated?: () => void;
}) {
  const [result, setResult] = useState<AppointmentMeetingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const url = result?.meetingUrl ?? meetingUrl;
  if (status !== "scheduled") return null;
  if (isGoogleMeetUrl(url))
    return <JoinMeeting meetingUrl={url} status={status} copy={copy} />;

  async function create() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/provider/appointments/${appointmentId}/meeting`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      if (!response.ok) throw new Error("Unable to create meeting");
      const meeting = (await response.json()) as AppointmentMeetingResult;
      setResult(meeting);
      if (meeting.status === "ready") onCreated?.();
    } catch {
      setResult({ status: "failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {result?.status === "not_connected" ? (
        <a
          className="inline-flex items-center gap-2 text-sm font-semibold underline"
          href={`/${locale}/provider/settings`}
        >
          <GoogleMeetLogo />
          {copy.connect}
        </a>
      ) : result?.status === "not_configured" ? (
        <p className="text-sm text-black/60" role="status">
          {copy.notConfigured}
        </p>
      ) : result?.status === "unavailable" || result?.status === "not_found" ? (
        <p className="text-sm text-black/60" role="status">
          {copy.unavailable}
        </p>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={create}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <GoogleMeetLogo />
            )}
            {loading ? copy.creating : result ? copy.retry : copy.create}
          </Button>
          {result?.status === "failed" || result?.status === "creating" ? (
            <p className="text-xs text-black/60" role="status">
              {result.status === "failed" ? copy.failed : copy.creating}
            </p>
          ) : null}
          {result?.status === "failed" ? (
            <a
              className="inline-block text-xs font-semibold underline"
              href={`/${locale}/provider/settings`}
            >
              {copy.connect}
            </a>
          ) : null}
        </>
      )}
    </div>
  );
}
