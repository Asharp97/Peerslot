import { formatInTimeZone } from "@/lib/availability-window";
import { zonedLocalDateTimeToUtc } from "@/lib/provider-availability";

// Convert in the provider's zone so midnight and DST transitions retain the
// requested elapsed duration, independent of the browser's time zone.
export function personalActivityEndTime(
  start: { date: string; startsAt: string },
  durationMinutes: number | null | undefined,
  timeZone: string,
): { endDate: string; endsAt: string } | null {
  if (
    durationMinutes == null ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 1440
  )
    return null;
  try {
    const startsAt = zonedLocalDateTimeToUtc(
      start.date,
      start.startsAt,
      timeZone,
    );
    const end = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const [endDate, time] = formatInTimeZone(end, timeZone).split("T");
    return { endDate, endsAt: time.slice(0, 5) };
  } catch {
    // Date/time inputs can be empty while the user is typing. Keep their
    // draft intact; normal form validation handles incomplete values.
    return null;
  }
}
