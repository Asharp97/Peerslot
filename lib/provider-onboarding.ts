import { z } from "zod";

import { isValidTimeZone } from "./booking-page";
import {
  appointmentDurationOptions,
  restTimeOptions,
} from "./scheduling-options";

const bookingNoticeOptions = [0, 60, 240, 720, 1440, 2880] as const;

export const providerOnboardingSchema = z.object({
  locale: z.enum(["en", "tr"]).default("en"),
  displayName: z.string().trim().min(2).max(80),
  professionalTitle: z.string().trim().min(2).max(80),
  timeZone: z.string().trim().refine(isValidTimeZone, "Invalid time zone"),
  defaultAppointmentDurationMinutes: z
    .number()
    .int()
    .refine(
      (value) => appointmentDurationOptions.includes(value),
      "Invalid appointment duration",
    ),
  minimumBookingNoticeMinutes: z
    .number()
    .int()
    .refine(
      (value) => (bookingNoticeOptions as readonly number[]).includes(value),
      "Invalid minimum booking notice",
    ),
  restBetweenSessionsMinutes: z
    .number()
    .int()
    .refine((value) => restTimeOptions.includes(value), "Invalid rest time"),
});

export type ProviderOnboardingInput = z.infer<typeof providerOnboardingSchema>;
