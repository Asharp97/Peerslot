import { z } from "zod";

import { timestampWithOffsetSchema } from "@/lib/date-schema";

const availabilityRecurrenceSchema = z.enum(["none", "weekly"]);

export const availabilityWindowCreateSchema = z
  .object({
    startsAt: timestampWithOffsetSchema,
    endsAt: timestampWithOffsetSchema,
    recurrence: availabilityRecurrenceSchema.default("weekly"),
  })
  .strict()
  .transform(({ startsAt, endsAt, recurrence }) => ({
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    recurrence,
  }))
  .refine(({ startsAt, endsAt }) => endsAt > startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const availabilityWindowUpdateSchema = z
  .object({
    startsAt: timestampWithOffsetSchema.optional(),
    endsAt: timestampWithOffsetSchema.optional(),
    isActive: z.boolean().optional(),
    recurrence: availabilityRecurrenceSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one availability window change is required",
  })
  .refine(
    ({ startsAt, endsAt }) =>
      (startsAt === undefined && endsAt === undefined) ||
      (startsAt !== undefined && endsAt !== undefined),
    {
      message: "startsAt and endsAt must be updated together",
      path: ["endsAt"],
    },
  )
  .transform(({ startsAt, endsAt, isActive, recurrence }) => ({
    startsAt: startsAt ? new Date(startsAt) : undefined,
    endsAt: endsAt ? new Date(endsAt) : undefined,
    isActive,
    recurrence,
  }))
  .refine(({ startsAt, endsAt }) => !startsAt || !endsAt || endsAt > startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export type AvailabilityWindowRange = {
  startsAt: Date;
  endsAt: Date;
};

export type AvailabilityRecurrence = z.infer<
  typeof availabilityRecurrenceSchema
>;

export type AvailabilityWindowRule = AvailabilityWindowRange & {
  recurrence: AvailabilityRecurrence;
};

export function deriveAvailabilitySlots(
  range: AvailabilityWindowRange,
  appointmentDurationMinutes: number,
  bookingIntervalMinutes: number,
  generateId: () => string,
) {
  return deriveAvailabilityRanges(
    range,
    appointmentDurationMinutes,
    bookingIntervalMinutes,
  ).map((slot) => ({ ...slot, id: generateId() }));
}

export function deriveAvailabilityRanges(
  range: AvailabilityWindowRange,
  appointmentDurationMinutes: number,
  bookingIntervalMinutes: number,
) {
  if (
    !Number.isFinite(appointmentDurationMinutes) ||
    appointmentDurationMinutes <= 0 ||
    !Number.isFinite(bookingIntervalMinutes) ||
    bookingIntervalMinutes <= 0
  ) {
    throw new RangeError("Slot duration and interval must be positive numbers");
  }

  const durationMilliseconds = appointmentDurationMinutes * 60 * 1000;
  const intervalMilliseconds = bookingIntervalMinutes * 60 * 1000;
  const slots: AvailabilityWindowRange[] = [];

  for (
    let startsAt = range.startsAt.getTime();
    startsAt + durationMilliseconds <= range.endsAt.getTime();
    startsAt += intervalMilliseconds
  ) {
    slots.push({
      startsAt: new Date(startsAt),
      endsAt: new Date(startsAt + durationMilliseconds),
    });

    if (slots.length > 500) {
      throw new RangeError("Availability window derives too many slots");
    }
  }

  return slots;
}

export function availabilityWindowRemovalMode(hasAppointments: boolean) {
  return hasAppointments ? "preserve" : "delete";
}

export function formatInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}
