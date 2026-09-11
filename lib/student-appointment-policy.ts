export type StudentAppointmentChangeCode =
  "notice" | "inactive" | "not_found" | "unavailable";

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

export function assertStudentAppointmentCanChange(
  appointment: { startsAt: Date; status: string; minimumNoticeHours: number },
  now = new Date(),
) {
  if (appointment.status !== "scheduled" && appointment.status !== "pending") {
    throw new StudentAppointmentChangeError("inactive");
  }
  if (
    appointment.startsAt <= now ||
    now >
      studentAppointmentChangeDeadline(
        appointment.startsAt,
        appointment.minimumNoticeHours,
      )
  ) {
    throw new StudentAppointmentChangeError("notice");
  }
}
