import { randomInt } from "node:crypto";

import { z } from "zod";

import { isPostgresError } from "./database-errors";
import { isFiveMinuteOption } from "./scheduling-options";

const slugAlphabet =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export const bookingPageSettingsSchema = z
  .object({
    title: z.string().trim().min(2).max(100).optional(),
    timeZone: z
      .string()
      .trim()
      .refine(isValidTimeZone, "Invalid time zone")
      .optional(),
    appointmentDurationMinutes: z
      .number()
      .refine((value) => isFiveMinuteOption(value, 10, 90))
      .optional(),
    restBetweenSessionsMinutes: z
      .number()
      .refine((value) => isFiveMinuteOption(value, 0, 60))
      .optional(),
    minimumNoticeHours: z.number().int().min(0).max(720).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict()
  .refine((settings) => Object.keys(settings).length > 0, {
    message: "At least one booking page setting is required",
  });

export const bookingSlugSchema = z
  .string()
  .length(8)
  .regex(/^[A-HJ-NP-Za-km-z2-9]+$/);

export type BookingPageSettingsInput = z.infer<
  typeof bookingPageSettingsSchema
>;

export class BookingSlugGenerationError extends Error {
  constructor() {
    super("Unable to generate a unique booking page slug");
    this.name = "BookingSlugGenerationError";
  }
}

export function generateBookingSlug(
  pickIndex: (maximum: number) => number = randomInt,
) {
  return Array.from(
    { length: 8 },
    () => slugAlphabet[pickIndex(slugAlphabet.length)],
  ).join("");
}

export async function withBookingSlugRetries<T>(
  operation: (slug: string) => Promise<T>,
  generateSlug: () => string = generateBookingSlug,
  maximumAttempts = 5,
) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      return await operation(generateSlug());
    } catch (error) {
      if (!isPostgresError(error, "23505")) {
        throw error;
      }
    }
  }

  throw new BookingSlugGenerationError();
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
