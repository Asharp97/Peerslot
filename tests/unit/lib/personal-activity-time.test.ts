import { describe, expect, it } from "vitest";
import { personalActivityEndTime } from "@/lib/personal-activity-time";

describe("personal activity duration", () => {
  it("calculates the end in the provider's zone, including the following day", () => {
    expect(
      personalActivityEndTime(
        { date: "2030-01-15", startsAt: "23:50" },
        17,
        "Europe/Istanbul",
      ),
    ).toEqual({ endDate: "2030-01-16", endsAt: "00:07" });
  });

  it("keeps the requested elapsed duration across a daylight-saving transition", () => {
    expect(
      personalActivityEndTime(
        { date: "2030-03-10", startsAt: "01:45" },
        30,
        "America/New_York",
      ),
    ).toEqual({ endDate: "2030-03-10", endsAt: "03:15" });
  });

  it("leaves custom times alone when no valid duration or start is provided", () => {
    for (const duration of [null, undefined, 0, -1, 1.5, 1441, NaN]) {
      expect(
        personalActivityEndTime(
          { date: "2030-01-15", startsAt: "12:00" },
          duration,
          "Europe/Istanbul",
        ),
      ).toBeNull();
    }
    expect(
      personalActivityEndTime(
        { date: "", startsAt: "" },
        30,
        "Europe/Istanbul",
      ),
    ).toBeNull();
  });
});
