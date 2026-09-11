import { describe, expect, it } from "vitest";
import { assertStudentAppointmentCanChange } from "@/lib/student-appointment-policy";

const now = new Date("2030-01-15T09:00:00Z");
describe("student appointment notice", () => {
  it.each([23, 0, -1])(
    "blocks changes when the existing appointment is %s hours away",
    (hours) => {
      expect(() =>
        assertStudentAppointmentCanChange(
          {
            startsAt: new Date(now.getTime() + hours * 3_600_000),
            status: "scheduled",
            minimumNoticeHours: 24,
          },
          now,
        ),
      ).toThrow("notice");
    },
  );
  it.each([24, 25])(
    "permits changes when the existing appointment is %s hours away",
    (hours) => {
      expect(() =>
        assertStudentAppointmentCanChange(
          {
            startsAt: new Date(now.getTime() + hours * 3_600_000),
            status: "scheduled",
            minimumNoticeHours: 24,
          },
          now,
        ),
      ).not.toThrow();
    },
  );
  it("keeps cancelled appointments closed even outside the cutoff", () => {
    expect(() =>
      assertStudentAppointmentCanChange(
        {
          startsAt: new Date("2030-01-18T09:00:00Z"),
          status: "cancelled",
          minimumNoticeHours: 24,
        },
        now,
      ),
    ).toThrow("inactive");
  });
});
