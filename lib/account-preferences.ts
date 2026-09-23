import { z } from "zod";

export const accountPreferencesSchema = z
  .object({
    language: z.enum(["en", "tr"]),
    dateFormat: z.enum(["dmy", "mdy", "ymd"]),
    timeFormat: z.enum(["12", "24"]),
  })
  .strict();

export type AccountPreferences = z.infer<typeof accountPreferencesSchema>;

export const defaultAccountPreferences: AccountPreferences = {
  language: "en",
  dateFormat: "dmy",
  timeFormat: "24",
};

export function parseAccountPreferences(value: unknown): AccountPreferences {
  const parsed = accountPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultAccountPreferences;
}
