import { describe, expect, it } from "vitest";

import {
  earliestAvailabilityLocal,
  getProviderWindowStatus,
  previewAvailabilityWindow,
  zonedLocalDateTimeToUtc,
} from "@/lib/provider-availability";

describe("provider availability editor", () => {
  it("converts provider-local Istanbul time to UTC", () => {
    expect(
      zonedLocalDateTimeToUtc(
        "2030-01-15",
        "13:00",
        "Europe/Istanbul",
      ).toISOString(),
    ).toBe("2030-01-15T10:00:00.000Z");
  });

  it("previews generated appointment times that fit the window", () => {
    const preview = previewAvailabilityWindow({
      date: "2030-01-15",
      startsAt: "13:00",
      endsAt: "16:00",
      timeZone: "Europe/Istanbul",
      durationMinutes: 30,
      intervalMinutes: 30,
    });

    expect(preview.slots).toHaveLength(6);
    expect(preview.slots[5].startsAt.toISOString()).toBe(
      "2030-01-15T12:30:00.000Z",
    );
  });

  it("previews rest as spacing without extending the appointment end", () => {
    const preview = previewAvailabilityWindow({
      date: "2030-01-15",
      startsAt: "13:00",
      endsAt: "16:00",
      timeZone: "Europe/Istanbul",
      durationMinutes: 45,
      intervalMinutes: 55,
    });

    expect(preview.slots).toHaveLength(3);
    expect(preview.slots[0].endsAt.toISOString()).toBe(
      "2030-01-15T10:45:00.000Z",
    );
    expect(preview.slots[1].startsAt.toISOString()).toBe(
      "2030-01-15T10:55:00.000Z",
    );
  });

  it("distinguishes booked, past, unpublished, and available windows", () => {
    const common = {
      startsAt: new Date("2030-01-15T10:00:00.000Z"),
      endsAt: new Date("2030-01-15T11:00:00.000Z"),
      isActive: true,
      isPagePublished: true,
      hasAppointments: false,
      now: new Date("2030-01-15T09:00:00.000Z"),
    };

    expect(getProviderWindowStatus(common)).toBe("available");
    expect(
      getProviderWindowStatus({
        ...common,
        hasAppointments: true,
      }),
    ).toBe("booked");
    expect(getProviderWindowStatus({ ...common, isPagePublished: false })).toBe(
      "unpublished",
    );
    expect(
      getProviderWindowStatus({
        ...common,
        now: new Date("2030-01-15T12:00:00.000Z"),
      }),
    ).toBe("past");
    expect(
      getProviderWindowStatus({
        ...common,
        recurrence: "weekly",
        now: new Date("2030-01-15T12:00:00.000Z"),
      }),
    ).toBe("available");
  });

  it("derives the earliest local date and time from minimum notice", () => {
    expect(
      earliestAvailabilityLocal({
        now: new Date("2030-01-15T10:00:30.000Z"),
        minimumNoticeHours: 24,
        timeZone: "Europe/Istanbul",
      }),
    ).toEqual({ date: "2030-01-16", time: "13:01" });
  });
});
