import {
  expandProviderAppointmentOccurrences,
  type ProviderAppointmentScheduleRow,
} from "@/lib/provider-appointment-occurrence";
import type { PublicAppointmentIdentity } from "@/lib/public-appointment-request-schema";

export type PublicAppointmentPolicyCode =
  "past" | "minimum_notice" | "upcoming_appointment";

export class PublicAppointmentPolicyError extends Error {
  constructor(
    public code: PublicAppointmentPolicyCode,
    public minimumNoticeHours?: number,
  ) {
    const notice = `${minimumNoticeHours} ${minimumNoticeHours === 1 ? "hour" : "hours"}`;
    super(
      code === "past"
        ? "This appointment time has already passed. Choose a future date and time."
        : code === "minimum_notice"
          ? `Choose a time at least ${notice} from now.`
          : `You have an appointment with this provider in less than ${notice}. Please wait until it starts before booking another.`,
    );
    this.name = "PublicAppointmentPolicyError";
  }
}

export function assertStudentCanBookWithProvider(
  rows: (ProviderAppointmentScheduleRow & {
    studentId?: string | null;
    studentEmail?: string | null;
  })[],
  identity: Pick<PublicAppointmentIdentity, "studentId" | "studentEmail">,
  page: { minimumNoticeHours: number; timeZone: string },
  now: Date,
) {
  if (page.minimumNoticeHours <= 0) return;
  const cutoff = new Date(now.getTime() + page.minimumNoticeHours * 3_600_000);
  const email = identity.studentEmail.trim().toLowerCase();
  // Rows are scoped to this provider. Expand before matching identity so even
  // exception markers without student details suppress their original slots.
  const upcoming = expandProviderAppointmentOccurrences(
    rows,
    { startsAt: now, endsAt: cutoff },
    page.timeZone,
  ).some(
    (appointment) =>
      (appointment.status === "scheduled" ||
        appointment.status === "pending") &&
      appointment.startsAt >= now &&
      appointment.startsAt < cutoff &&
      (appointment.studentId === identity.studentId ||
        appointment.studentEmail?.trim().toLowerCase() === email),
  );
  if (upcoming) {
    throw new PublicAppointmentPolicyError(
      "upcoming_appointment",
      page.minimumNoticeHours,
    );
  }
}
