"use client";

import { MoonStar, SunMedium, Sunrise } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  groupBookingSlots,
  type BookingSlot,
  type PresentedBookingSlot,
} from "@/lib/booking-slot-presentation";

export function BookingSlotPicker({
  slots,
  locale,
  timeZone,
  copy,
  disabled = false,
  selectedStartsAt,
  onSelect,
}: {
  slots: BookingSlot[];
  locale: string;
  timeZone: string;
  copy: {
    morning: string;
    afternoon: string;
    evening: string;
    showMoreDates?: string;
  };
  disabled?: boolean;
  selectedStartsAt?: string;
  onSelect: (slot: PresentedBookingSlot) => void;
}) {
  const days = useMemo(
    () => groupBookingSlots(slots, locale, timeZone),
    [slots, locale, timeZone],
  );
  const [visibleDayCount, setVisibleDayCount] = useState(7);

  // Keep a resumed booking intent visible even when it falls beyond the first
  // page of dates.
  useEffect(() => {
    if (!selectedStartsAt) return;
    const selectedDayIndex = days.findIndex((day) =>
      day.periods.some((period) =>
        period.slots.some((slot) => slot.startsAt === selectedStartsAt),
      ),
    );
    if (selectedDayIndex >= 0) {
      setVisibleDayCount((current) =>
        Math.max(current, selectedDayIndex + 1),
      );
    }
  }, [days, selectedStartsAt]);

  const visibleDays = days.slice(0, visibleDayCount);
  return (
    <div className="mt-8 space-y-5">
      {visibleDays.map((day) => (
        <section
          className="overflow-hidden rounded-[24px] border border-black/10 bg-[#fbfaf4]"
          key={day.dateKey}
        >
          <header className="flex items-center gap-4 border-b border-black/8 bg-lavender-whisper/45 px-4 py-4 sm:px-5">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-vast-ink font-display text-3xl leading-none text-white">
              {day.day}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-2xl leading-none tracking-[-0.025em] capitalize">
                {day.weekday}
              </h3>
              <p className="mt-1.5 text-[11px] font-bold tracking-[0.09em] text-black/45 uppercase">
                {day.monthYear}
              </p>
            </div>
          </header>

          <div className="divide-y divide-black/8 px-4 sm:px-5">
            {day.periods.map((period) => (
              <div
                className="grid gap-3 py-4 sm:grid-cols-[7.5rem_1fr] sm:items-start"
                key={period.period}
              >
                <div className="flex items-center gap-2 pt-1 text-xs font-bold text-black/45">
                  <PeriodIcon period={period.period} />
                  <span>{copy[period.period]}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {period.slots.map((slot) => (
                    <button
                      aria-label={slot.accessibleLabel}
                      className="aria-pressed:bg-vast-ink aria-pressed:text-white min-h-11 min-w-22 rounded-full border border-vast-ink/15 bg-white px-4 text-center text-sm font-extrabold tabular-nums text-vast-ink transition hover:-translate-y-0.5 hover:border-vast-ink hover:bg-vast-ink hover:text-white disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-white disabled:hover:text-vast-ink"
                      key={slot.startsAt}
                      disabled={disabled}
                      aria-pressed={selectedStartsAt === slot.startsAt}
                      onClick={() => onSelect(slot)}
                      type="button"
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {visibleDayCount < days.length ? (
        <button
          className="mx-auto block rounded-full border border-vast-ink/20 bg-white px-5 py-2.5 text-sm font-bold text-vast-ink transition hover:border-vast-ink hover:bg-vast-ink hover:text-white"
          onClick={() => setVisibleDayCount((current) => current + 7)}
          type="button"
        >
          {copy.showMoreDates ?? "Show more dates"}
        </button>
      ) : null}
    </div>
  );
}

type TimePeriod = "morning" | "afternoon" | "evening";
function PeriodIcon({ period }: { period: TimePeriod }) {
  if (period === "morning") return <Sunrise aria-hidden="true" size={15} />;
  if (period === "afternoon") {
    return <SunMedium aria-hidden="true" size={15} />;
  }
  return <MoonStar aria-hidden="true" size={15} />;
}
