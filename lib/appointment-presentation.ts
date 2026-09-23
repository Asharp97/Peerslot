import type {
  AgendaAppointment,
  AppointmentView,
} from "@/lib/appointment-agenda";
import { formatInTimeZone } from "@/lib/availability-window";
import type { AccountPreferences } from "@/lib/account-preferences";

export function groupAppointmentsByDate(
  appointments: AgendaAppointment[],
  view: AppointmentView,
  locale: string,
  timeZone: string,
  copy: { today: string; tomorrow: string },
  now = new Date(),
) {
  const today = formatInTimeZone(now, timeZone).slice(0, 10);
  // Advance the local calendar date, not the instant, so DST days work too.
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);
  const groups = new Map<
    string,
    { key: string; label: string; appointments: AgendaAppointment[] }
  >();
  const sorted = [...appointments].sort(
    (a, b) =>
      (Date.parse(a.startsAt) - Date.parse(b.startsAt)) *
      (view === "upcoming" ? 1 : -1),
  );
  for (const appointment of sorted) {
    const date = new Date(appointment.startsAt);
    const key = formatInTimeZone(date, timeZone).slice(0, 10);
    const label =
      key === today
        ? copy.today
        : key === tomorrowKey
          ? copy.tomorrow
          : new Intl.DateTimeFormat(locale, {
              timeZone,
              weekday: "long",
              day: "numeric",
              month: "long",
              ...(key.slice(0, 4) !== today.slice(0, 4)
                ? { year: "numeric" as const }
                : {}),
            }).format(date);
    const group = groups.get(key) ?? { key, label, appointments: [] };
    group.appointments.push(appointment);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function formatAppointmentTime(
  appointment: Pick<AgendaAppointment, "startsAt" | "endsAt">,
  locale: string,
  timeZone: string,
  preferences?: Pick<AccountPreferences, "timeFormat">,
) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const sameDay =
    formatInTimeZone(start, timeZone).slice(0, 10) ===
    formatInTimeZone(end, timeZone).slice(0, 10);
  const format = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    ...(preferences ? { hour12: preferences.timeFormat === "12" } : {}),
    ...(!sameDay ? { month: "short" as const, day: "numeric" as const } : {}),
  });
  return `${format.format(start)} – ${format.format(end)}`;
}

export function formatAppointmentDate(
  value: Date,
  locale: string,
  timeZone: string,
  preferences?: Pick<AccountPreferences, "dateFormat">,
) {
  if (!preferences) {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "long",
    }).format(value);
  }

  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value: part }) => [type, part]),
  );
  if (preferences.dateFormat === "ymd") return `${values.year}-${values.month}-${values.day}`;
  if (preferences.dateFormat === "mdy") return `${values.month}/${values.day}/${values.year}`;
  return `${values.day}/${values.month}/${values.year}`;
}

export function appointmentDirection(locale: string): "rtl" | "ltr" {
  return /^(ar|fa|he|ur)(-|$)/i.test(locale) ? "rtl" : "ltr";
}
