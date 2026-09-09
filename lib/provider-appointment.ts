import { z } from "zod";

import {
  createDateRangeSchema,
  timestampWithOffsetSchema,
} from "@/lib/date-schema";

const sessionColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || undefined);
const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const providerStudentCreateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .optional()
      .transform((value) => value?.toLowerCase()),
  })
  .strict();

export const providerStudentUpdateSchema = z
  .object({
    displayName: z.string().trim().min(2).max(100).optional(),
    email: z
      .union([z.string().trim().email().max(254), z.literal(""), z.null()])
      .optional()
      .transform((value) =>
        value === undefined ? undefined : value?.toLowerCase() || null,
      ),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one student change is required",
  });

export const providerAppointmentCreateSchema = z
  .object({
    providerStudentId: z.string().uuid(),
    startsAt: timestampWithOffsetSchema,
    endsAt: timestampWithOffsetSchema,
    comment: optionalText(1000),
    recurrence: z.enum(["none", "weekly"]).default("none"),
    color: sessionColorSchema.default("#f0d7ff"),
  })
  .strict()
  .refine(({ startsAt, endsAt }) => new Date(endsAt) > new Date(startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  .transform(({ startsAt, endsAt, ...input }) => ({
    ...input,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  }));

export const providerAppointmentUpdateSchema = z
  .object({
    startsAt: timestampWithOffsetSchema.optional(),
    endsAt: timestampWithOffsetSchema.optional(),
    comment: nullableText(1000),
    status: z.enum(["scheduled", "cancelled"]).optional(),
    color: sessionColorSchema.optional(),
    editScope: z.enum(["exception", "future"]).optional(),
    occurrenceStartsAt: timestampWithOffsetSchema.optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one appointment change is required",
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
  .refine(
    ({ editScope, occurrenceStartsAt }) =>
      editScope !== "future" || occurrenceStartsAt !== undefined,
    {
      message: "The selected recurring occurrence is required",
      path: ["occurrenceStartsAt"],
    },
  )
  .refine(
    ({ startsAt, endsAt }) =>
      !startsAt || !endsAt || new Date(endsAt) > new Date(startsAt),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  )
  .transform(
    ({ startsAt, endsAt, occurrenceStartsAt, editScope, ...input }) => ({
      ...input,
      editScope: editScope ?? "exception",
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
      occurrenceStartsAt: occurrenceStartsAt
        ? new Date(occurrenceStartsAt)
        : undefined,
    }),
  );

export const providerAppointmentDeleteSchema = z
  .object({
    deleteScope: z.enum(["occurrence", "future"]),
    occurrenceStartsAt: timestampWithOffsetSchema,
  })
  .strict()
  .transform(({ occurrenceStartsAt, ...input }) => ({
    ...input,
    occurrenceStartsAt: new Date(occurrenceStartsAt),
  }));

export const providerAppointmentReviewSchema = z
  .object({ decision: z.enum(["accept", "decline"]) })
  .strict();

export const providerAppointmentRangeSchema = createDateRangeSchema(
  45,
  "Appointment range cannot exceed 45 days",
);

export type ProviderAppointmentCreateInput = z.infer<
  typeof providerAppointmentCreateSchema
>;
export type ProviderAppointmentUpdateInput = z.infer<
  typeof providerAppointmentUpdateSchema
>;
export type ProviderAppointmentDeleteInput = z.infer<
  typeof providerAppointmentDeleteSchema
>;
export type ProviderStudentCreateInput = z.infer<
  typeof providerStudentCreateSchema
>;
export type ProviderStudentUpdateInput = z.infer<
  typeof providerStudentUpdateSchema
>;

export function appointmentTimesChanged(
  input: Pick<ProviderAppointmentUpdateInput, "startsAt" | "endsAt">,
  current: { startsAt: Date; endsAt: Date },
) {
  return (
    input.startsAt !== undefined &&
    input.endsAt !== undefined &&
    (input.startsAt.getTime() !== current.startsAt.getTime() ||
      input.endsAt.getTime() !== current.endsAt.getTime())
  );
}
