import { z } from "zod";

export const timestampWithOffsetSchema = z.string().datetime({ offset: true });

export function createDateRangeSchema(
  maximumDays: number,
  maximumMessage: string,
) {
  return z
    .object({
      startsAt: timestampWithOffsetSchema,
      endsAt: timestampWithOffsetSchema,
    })
    .refine(({ startsAt, endsAt }) => new Date(endsAt) > new Date(startsAt), {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    })
    .refine(
      ({ startsAt, endsAt }) =>
        new Date(endsAt).getTime() - new Date(startsAt).getTime() <=
        maximumDays * 24 * 60 * 60 * 1000,
      { message: maximumMessage, path: ["endsAt"] },
    )
    .transform(({ startsAt, endsAt }) => ({
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    }));
}
