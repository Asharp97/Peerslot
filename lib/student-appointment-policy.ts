export type StudentAppointmentChangeCode =
  "notice" | "inactive" | "not_found" | "unavailable" | "reschedule_limit";

export class StudentAppointmentChangeError extends Error {
  constructor(public code: StudentAppointmentChangeCode) {
    super(code);
    this.name = "StudentAppointmentChangeError";
  }
}

export function studentAppointmentChangeDeadline(
  startsAt: Date,
  minimumNoticeHours: number,
) {
  return new Date(startsAt.getTime() - minimumNoticeHours * 3_600_000);
}

export function studentAppointmentChangeRestriction(
  appointment: { startsAt: Date; status: string; minimumNoticeHours: number },
  now = new Date(),
) {
  if (appointment.status !== "scheduled" && appointment.status !== "pending") {
    return "inactive" as const;
  }
  if (
    appointment.startsAt <= now ||
    now >
      studentAppointmentChangeDeadline(
        appointment.startsAt,
        appointment.minimumNoticeHours,
      )
  ) {
    return "notice" as const;
  }
  return null;
}

export function assertStudentAppointmentCanChange(
  appointment: Parameters<typeof studentAppointmentChangeRestriction>[0],
  now = new Date(),
) {
  const restriction = studentAppointmentChangeRestriction(appointment, now);
  if (restriction) throw new StudentAppointmentChangeError(restriction);
}

export function studentRescheduleAllowance(limit: number, used: number) {
  return { remaining: Math.max(0, limit - used), reached: used >= limit };
}
