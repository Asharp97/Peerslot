"use client";

import { Avatar } from "radix-ui";
import { BriefcaseBusiness, Clock3, MapPin, UserRound } from "lucide-react";
import { JoinMeeting } from "@/components/appointment-meeting";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type {
  AgendaAppointment,
  AppointmentStatus,
} from "@/lib/appointment-agenda";
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from "@/lib/appointment-presentation";
import { useAccountPreferences } from "@/lib/account-preferences-client";
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
  const preferences = useAccountPreferences();
  const active =
    appointment.status === "scheduled" || appointment.status === "pending";
  const hosting = appointment.role === "hosting";
  const RoleIcon = hosting ? BriefcaseBusiness : UserRound;
  return (
    <article
      className={`min-w-0 rounded-[24px] border border-black/10 p-5 sm:p-6 ${appointment.status === "cancelled" ? "bg-white/50 text-black/60" : "bg-white"}`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-4">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-semibold text-black/55">
            <time dateTime={appointment.startsAt}>
              {formatAppointmentDate(
                new Date(appointment.startsAt),
                locale,
                timeZone,
                preferences,
              )}
            </time>
          </p>
          <p className="flex items-center gap-2 text-sm font-bold tabular-nums">
            <Clock3
              size={16}
              aria-hidden="true"
              className="shrink-0 text-black/45"
            />
            <bdi>{formatAppointmentTime(appointment, locale, timeZone, preferences)}</bdi>
          </p>
        </div>
        <span
          className={`max-w-32 justify-self-end rounded-full px-3 py-1 text-center text-[10px] font-bold tracking-[0.08em] uppercase sm:max-w-none ${statusColors[appointment.status]}`}
        >
          {copy.statuses[appointment.status]}
        </span>
        <div className="col-span-2 min-w-0">
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
            <div className="min-w-0">
              <h3 className="text-lg font-bold wrap-anywhere">
                <bdi>{appointment.providerName}</bdi>
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-black/60">
                <RoleIcon size={13} className="shrink-0" aria-hidden="true" />
                {copy.roles[appointment.role]}
              </p>
            </div>
          </div>
          {appointment.serviceName ? (
            <p className="mt-3 text-sm text-black/60">{appointment.serviceName}</p>
          ) : null}
        </div>
      </div>
      {appointment.status === "pending" ? (
        <div className="mt-4 space-y-1 text-sm leading-6 text-black/60">
          <p>{hosting ? copy.pendingHostingBody : copy.pendingBody}</p>
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
            {hosting ? (
              <Button asChild variant="outline" className="min-h-11 rounded-full px-4">
                <Link href={appointment.status === "pending" ? "/provider/requests" : "/provider/calendar"}>
                  {appointment.status === "pending" ? copy.reviewRequest : copy.manageHosted}
                </Link>
              </Button>
            ) : null}
            {!hosting && appointment.canReschedule ? (
              <Button
                className="min-h-11 rounded-full px-4"
                variant="outline"
                onClick={() => onAction("reschedule")}
              >
                {copy.reschedule}
              </Button>
            ) : null}
            {!hosting && appointment.canChange ? (
              <Button
                className="min-h-11 rounded-full px-4 text-red-700 hover:bg-red-50"
                variant="ghost"
                onClick={() => onAction("cancel")}
              >
                {copy.cancel}
              </Button>
            ) : null}
          </div>
          {appointment.role === "attending" ? (
            <>
              <p className="text-xs leading-5 text-black/55">
                {appointment.weeklyRescheduleLimit === 0
                  ? copy.reschedulingDisabled
                  : appointment.reschedulesRemaining === 0
                    ? copy.rescheduleLimitReached
                        .replace(
                          "{date}",
                          new Intl.DateTimeFormat(locale, {
                            timeZone: appointment.timeZone,
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(appointment.rescheduleResetsAt)),
                        )
                        .replace("{timeZone}", appointment.timeZone)
                    : copy.weeklyReschedulePolicy
                        .replace(
                          "{remaining}",
                          new Intl.NumberFormat(locale).format(
                            appointment.reschedulesRemaining,
                          ),
                        )
                        .replace(
                          "{limit}",
                          new Intl.NumberFormat(locale).format(
                            appointment.weeklyRescheduleLimit,
                          ),
                        )}
              </p>
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
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
