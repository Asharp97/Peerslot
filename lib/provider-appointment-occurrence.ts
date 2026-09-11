import {
  availabilityRulesOverlap,
  expandAvailabilityRule,
} from "./availability-recurrence";

export type ProviderAppointmentScheduleRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  recurrence: "none" | "weekly";
  recurrenceEndsAt: Date | null;
  exceptionForAppointmentId: string | null;
  exceptionOriginalStartsAt: Date | null;
  deletedAt: Date | null;
  status: "pending" | "scheduled" | "declined" | "cancelled";
  studentName: string;
  [key: string]: unknown;
};

type ProviderAppointmentOccurrence<
  Row extends ProviderAppointmentScheduleRow = ProviderAppointmentScheduleRow,
> = Row & {
  id: string;
  appointmentId: string;
  seriesId: string | null;
  occurrenceStartsAt: Date;
  recurrence: "none" | "weekly";
  isException: boolean;
};

export function expandProviderAppointmentOccurrences<
  Row extends ProviderAppointmentScheduleRow,
>(
  rows: Row[],
  range: { startsAt: Date; endsAt: Date },
  timeZone: string,
): ProviderAppointmentOccurrence<Row>[] {
  const exceptions = new Map<string, Row>();
  const series = new Map<string, Row>();

  for (const row of rows) {
    if (row.exceptionForAppointmentId && row.exceptionOriginalStartsAt) {
      exceptions.set(
        exceptionKey(
          row.exceptionForAppointmentId,
          row.exceptionOriginalStartsAt,
        ),
        row,
      );
    } else if (row.recurrence === "weekly") {
      series.set(row.id, row);
    }
  }

  const result: ProviderAppointmentOccurrence<Row>[] = [];

  for (const row of rows) {
    if (row.exceptionForAppointmentId) continue;
    if (row.deletedAt) continue;

    if (row.recurrence === "none") {
      if (rangesOverlap(row, range)) {
        result.push(
          presentOccurrence(row, row.startsAt, row.endsAt, null, false),
        );
      }
      continue;
    }

    const recurrenceRange = row.recurrenceEndsAt
      ? {
          startsAt: range.startsAt,
          endsAt: new Date(
            Math.min(range.endsAt.getTime(), row.recurrenceEndsAt.getTime()),
          ),
        }
      : range;
    if (recurrenceRange.endsAt <= recurrenceRange.startsAt) continue;

    const occurrences = expandAvailabilityRule(
      { ...row, isActive: true },
      recurrenceRange,
      timeZone,
    );

    for (const occurrence of occurrences) {
      if (exceptions.has(exceptionKey(row.id, occurrence.startsAt))) continue;
      result.push(
        presentOccurrence(
          row,
          occurrence.startsAt,
          occurrence.endsAt,
          row.id,
          false,
        ),
      );
    }
  }

  for (const row of rows) {
    if (!row.exceptionForAppointmentId || !row.exceptionOriginalStartsAt) {
      continue;
    }
    if (row.deletedAt) continue;
    if (!rangesOverlap(row, range)) continue;

    result.push({
      ...row,
      id: `${row.id}:${row.exceptionOriginalStartsAt.toISOString()}`,
      appointmentId: row.id,
      seriesId: row.exceptionForAppointmentId,
      occurrenceStartsAt: row.exceptionOriginalStartsAt,
      recurrence: series.has(row.exceptionForAppointmentId) ? "weekly" : "none",
      isException: true,
    });
  }

  return result.sort(
    (first, second) => first.startsAt.getTime() - second.startsAt.getTime(),
  );
}

export function findAppointmentConflictInRows<
  Row extends ProviderAppointmentScheduleRow,
>(
  rows: Row[],
  candidate: {
    startsAt: Date;
    endsAt: Date;
    recurrence: "none" | "weekly";
  },
  timeZone: string,
  exclusions: {
    excludedAppointmentId?: string;
    excludedSeriesId?: string;
    excludedOccurrence?: { appointmentId: string; startsAt: Date };
  } = {},
) {
  const scheduledRows = rows.filter(
    ({ deletedAt, status }) =>
      (status === "scheduled" || status === "pending") && !deletedAt,
  );

  if (candidate.recurrence === "weekly") {
    return scheduledRows.find((row) => {
      if (row.id === exclusions.excludedAppointmentId) return false;
      if (
        row.id === exclusions.excludedSeriesId ||
        row.exceptionForAppointmentId === exclusions.excludedSeriesId
      ) {
        return false;
      }
      if (
        row.recurrence === "weekly" &&
        row.recurrenceEndsAt &&
        row.recurrenceEndsAt <= candidate.startsAt
      ) {
        return false;
      }
      if (row.recurrence === "weekly" && row.recurrenceEndsAt) {
        const comparisonRange = {
          startsAt: candidate.startsAt,
          endsAt: row.recurrenceEndsAt,
        };
        const candidateOccurrences = expandAvailabilityRule(
          { ...candidate, id: "candidate", isActive: true },
          comparisonRange,
          timeZone,
        );
        const rowOccurrences = expandProviderAppointmentOccurrences(
          rows.filter(
            (entry) =>
              entry.id === row.id || entry.exceptionForAppointmentId === row.id,
          ),
          comparisonRange,
          timeZone,
        ).filter(
          (occurrence) =>
            occurrence.status === "scheduled" ||
            occurrence.status === "pending",
        );
        return candidateOccurrences.some((candidateOccurrence) =>
          rowOccurrences.some((rowOccurrence) =>
            rangesOverlap(candidateOccurrence, rowOccurrence),
          ),
        );
      }
      return availabilityRulesOverlap(
        candidate,
        {
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          recurrence: row.exceptionForAppointmentId ? "none" : row.recurrence,
        },
        timeZone,
      );
    });
  }

  return expandProviderAppointmentOccurrences(rows, candidate, timeZone).find(
    (occurrence) => {
      if (
        occurrence.status !== "scheduled" &&
        occurrence.status !== "pending"
      ) {
        return false;
      }
      if (occurrence.appointmentId === exclusions.excludedAppointmentId) {
        return false;
      }
      if (
        exclusions.excludedOccurrence &&
        occurrence.appointmentId ===
          exclusions.excludedOccurrence.appointmentId &&
        occurrence.occurrenceStartsAt.getTime() ===
          exclusions.excludedOccurrence.startsAt.getTime()
      ) {
        return false;
      }
      return rangesOverlap(candidate, occurrence);
    },
  );
}

function presentOccurrence<Row extends ProviderAppointmentScheduleRow>(
  row: Row,
  startsAt: Date,
  endsAt: Date,
  seriesId: string | null,
  isException: boolean,
): ProviderAppointmentOccurrence<Row> {
  return {
    ...row,
    id:
      row.recurrence === "weekly"
        ? `${row.id}:${startsAt.toISOString()}`
        : row.id,
    appointmentId: row.id,
    seriesId,
    startsAt,
    endsAt,
    occurrenceStartsAt: startsAt,
    recurrence: row.recurrence,
    isException,
  };
}

function exceptionKey(appointmentId: string, startsAt: Date) {
  return `${appointmentId}:${startsAt.toISOString()}`;
}

function rangesOverlap(
  first: { startsAt: Date; endsAt: Date },
  second: { startsAt: Date; endsAt: Date },
) {
  return first.startsAt < second.endsAt && first.endsAt > second.startsAt;
}
