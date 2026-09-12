import { z } from "zod";
import {
  createDateRangeSchema,
  timestampWithOffsetSchema,
} from "@/lib/date-schema";

export const personalActivityColor = "#fde7b0";
export const personalActivitySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    defaultDurationMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .nullable()
      .optional(),
  })
  .strict();

export const personalActivityScheduleSchema = z
  .object({
    activityId: z.string().uuid(),
    startsAt: timestampWithOffsetSchema,
    endsAt: timestampWithOffsetSchema,
    recurrence: z.enum(["none", "weekly"]).default("none"),
  })
  .strict()
  .refine(({ startsAt, endsAt }) => new Date(endsAt) > new Date(startsAt), {
    message: "Choose an end time after the start time.",
    path: ["endsAt"],
  })
  .refine(
    ({ startsAt, endsAt }) =>
      new Date(endsAt).getTime() - new Date(startsAt).getTime() <= 86_400_000,
    {
      message: "An activity can last up to 24 hours.",
      path: ["endsAt"],
    },
  )
  .transform(({ startsAt, endsAt, ...input }) => ({
    ...input,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  }));

export const personalActivityRangeSchema = createDateRangeSchema(
  45,
  "Activity range cannot exceed 45 days",
);
export type PersonalActivityScheduleInput = z.infer<
  typeof personalActivityScheduleSchema
>;
export type PersonalActivityInput = z.infer<typeof personalActivitySchema>;
export type PersonalActivityName = {
  id: string;
  name: string;
  defaultDurationMinutes: number | null;
};
export type PersonalActivityOccurrence = {
  id: string;
  scheduleId: string;
  activityId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  originalStartsAt?: string;
  isMoved?: boolean;
  ruleStartsAt: string;
  ruleEndsAt: string;
  recurrence: "none" | "weekly";
};

export class PersonalActivityError extends Error {
  constructor(
    public code: "activity_not_found" | "activity_name_conflict",
    message: string,
  ) {
    super(message);
    this.name = "PersonalActivityError";
  }
}
