"use client";

import { useEffect, useRef, useState } from "react";
import { Tabs } from "radix-ui";
import { Button } from "@/components/ui/button";
import type {
  AgendaAppointment,
  AppointmentAgendaPage,
  AppointmentView,
} from "@/lib/appointment-agenda";
import {
  appointmentDirection,
  groupAppointmentsByDate,
} from "@/lib/appointment-presentation";
import { AppointmentCard } from "./appointment-card";
import {
  AppointmentActionDialog,
  type AppointmentAction,
} from "./appointment-action-dialog";
import {
  AppointmentsEmptyState,
  AppointmentsSkeleton,
} from "./appointments-states";
import type { AppointmentsCopy } from "./copy";
export type { AppointmentsCopy } from "./copy";

type Props = { accessToken: string; locale: string; copy: AppointmentsCopy };

export function AppointmentAgenda(props: Props) {
  const [view, setView] = useState<AppointmentView>("upcoming");
  return (
    <Tabs.Root
      value={view}
      onValueChange={(value) => setView(value as AppointmentView)}
      dir={appointmentDirection(props.locale)}
      className="mt-8 min-w-0"
    >
      <Tabs.List
        aria-label={props.copy.views}
        className="inline-flex max-w-full gap-1 rounded-full border border-black/10 bg-white p-1"
      >
        {(["upcoming", "past"] as const).map((tab) => (
          <Tabs.Trigger
            key={tab}
            value={tab}
            className="min-h-11 min-w-24 rounded-full px-5 text-sm font-bold transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vast-ink data-[state=active]:bg-vast-ink data-[state=active]:text-white"
          >
            {props.copy[tab]}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content
        value={view}
        className="mt-6 outline-none focus-visible:ring-2 focus-visible:ring-vast-ink"
      >
        <AgendaList key={view} {...props} view={view} />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function AgendaList({
  accessToken,
  locale,
  copy,
  view,
}: Props & { view: AppointmentView }) {
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [request, setRequest] = useState({
    cursor: null as string | null,
    revision: 0,
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [success, setSuccess] = useState("");
  const [selection, setSelection] = useState<{
    appointment: AgendaAppointment;
    action: AppointmentAction;
  } | null>(null);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setFailed(false);
      try {
        const query = new URLSearchParams({
          view,
          ...(request.cursor ? { cursor: request.cursor } : {}),
        });
        const response = await fetch(`/api/account/appointments?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("appointments");
        const body = (await response.json()) as AppointmentAgendaPage;
        if (controller.signal.aborted) return;
        setAppointments((current) => {
          if (!request.cursor) return body.appointments;
          const combined = new Map(
            [...current, ...body.appointments].map((appointment) => [
              `${appointment.id}:${appointment.occurrenceStartsAt}`,
              appointment,
            ]),
          );
          return [...combined.values()];
        });
        setNextCursor(body.nextCursor);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [accessToken, view, request]);

  useEffect(() => {
    // Refresh stale eligibility/status when returning to the page or leaving it open.
    // Do not reset a paginated list while somebody is reading its later entries.
    if (selection || request.cursor) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        setRequest((current) => ({
          cursor: null,
          revision: current.revision + 1,
        }));
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [selection, request.cursor]);

  const groups = groupAppointmentsByDate(
    appointments,
    view,
    locale,
    timeZone,
    copy,
  );
  return (
    <>
      <p className="mb-5 text-xs text-black/55">
        {copy.timeZone.replace("{timeZone}", timeZone)}
      </p>
      {success ? (
        <p
          role="status"
          className="mb-4 rounded-2xl bg-forest-ink/10 p-4 text-sm font-semibold text-forest-ink"
        >
          {success}
        </p>
      ) : null}
      {loading && !appointments.length ? (
        <AppointmentsSkeleton label={copy.loading} />
      ) : null}
      {failed ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p role="alert" className="text-sm text-red-700">
            {copy.loadError}
          </p>
          <Button
            variant="outline"
            className="mt-3 min-h-11 rounded-full"
            onClick={() =>
              setRequest((current) => ({
                ...current,
                revision: current.revision + 1,
              }))
            }
          >
            {copy.retry}
          </Button>
        </div>
      ) : null}
      {!loading && !failed && !appointments.length ? (
        <AppointmentsEmptyState view={view} copy={copy} />
      ) : null}
      <div className="space-y-8">
        {groups.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`agenda-${view}-${group.key}`}
          >
            <h2
              id={`agenda-${view}-${group.key}`}
              className="mb-3 text-sm font-bold capitalize"
            >
              {group.label}
            </h2>
            <ul className="space-y-3">
              {group.appointments.map((appointment) => (
                <li key={`${appointment.id}:${appointment.occurrenceStartsAt}`}>
                  <AppointmentCard
                    appointment={appointment}
                    locale={locale}
                    timeZone={timeZone}
                    copy={copy}
                    onAction={(action) => {
                      actionTrigger.current =
                        document.activeElement as HTMLElement;
                      setSuccess("");
                      setSelection({ appointment, action });
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {nextCursor ? (
        <Button
          variant="outline"
          className="mt-6 min-h-11 w-full rounded-full sm:w-auto"
          disabled={loading}
          onClick={() =>
            setRequest((current) => ({
              cursor: nextCursor,
              revision: current.revision + 1,
            }))
          }
        >
          {loading ? copy.loading : copy.loadMore}
        </Button>
      ) : null}
      {selection ? (
        <AppointmentActionDialog
          {...selection}
          accessToken={accessToken}
          locale={locale}
          copy={copy}
          onClose={() => setSelection(null)}
          returnFocus={() => actionTrigger.current?.focus()}
          onSaved={() => {
            setSuccess(
              selection.action === "cancel"
                ? copy.cancelSuccess
                : copy.rescheduleSuccess,
            );
            setSelection(null);
            setRequest((current) => ({
              cursor: null,
              revision: current.revision + 1,
            }));
          }}
        />
      ) : null}
    </>
  );
}
