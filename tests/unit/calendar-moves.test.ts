import { describe, expect, it } from "vitest";
import {
  expandAvailableSlots,
  expandPersonalActivityTimes,
  type CalendarMoves,
} from "@/lib/calendar-moves";

const rule = {
  id: "window",
  startsAt: new Date("2030-03-24T08:00:00Z"),
  endsAt: new Date("2030-03-24T11:00:00Z"),
  recurrence: "weekly" as const,
  isActive: true,
};
const range = {
  startsAt: new Date("2030-03-23T00:00:00Z"),
  endsAt: new Date("2030-04-08T00:00:00Z"),
};
describe("calendar occurrence expansion", () => {
  it("moves only the chosen block while preserving weekly wall times across daylight saving", () => {
    const originalStartsAt = "2030-03-24T09:00:00.000Z";
    const moves: CalendarMoves = {
      [originalStartsAt]: {
        startsAt: "2030-03-31T12:10:00Z",
        endsAt: "2030-03-31T12:40:00Z",
      },
    };
    const before = expandAvailableSlots(rule, range, "Europe/Berlin", 30, 60);
    const after = expandAvailableSlots(
      { ...rule, moves },
      range,
      "Europe/Berlin",
      30,
      60,
    );
    expect(after.filter((item) => !item.moved)).toEqual(
      before.filter((item) => item.startsAt.toISOString() !== originalStartsAt),
    );
    expect(after.find((item) => item.moved)).toMatchObject({
      id: "window:" + originalStartsAt,
      originalStartsAt: new Date(originalStartsAt),
      startsAt: new Date("2030-03-31T12:10:00Z"),
    });
    expect(
      after.some(
        (item) => item.startsAt.toISOString() === "2030-04-07T07:00:00.000Z",
      ),
    ).toBe(true);
    expect(after).toHaveLength(9);
  });
  it("uses the current appointment duration for moved availability after settings change", () => {
    const moves: CalendarMoves = {
      "2030-03-24T08:00:00.000Z": {
        startsAt: "2030-03-25T10:00:00Z",
        endsAt: "2030-03-25T10:30:00Z",
      },
    };
    const slots = expandAvailableSlots(
      { ...rule, moves },
      range,
      "Europe/Berlin",
      45,
      75,
    );
    const moved = slots.find((item) => item.moved)!;
    expect(moved.endsAt.getTime() - moved.startsAt.getTime()).toBe(45 * 60_000);
  });
  it("retains a personal activity's exact duration and hides only deleted occurrences", () => {
    const originalStartsAt = "2030-03-24T08:00:00.000Z";
    const personal = {
      ...rule,
      endsAt: new Date("2030-03-24T08:07:00Z"),
      moves: {
        [originalStartsAt]: {
          startsAt: "2030-03-25T23:59:00Z",
          endsAt: "2030-03-26T00:06:00Z",
        },
        "2030-03-31T07:00:00.000Z": null,
      },
    };
    const times = expandPersonalActivityTimes(personal, range, "Europe/Berlin");
    expect(times).toHaveLength(2);
    expect(
      times.map((item) => item.endsAt.getTime() - item.startsAt.getTime()),
    ).toEqual([7 * 60_000, 7 * 60_000]);
    expect(
      times.some(
        (item) => item.startsAt.toISOString() === "2030-04-07T07:00:00.000Z",
      ),
    ).toBe(true);
  });
  it("hides moved blocks when the parent availability is inactive", () => {
    expect(
      expandAvailableSlots(
        {
          ...rule,
          isActive: false,
          moves: {
            "2030-03-24T08:00:00.000Z": {
              startsAt: "2030-03-25T10:00:00Z",
              endsAt: "2030-03-25T10:30:00Z",
            },
          },
        },
        range,
        "Europe/Berlin",
        30,
        60,
      ),
    ).toEqual([]);
  });
});
