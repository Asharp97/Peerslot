import { z } from "zod";
import { timestampWithOffsetSchema } from "@/lib/date-schema";
import {
  expandProviderAppointmentOccurrences,
  type ProviderAppointmentScheduleRow,
} from "@/lib/provider-appointment-occurrence";

export type AppointmentView = "upcoming" | "past";
export type AppointmentStatus =
  "pending" | "scheduled" | "completed" | "cancelled" | "declined" | "expired";
export type AgendaAppointment = {
  id: string;
  occurrenceStartsAt: string;
  startsAt: string;
  endsAt: string;
  providerName: string;
  providerAvatar: string | null;
  serviceName?: string | null;
  location?: string | null;
  status: AppointmentStatus;
  meetingUrl: string | null;
  timeZone: string;
  minimumNoticeHours: number;
  canChange: boolean;
  canReschedule: boolean;
  weeklyRescheduleLimit: number;
  reschedulesRemaining: number;
  rescheduleResetsAt: string;
};
export type AppointmentAgendaPage = {
  appointments: AgendaAppointment[];
  nextCursor: string | null;
};

const cursorSchema = z
  .object({
    startsAt: timestampWithOffsetSchema,
    id: z.string().uuid(),
    occurrenceStartsAt: timestampWithOffsetSchema,
  })
  .strict();
export const appointmentAgendaQuerySchema = z.object({
  view: z.enum(["upcoming", "past"]),
  cursor: z
    .string()
    .max(300)
    .transform((value, context) => {
      try {
        const parsed = cursorSchema.safeParse(JSON.parse(value));
        if (parsed.success) return parsed.data;
      } catch {
        /* Invalid cursors must not reach recurrence expansion. */
      }
      context.addIssue({
        code: "custom",
        message: "Invalid appointment cursor",
      });
      return z.NEVER;
    })
    .optional(),
});
export type AppointmentAgendaQuery = z.infer<
  typeof appointmentAgendaQuerySchema
>;

const pageSize = 20;
const week = 7 * 86_400_000;

export function appointmentDisplayStatus(
  appointment: {
    status: ProviderAppointmentScheduleRow["status"];
    endsAt: Date;
  },
  now: Date,
): AppointmentStatus {
  if (appointment.endsAt <= now) {
    if (appointment.status === "scheduled") return "completed";
    if (appointment.status === "pending") return "expired";
  }
  return appointment.status;
}

// Bound each weekly series independently, so a distant booking or an old ended
// series remains reachable without expanding years of occurrences on every read.
// Exceptions (including deleted/unowned ones) still suppress their original slot.
export function paginateAppointmentOccurrences<
  Row extends ProviderAppointmentScheduleRow & {
    owned: boolean;
    page: { timeZone: string };
    updatedAt?: Date;
  },
>(rows: Row[], query: AppointmentAgendaQuery, now: Date) {
  const candidates = rows
    .flatMap((row) => {
      if (!row.owned || row.deletedAt) return [];
      const isWeekly =
        row.recurrence === "weekly" && !row.exceptionForAppointmentId;
      const exceptions = isWeekly
        ? rows.filter((entry) => entry.exceptionForAppointmentId === row.id)
        : [];
      let range = { startsAt: row.startsAt, endsAt: row.endsAt };
      if (isWeekly) {
        const active = row.status === "pending" || row.status === "scheduled";
        if (query.view === "upcoming" && !active) return [];
        // Allow room for suppressed occurrences and DST shifts around the boundary.
        const span = (pageSize + exceptions.length + 3) * week;
        const duration = row.endsAt.getTime() - row.startsAt.getTime();
        if (query.view === "upcoming") {
          const anchor = Math.max(
            row.startsAt.getTime(),
            query.cursor
              ? Date.parse(query.cursor.startsAt)
              : now.getTime() - duration,
          );
          range = {
            startsAt: new Date(anchor),
            endsAt: new Date(anchor + span),
          };
        } else {
          // An entirely cancelled/declined series has no infinite future history.
          const end = active
            ? now.getTime()
            : Math.max(
                (row.updatedAt ?? now).getTime(),
                row.startsAt.getTime() + 1,
              );
          const anchor = Math.min(
            end,
            row.recurrenceEndsAt?.getTime() ?? Infinity,
            query.cursor ? Date.parse(query.cursor.startsAt) + 1 : Infinity,
          );
          range = {
            startsAt: new Date(anchor - span),
            endsAt: new Date(anchor),
          };
        }
      }
      return expandProviderAppointmentOccurrences(
        [row, ...exceptions],
        range,
        row.page.timeZone,
      ).filter((occurrence) => occurrence.appointmentId === row.id);
    })
    .filter((row) => {
      const status = appointmentDisplayStatus(row, now);
      const upcoming = status === "scheduled" || status === "pending";
      if (upcoming !== (query.view === "upcoming")) return false;
      if (!query.cursor) return true;
      const comparison = compareOccurrence(row, query.cursor);
      return query.view === "upcoming" ? comparison > 0 : comparison < 0;
    })
    .sort(
      (a, b) =>
        (query.view === "upcoming" ? 1 : -1) *
        compareOccurrence(a, {
          startsAt: b.startsAt.toISOString(),
          id: b.appointmentId,
          occurrenceStartsAt: b.occurrenceStartsAt.toISOString(),
        }),
    );
  const appointments = candidates.slice(0, pageSize);
  const last = appointments.at(-1);
  return {
    appointments,
    nextCursor:
      candidates.length > pageSize && last
        ? JSON.stringify({
            startsAt: last.startsAt.toISOString(),
            id: last.appointmentId,
            occurrenceStartsAt: last.occurrenceStartsAt.toISOString(),
          })
        : null,
  };
}

function compareOccurrence(
  row: { startsAt: Date; appointmentId: string; occurrenceStartsAt: Date },
  cursor: z.infer<typeof cursorSchema>,
) {
  return (
    row.startsAt.getTime() - Date.parse(cursor.startsAt) ||
    row.appointmentId.localeCompare(cursor.id) ||
    row.occurrenceStartsAt.getTime() - Date.parse(cursor.occurrenceStartsAt)
  );
}
