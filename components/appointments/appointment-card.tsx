"use client";

import { Avatar } from "radix-ui";
import { Clock3, MapPin } from "lucide-react";
import { JoinMeeting } from "@/components/appointment-meeting";
import { Button } from "@/components/ui/button";
import type {
  AgendaAppointment,
  AppointmentStatus,
} from "@/lib/appointment-agenda";
import { formatAppointmentTime } from "@/lib/appointment-presentation";
import type { AppointmentsCopy } from "./copy";

const statusColors: Record<AppointmentStatus, string> = {
  pending: "bg-ember-glow/20 text-vast-ink",
  scheduled: "bg-lavender-whisper text-vast-ink",
  completed: "bg-forest-ink/10 text-forest-ink",
  cancelled: "bg-black/5 text-black/60",
  declined: "bg-red-50 text-red-700",
  expired: "bg-black/5 text-black/60",
};

export function AppointmentCard({
  appointment,
  locale,
  timeZone,
  copy,
  onAction,
}: {
  appointment: AgendaAppointment;
  locale: string;
  timeZone: string;
  copy: AppointmentsCopy;
  onAction: (action: "cancel" | "reschedule") => void;
}) {
  const active =
    appointment.status === "scheduled" || appointment.status === "pending";
  return (
    <article
      className={`min-w-0 rounded-[24px] border border-black/10 p-5 sm:p-6 ${appointment.status === "cancelled" ? "bg-white/50 text-black/60" : "bg-white"}`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <p className="text-xs font-semibold text-black/55">
            <time dateTime={appointment.startsAt}>
              {new Intl.DateTimeFormat(locale, {
                timeZone,
                dateStyle: "long",
              }).format(new Date(appointment.startsAt))}
            </time>
          </p>
          <p className="flex items-center gap-2 text-sm font-bold tabular-nums">
            <Clock3
              size={16}
              aria-hidden="true"
              className="shrink-0 text-black/45"
            />
            <bdi>{formatAppointmentTime(appointment, locale, timeZone)}</bdi>
          </p>
          <div className="flex items-center gap-3">
            <Avatar.Root className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-lavender-whisper text-sm font-bold text-vast-ink">
              {appointment.providerAvatar ? (
                <Avatar.Image
                  src={appointment.providerAvatar}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <Avatar.Fallback aria-hidden="true">
                {appointment.providerName
                  .trim()
                  .slice(0, 1)
                  .toLocaleUpperCase(locale)}
              </Avatar.Fallback>
            </Avatar.Root>
            <h3 className="min-w-0 text-lg font-bold wrap-anywhere">
              <bdi>{appointment.providerName}</bdi>
            </h3>
          </div>
          {appointment.serviceName ? (
            <p className="text-sm text-black/60">{appointment.serviceName}</p>
          ) : null}
        </div>
        <span
          className={`self-start rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.08em] uppercase ${statusColors[appointment.status]}`}
        >
          {copy.statuses[appointment.status]}
        </span>
      </div>
      {appointment.status === "pending" ? (
        <div className="mt-4 space-y-1 text-sm leading-6 text-black/60">
          <p>{copy.pendingBody}</p>
          <p>{copy.pendingMeeting}</p>
        </div>
      ) : appointment.location ? (
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-black/60">
          <MapPin size={16} className="mt-1 shrink-0" aria-hidden="true" />
          <span className="wrap-anywhere">{appointment.location}</span>
        </p>
      ) : null}
      {active ? (
        <div className="mt-5 space-y-3 border-t border-black/8 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap [&_a]:min-h-11 [&_a]:rounded-full [&_a]:px-4">
            {!appointment.location ? (
              <JoinMeeting
                meetingUrl={appointment.meetingUrl}
                status={appointment.status}
                copy={copy.meeting}
              />
            ) : null}
            {appointment.canReschedule ? (
              <Button
                className="min-h-11 rounded-full px-4"
                variant="outline"
                onClick={() => onAction("reschedule")}
              >
                {copy.reschedule}
              </Button>
            ) : null}
            {appointment.canChange ? (
              <Button
                className="min-h-11 rounded-full px-4 text-red-700 hover:bg-red-50"
                variant="ghost"
                onClick={() => onAction("cancel")}
              >
                {copy.cancel}
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-black/55">
            {appointment.canChange
              ? copy.notice.replace(
                  "{hours}",
                  new Intl.NumberFormat(locale).format(
                    appointment.minimumNoticeHours,
                  ),
                )
              : copy.locked}
          </p>
        </div>
      ) : null}
    </article>
  );
}
