"use client";

import { Check, Clock3, Inbox, LoaderCircle, Mail, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { useProviderWorkspace } from "./provider-shell";

type AppointmentRequest = {
  id: string;
  studentName: string;
  studentEmail: string | null;
  startsAt: string;
  endsAt: string;
  comment: string | null;
};

export type ProviderAppointmentRequestsCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  pending: string;
  accept: string;
  decline: string;
  accepting: string;
  declining: string;
  emptyTitle: string;
  emptyBody: string;
  loadError: string;
  reviewError: string;
  comment: string;
};

export function ProviderAppointmentRequests({
  copy,
}: {
  copy: ProviderAppointmentRequestsCopy;
}) {
  const locale = useLocale();
  const { accessToken, data } = useProviderWorkspace();
  const [appointments, setAppointments] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<{
    id: string;
    decision: "accept" | "decline";
  } | null>(null);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/provider/appointment-requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(copy.loadError);
      const body = (await response.json()) as {
        appointments: AppointmentRequest[];
      };
      setAppointments(body.appointments);
      setError("");
    } catch {
      setError(copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [accessToken, copy.loadError]);

  useEffect(() => {
    async function initialize() {
      await loadAppointments();
    }

    void initialize();
  }, [loadAppointments]);

  async function review(
    appointmentId: string,
    decision: "accept" | "decline",
  ) {
    setReviewing({ id: appointmentId, decision });
    setError("");
    try {
      const response = await fetch(
        `/api/provider/appointment-requests/${appointmentId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) throw new Error(copy.reviewError);
      setAppointments((current) =>
        current.filter(({ id }) => id !== appointmentId),
      );
    } catch {
      setError(copy.reviewError);
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-[-0.04em] sm:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-4 text-sm leading-6 text-black/55 sm:text-base">
          {copy.intro}
        </p>
      </section>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-8 space-y-3" aria-busy={loading}>
        {loading ? (
          <div className="grid min-h-52 place-items-center rounded-[28px] border border-black/10 bg-[#fbfaf4]">
            <LoaderCircle className="animate-spin text-black/40" size={24} />
          </div>
        ) : appointments.length ? (
          appointments.map((appointment) => {
            const isAccepting =
              reviewing?.id === appointment.id &&
              reviewing.decision === "accept";
            const isDeclining =
              reviewing?.id === appointment.id &&
              reviewing.decision === "decline";

            return (
              <article
                className="grid gap-5 rounded-[24px] border border-black/10 bg-[#fbfaf4] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
                key={appointment.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-ember-glow/20 px-3 py-1 text-[10px] font-bold tracking-[0.1em] uppercase">
                      {copy.pending}
                    </span>
                    <h2 className="truncate text-lg font-bold">
                      {appointment.studentName}
                    </h2>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-black/60">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <Clock3 size={15} />
                      {formatRequestTime(
                        appointment,
                        locale,
                        data.bookingPage.timeZone,
                      )}
                    </span>
                    {appointment.studentEmail ? (
                      <span className="inline-flex items-center gap-2">
                        <Mail size={15} /> {appointment.studentEmail}
                      </span>
                    ) : null}
                  </div>
                  {appointment.comment ? (
                    <p className="mt-3 text-sm leading-6 text-black/55">
                      <span className="font-bold text-vast-ink">
                        {copy.comment}: {" "}
                      </span>
                      {appointment.comment}
                    </p>
                  ) : null}
                </div>

                <div className="flex gap-2 sm:justify-end">
                  <Button
                    className="h-10 rounded-full border-red-200 px-4 text-red-700 hover:bg-red-50"
                    disabled={reviewing !== null}
                    onClick={() => review(appointment.id, "decline")}
                    variant="outline"
                  >
                    {isDeclining ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <X />
                    )}
                    {isDeclining ? copy.declining : copy.decline}
                  </Button>
                  <Button
                    className="h-10 rounded-full bg-forest-ink px-4 text-white hover:bg-forest-ink/85"
                    disabled={reviewing !== null}
                    onClick={() => review(appointment.id, "accept")}
                  >
                    {isAccepting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Check />
                    )}
                    {isAccepting ? copy.accepting : copy.accept}
                  </Button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="grid min-h-64 place-items-center rounded-[28px] border-2 border-dashed border-black/10 bg-[#fbfaf4] p-8 text-center">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-lavender-whisper">
                <Inbox size={20} />
              </span>
              <h2 className="mt-4 text-lg font-bold">{copy.emptyTitle}</h2>
              <p className="mt-2 text-sm text-black/50">{copy.emptyBody}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function formatRequestTime(
  appointment: Pick<AppointmentRequest, "startsAt" | "endsAt">,
  locale: string,
  timeZone: string,
) {
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(appointment.startsAt));
  const end = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(appointment.endsAt));
  return `${date}–${end}`;
}
