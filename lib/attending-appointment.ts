import type { EventInput } from "@fullcalendar/core";
import { formatInTimeZone } from "@/lib/availability-window";

export type AttendingAppointment = {
  id: string;
  occurrenceStartsAt: string;
  startsAt: string;
  endsAt: string;
  providerName: string;
  meetingUrl?: string | null;
  timeZone: string;
  status: "pending" | "scheduled";
  recurrence?: "none" | "weekly";
  minimumNoticeHours: number;
  canChange: boolean;
  canReschedule: boolean;
};

export function attendingAppointmentToEvent(
  appointment: AttendingAppointment,
  labels: { withTeacher: string; pending: string; scheduled: string },
  timeZone?: string,
): EventInput {
  return {
    id: `attending:${appointment.id}:${appointment.occurrenceStartsAt}`,
    title: `${labels.withTeacher.replace("{name}", appointment.providerName)} · ${labels[appointment.status]}`,
    start: timeZone
      ? formatInTimeZone(new Date(appointment.startsAt), timeZone)
      : appointment.startsAt,
    end: timeZone
      ? formatInTimeZone(new Date(appointment.endsAt), timeZone)
      : appointment.endsAt,
    allDay: false,
    editable: false,
    startEditable: false,
    durationEditable: false,
    backgroundColor: appointment.status === "pending" ? "#eff6ff" : "#dbeafe",
    borderColor: "#2563eb",
    textColor: "#1e3a8a",
    classNames: ["attending-appointment"],
    extendedProps: { attendingAppointment: appointment },
  };
}
