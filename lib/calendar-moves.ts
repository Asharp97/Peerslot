import { z } from "zod";
import { timestampWithOffsetSchema } from "@/lib/date-schema";
import { expandAvailabilityRule } from "@/lib/availability-recurrence";
import {
  deriveAvailabilityRanges,
  type AvailabilityWindowRule,
} from "@/lib/availability-window";

export type CalendarMoves = Record<
  string,
  { startsAt: string; endsAt: string } | null
>;
type Range = { startsAt: Date; endsAt: Date };
type Rule = AvailabilityWindowRule & {
  id: string;
  isActive: boolean;
  moves?: CalendarMoves;
};
export const calendarMoveSchema = z
  .object({
    originalStartsAt: timestampWithOffsetSchema,
    startsAt: timestampWithOffsetSchema,
    endsAt: timestampWithOffsetSchema.optional(),
  })
  .strict()
  .transform(({ originalStartsAt, startsAt, endsAt }) => ({
    originalStartsAt: new Date(originalStartsAt),
    startsAt: new Date(startsAt),
    endsAt: endsAt ? new Date(endsAt) : undefined,
  }));
export const calendarMoveDeleteSchema = z
  .object({ originalStartsAt: timestampWithOffsetSchema })
  .strict();
export type CalendarMoveInput = z.infer<typeof calendarMoveSchema>;

export class CalendarMoveError extends Error {
  constructor(
    public code:
      | "calendar_block_missing"
      | "calendar_block_conflict"
      | "calendar_block_past"
      | "calendar_block_invalid",
    message: string,
  ) {
    super(message);
    this.name = "CalendarMoveError";
  }
}
const overlaps = (first: Range, second: Range) =>
  first.startsAt < second.endsAt && first.endsAt > second.startsAt;

function applyMoves(
  rule: Rule,
  base: Range[],
  range: Range,
  duration?: number,
) {
  if (!rule.isActive) return [];
  const moves = rule.moves ?? {};
  return [
    ...base
      .filter((item) => !Object.hasOwn(moves, item.startsAt.toISOString()))
      .map((item) => ({
        ...item,
        originalStartsAt: item.startsAt,
        moved: false,
      })),
    ...Object.entries(moves).flatMap(([original, move]) => {
      if (!move) return [];
      const startsAt = new Date(move.startsAt);
      const item = {
        startsAt,
        endsAt: duration
          ? new Date(startsAt.getTime() + duration * 60_000)
          : new Date(move.endsAt),
        originalStartsAt: new Date(original),
        moved: true,
      };
      return overlaps(item, range) ? [item] : [];
    }),
  ]
    .filter((item) => overlaps(item, range))
    .map((item) => ({
      ...item,
      id: `${rule.id}:${item.originalStartsAt.toISOString()}`,
    }));
}

export function expandPersonalActivityTimes(
  rule: Rule,
  range: Range,
  timeZone: string,
) {
  return applyMoves(rule, expandAvailabilityRule(rule, range, timeZone), range);
}

export function expandAvailableSlots(
  rule: Rule,
  range: Range,
  timeZone: string,
  duration: number,
  interval: number,
) {
  const base = expandAvailabilityRule(rule, range, timeZone).flatMap(
    (occurrence) => deriveAvailabilityRanges(occurrence, duration, interval),
  );
  return applyMoves(rule, base, range, duration);
}

export function findOriginalCalendarBlock(
  rule: Rule,
  originalStartsAt: Date,
  timeZone: string,
  config?: { duration: number; interval: number },
) {
  const range = {
    startsAt: originalStartsAt,
    endsAt: new Date(originalStartsAt.getTime() + 1),
  };
  const occurrences = expandAvailabilityRule(rule, range, timeZone);
  const blocks = config
    ? occurrences.flatMap((occurrence) =>
        deriveAvailabilityRanges(occurrence, config.duration, config.interval),
      )
    : occurrences;
  return blocks.find(
    (block) => block.startsAt.getTime() === originalStartsAt.getTime(),
  );
}
