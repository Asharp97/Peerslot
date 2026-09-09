"use client";

import {
  CalendarPlus,
  Check,
  ChevronRight,
  Clock3,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  earliestAvailabilityLocal,
  getProviderWindowStatus,
  previewAvailabilityWindow,
  type ProviderWindowStatus,
} from "@/lib/provider-availability";

import { DateTimeWindowPicker } from "./date-time-window-picker";
import { useProviderWorkspace } from "./provider-shell";

type AvailabilityWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  localStartsAt: string;
  localEndsAt: string;
  timeZone: string;
  recurrence: "none" | "weekly";
  hasAppointments: boolean;
};

export type ProviderAvailabilityCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  addWindow: string;
  date: string;
  startsAt: string;
  endsAt: string;
  preview: string;
  previewEmpty: string;
  save: string;
  saveChanges: string;
  cancelEdit: string;
  existing: string;
  noWindows: string;
  edit: string;
  remove: string;
  disable: string;
  enable: string;
  slots: string;
  timezoneNote: string;
  invalidWindow: string;
  saveError: string;
  overlapError: string;
  repeats: string;
  doesNotRepeat: string;
  weekly: string;
  weeklyHelp: string;
  status: Record<ProviderWindowStatus, string>;
};

export function ProviderAvailabilityEditor({
  copy,
}: {
  copy: ProviderAvailabilityCopy;
}) {
  const locale = useLocale() as "en" | "tr";
  const { accessToken, data } = useProviderWorkspace();
  const earliestAvailability = useMemo(
    () =>
      earliestAvailabilityLocal({
        now: new Date(),
        minimumNoticeHours: data.bookingPage.minimumNoticeHours,
        timeZone: data.bookingPage.timeZone,
      }),
    [data.bookingPage.minimumNoticeHours, data.bookingPage.timeZone],
  );
  const initialAvailability = useMemo(
    () =>
      getInitialAvailabilityFields(
        earliestAvailability,
        data.bookingPage.appointmentDurationMinutes,
      ),
    [data.bookingPage.appointmentDurationMinutes, earliestAvailability],
  );
  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(initialAvailability.date);
  const [startsAt, setStartsAt] = useState(initialAvailability.startsAt);
  const [endsAt, setEndsAt] = useState(initialAvailability.endsAt);
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("weekly");

  const loadWindows = useCallback(async () => {
    const response = await fetch("/api/availability-windows", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to load availability");
    const body = (await response.json()) as { windows: AvailabilityWindow[] };
    setWindows(body.windows);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    async function initialize() {
      try {
        await loadWindows();
      } catch {
        setError(copy.saveError);
        setLoading(false);
      }
    }

    void initialize();
  }, [copy.saveError, loadWindows]);

  const preview = useMemo(() => {
    try {
      if (
        `${date}T${startsAt}` <
        `${earliestAvailability.date}T${earliestAvailability.time}`
      ) {
        return null;
      }

      return previewAvailabilityWindow({
        date,
        startsAt,
        endsAt,
        timeZone: data.bookingPage.timeZone,
        durationMinutes: data.bookingPage.appointmentDurationMinutes,
        intervalMinutes: data.bookingPage.bookingIntervalMinutes,
      });
    } catch {
      return null;
    }
  }, [data.bookingPage, date, earliestAvailability, endsAt, startsAt]);

  async function saveWindow(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || preview.slots.length === 0) {
      setError(copy.invalidWindow);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editingId
          ? `/api/availability-windows/${editingId}`
          : "/api/availability-windows",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startsAt: preview.startsAt.toISOString(),
            endsAt: preview.endsAt.toISOString(),
            recurrence,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        studentName?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.studentName
            ? copy.overlapError.replace("{studentName}", body.studentName)
            : body.error || copy.saveError,
        );
      }

      resetForm();
      await loadWindows();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  function editWindow(window: AvailabilityWindow) {
    const [initialLocalDate, localStart] = window.localStartsAt.split("T");
    const [, localEnd] = window.localEndsAt.split("T");
    let localDate = initialLocalDate;

    if (window.recurrence === "weekly") {
      while (
        `${localDate}T${localStart.slice(0, 5)}` <
        `${earliestAvailability.date}T${earliestAvailability.time}`
      ) {
        localDate = addLocalDays(localDate, 7);
      }
    }

    setEditingId(window.id);
    setDate(localDate);
    setStartsAt(localStart.slice(0, 5));
    setEndsAt(localEnd.slice(0, 5));
    setRecurrence(window.recurrence);
    setError("");
    windowScrollToEditor();
  }

  async function updateActivity(window: AvailabilityWindow) {
    await mutateWindow(window.id, "PATCH", { isActive: !window.isActive });
  }

  async function removeWindow(windowId: string) {
    await mutateWindow(windowId, "DELETE");
  }

  async function mutateWindow(
    windowId: string,
    method: "PATCH" | "DELETE",
    body?: object,
  ) {
    setError("");
    const response = await fetch(`/api/availability-windows/${windowId}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = (await response.json()) as {
      error?: string;
      studentName?: string;
    };
    if (!response.ok) {
      setError(
        result.studentName
          ? copy.overlapError.replace("{studentName}", result.studentName)
          : result.error || copy.saveError,
      );
      return;
    }
    if (editingId === windowId) resetForm();
    await loadWindows();
  }

  function resetForm() {
    setEditingId(null);
    const nextInitial = getInitialAvailabilityFields(
      earliestAvailabilityLocal({
        now: new Date(),
        minimumNoticeHours: data.bookingPage.minimumNoticeHours,
        timeZone: data.bookingPage.timeZone,
      }),
      data.bookingPage.appointmentDurationMinutes,
    );
    setDate(nextInitial.date);
    setStartsAt(nextInitial.startsAt);
    setEndsAt(nextInitial.endsAt);
    setRecurrence("weekly");
  }

  return (
    <div>
      <section>
        <p className="text-[11px] font-bold tracking-[0.16em] text-black/45 uppercase">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 font-display text-5xl leading-none tracking-[-0.04em] sm:text-6xl">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-black/55 sm:text-base">
          {copy.intro}
        </p>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <form
          className="h-fit rounded-[28px] bg-vast-ink p-6 text-white sm:p-7"
          id="availability-editor"
          onSubmit={saveWindow}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-lavender-whisper text-vast-ink">
                {editingId ? <Pencil size={18} /> : <Plus size={19} />}
              </span>
              <h2 className="font-bold">
                {editingId ? copy.saveChanges : copy.addWindow}
              </h2>
            </div>
            {editingId ? (
              <button
                aria-label={copy.cancelEdit}
                className="grid size-9 place-items-center rounded-full bg-white/10"
                onClick={resetForm}
                type="button"
              >
                <X size={17} />
              </button>
            ) : null}
          </div>

          <DateTimeWindowPicker
            copy={copy}
            date={date}
            endsAt={endsAt}
            locale={locale}
            minimumDate={earliestAvailability.date}
            minimumStartsAt={earliestAvailability.time}
            onDateChange={setDate}
            onEndsAtChange={setEndsAt}
            onStartsAtChange={setStartsAt}
            startsAt={startsAt}
          />
          <div className="mt-4">
            <p className="text-xs font-bold text-white/60">{copy.repeats}</p>
            <Select
              onValueChange={(value) =>
                setRecurrence(value as "none" | "weekly")
              }
              value={recurrence}
            >
              <SelectTrigger className="mt-2 min-h-12 w-full rounded-xl border-white/15 bg-white/8 px-4 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{copy.weekly}</SelectItem>
                <SelectItem value="none">{copy.doesNotRepeat}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs leading-5 text-white/45">
              {copy.weeklyHelp}
            </p>
          </div>
          <p className="mt-4 text-xs leading-5 text-white/45">
            {copy.timezoneNote.replace("{timeZone}", data.bookingPage.timeZone)}
          </p>

          <div className="mt-6 rounded-2xl bg-white/8 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold">{copy.preview}</p>
              {preview?.slots.length ? (
                <span className="rounded-full bg-lavender-whisper px-2.5 py-1 text-[10px] font-bold text-vast-ink">
                  {preview.slots.length} {copy.slots}
                </span>
              ) : null}
            </div>
            {preview?.slots.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {preview.slots.map((slot) => (
                  <span
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs"
                    key={slot.startsAt.toISOString()}
                  >
                    {formatTime(
                      slot.startsAt,
                      locale,
                      data.bookingPage.timeZone,
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/40">{copy.previewEmpty}</p>
            )}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl bg-[#ffb8ad] px-4 py-3 text-xs font-semibold text-[#641c14]">
              {error}
            </p>
          ) : null}

          <button
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-lavender-whisper px-5 text-sm font-bold text-vast-ink disabled:opacity-50"
            disabled={saving || !preview?.slots.length}
            type="submit"
          >
            {saving ? (
              <LoaderCircle className="animate-spin" size={17} />
            ) : (
              <Check size={17} />
            )}
            {editingId ? copy.saveChanges : copy.save}
          </button>
        </form>

        <div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">{copy.existing}</h2>
            <StatusLegend copy={copy.status} />
          </div>

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="grid min-h-48 place-items-center rounded-[24px] border border-black/10 bg-[#fbfaf4]">
                <LoaderCircle className="animate-spin" size={20} />
              </div>
            ) : windows.length ? (
              windows.map((window) => {
                const status = getProviderWindowStatus({
                  startsAt: new Date(window.startsAt),
                  endsAt: new Date(window.endsAt),
                  isActive: window.isActive,
                  isPagePublished: data.bookingPage.isPublished,
                  recurrence: window.recurrence,
                  hasAppointments: window.hasAppointments,
                  now: new Date(),
                });
                const booked = status === "booked";
                const past = status === "past";

                return (
                  <article
                    className="rounded-[24px] border border-black/10 bg-[#fbfaf4] p-5 transition hover:border-black/20"
                    key={window.id}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black/5">
                        {status === "unpublished" ? (
                          <EyeOff size={20} />
                        ) : (
                          <CalendarPlus size={20} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">
                            {formatDay(
                              window.startsAt,
                              locale,
                              data.bookingPage.timeZone,
                            )}
                          </p>
                          <StatusPill
                            copy={copy.status[status]}
                            status={status}
                          />
                        </div>
                        <p className="mt-1 text-xs text-black/45">
                          {formatTime(
                            new Date(window.startsAt),
                            locale,
                            data.bookingPage.timeZone,
                          )}{" "}
                          —{` `}
                          {formatTime(
                            new Date(window.endsAt),
                            locale,
                            data.bookingPage.timeZone,
                          )}
                        </p>
                        {window.recurrence === "weekly" ? (
                          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-[#5132aa]">
                            <Repeat2 size={12} /> {copy.weekly}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <SmallAction
                          disabled={booked || past}
                          icon={<Pencil size={14} />}
                          label={copy.edit}
                          onClick={() => editWindow(window)}
                        />
                        {!past ? (
                          <SmallAction
                            icon={
                              window.isActive ? (
                                <EyeOff size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )
                            }
                            label={window.isActive ? copy.disable : copy.enable}
                            onClick={() => void updateActivity(window)}
                          />
                        ) : null}
                        {!past ? (
                          <SmallAction
                            icon={<Trash2 size={14} />}
                            label={copy.remove}
                            onClick={() => void removeWindow(window.id)}
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="grid min-h-56 place-items-center rounded-[24px] border border-dashed border-black/15 bg-[#fbfaf4] px-8 text-center">
                <div>
                  <Clock3 className="mx-auto text-black/25" size={25} />
                  <p className="mt-4 text-sm text-black/45">{copy.noWindows}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusLegend({
  copy,
}: {
  copy: Record<ProviderWindowStatus, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(copy) as ProviderWindowStatus[]).map((status) => (
        <span
          className="flex items-center gap-1.5 text-[10px] text-black/45"
          key={status}
        >
          <span className={`size-2 rounded-full ${statusDot[status]}`} />
          {copy[status]}
        </span>
      ))}
    </div>
  );
}

function StatusPill({
  copy,
  status,
}: {
  copy: string;
  status: ProviderWindowStatus;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusPill[status]}`}
    >
      {copy}
    </span>
  );
}

function SmallAction({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-black/10 px-3 text-[11px] font-bold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon} {label}
    </button>
  );
}

const statusDot: Record<ProviderWindowStatus, string> = {
  available: "bg-[#56a46f]",
  booked: "bg-[#7859d6]",
  past: "bg-black/25",
  unpublished: "bg-[#e9a43b]",
};

const statusPill: Record<ProviderWindowStatus, string> = {
  available: "bg-[#dff3e4] text-[#245e37]",
  booked: "bg-[#e8e0ff] text-[#5132aa]",
  past: "bg-black/7 text-black/45",
  unpublished: "bg-[#fff0cf] text-[#7a4b00]",
};

function formatTime(date: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getInitialAvailabilityFields(
  earliest: { date: string; time: string },
  appointmentDurationMinutes: number,
) {
  const [hour, minute] = earliest.time.split(":").map(Number);
  const earliestMinutes = hour * 60 + minute;
  let startsAtMinutes = Math.max(9 * 60, Math.ceil(earliestMinutes / 15) * 15);
  const windowMinutes = Math.max(3 * 60, appointmentDurationMinutes);
  let date = earliest.date;

  if (startsAtMinutes + windowMinutes >= 24 * 60) {
    date = addLocalDays(date, 1);
    startsAtMinutes = 9 * 60;
  }

  return {
    date,
    startsAt: formatMinutes(startsAtMinutes),
    endsAt: formatMinutes(startsAtMinutes + windowMinutes),
  };
}

function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

function addLocalDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDay(value: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function windowScrollToEditor() {
  window.requestAnimationFrame(() => {
    document
      .getElementById("availability-editor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
