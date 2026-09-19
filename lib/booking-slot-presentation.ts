export type BookingSlot = { startsAt: string };

type TimePeriod = "morning" | "afternoon" | "evening";

export type PresentedBookingSlot = BookingSlot & {
  accessibleLabel: string;
  time: string;
};

type BookingDay = {
  dateKey: string;
  day: string;
  weekday: string;
  monthYear: string;
  periods: Array<{
    period: TimePeriod;
    slots: PresentedBookingSlot[];
  }>;
};

export function groupBookingSlots(
  slots: BookingSlot[],
  locale: string,
  timeZone: string,
) {
  const days = new Map<
    string,
    Omit<BookingDay, "periods"> & Record<TimePeriod, PresentedBookingSlot[]>
  >();

  for (const slot of slots) {
    const startsAt = new Date(slot.startsAt);
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(startsAt);
    const values = Object.fromEntries(
      dateParts.map(({ type, value }) => [type, value]),
    );
    const dateKey = `${values.year}-${values.month}-${values.day}`;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone,
      })
        .formatToParts(startsAt)
        .find(({ type }) => type === "hour")?.value,
    );
    const period: TimePeriod =
      hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const presentedSlot = presentBookingSlot(slot, locale, timeZone);

    const existing = days.get(dateKey);
    if (existing) {
      existing[period].push(presentedSlot);
      continue;
    }

    days.set(dateKey, {
      dateKey,
      day: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        timeZone,
      }).format(startsAt),
      weekday: new Intl.DateTimeFormat(locale, {
        timeZone,
        weekday: "long",
      }).format(startsAt),
      monthYear: new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone,
        year: "numeric",
      }).format(startsAt),
      morning: period === "morning" ? [presentedSlot] : [],
      afternoon: period === "afternoon" ? [presentedSlot] : [],
      evening: period === "evening" ? [presentedSlot] : [],
    });
  }

  return [...days.values()].map(({ morning, afternoon, evening, ...day }) => ({
    ...day,
    periods: [
      { period: "morning" as const, slots: morning },
      { period: "afternoon" as const, slots: afternoon },
      { period: "evening" as const, slots: evening },
    ].filter(({ slots: periodSlots }) => periodSlots.length > 0),
  }));
}

export function presentBookingSlot(
  slot: BookingSlot,
  locale: string,
  timeZone: string,
): PresentedBookingSlot {
  const startsAt = new Date(slot.startsAt);
  return {
    ...slot,
    accessibleLabel: new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(startsAt),
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(startsAt),
  };
}
