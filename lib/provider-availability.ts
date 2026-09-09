import { deriveAvailabilityRanges } from "@/lib/availability-window";

export type ProviderWindowStatus =
  "available" | "booked" | "past" | "unpublished";

export function getProviderWindowStatus(input: {
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  isPagePublished: boolean;
  hasAppointments: boolean;
  now: Date;
  recurrence?: "none" | "weekly";
}): ProviderWindowStatus {
  if (input.recurrence !== "weekly" && input.endsAt <= input.now) return "past";
  if (input.hasAppointments) return "booked";
  if (!input.isActive || !input.isPagePublished) return "unpublished";
  return "available";
}

export function earliestAvailabilityLocal(input: {
  now: Date;
  minimumNoticeHours: number;
  timeZone: string;
}) {
  const cutoff = new Date(
    Math.ceil(
      (input.now.getTime() + input.minimumNoticeHours * 60 * 60 * 1000) /
        60_000,
    ) * 60_000,
  );
  const local = localDateTimeParts(cutoff, input.timeZone);

  return {
    date: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    time: `${pad(local.hour)}:${pad(local.minute)}`,
  };
}

export function previewAvailabilityWindow(input: {
  date: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  intervalMinutes: number;
}) {
  const startsAt = zonedLocalDateTimeToUtc(
    input.date,
    input.startsAt,
    input.timeZone,
  );
  const endsAt = zonedLocalDateTimeToUtc(
    input.date,
    input.endsAt,
    input.timeZone,
  );

  if (endsAt <= startsAt) {
    throw new RangeError("The end time must be after the start time");
  }

  if (
    input.durationMinutes <= 0 ||
    input.intervalMinutes <= 0 ||
    input.intervalMinutes < input.durationMinutes
  ) {
    throw new RangeError(
      "Interval must be a positive value that covers the duration",
    );
  }

  const slots = deriveAvailabilityRanges(
    { startsAt, endsAt },
    input.durationMinutes,
    input.intervalMinutes,
  );

  return { startsAt, endsAt, slots };
}

export function zonedLocalDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (![year, month, day, hour, minute].every(Number.isInteger)) {
    throw new RangeError("Invalid local date or time");
  }

  const target = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(target);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const local = localDateTimeParts(result, timeZone);
    const observed = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    );
    result = new Date(result.getTime() + target - observed);
  }

  const resolved = localDateTimeParts(result, timeZone);
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  ) {
    throw new RangeError("This local time does not exist in the selected zone");
  }

  return result;
}

function localDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, Number(value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
