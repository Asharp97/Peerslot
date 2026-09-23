"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { BookingSlotPicker } from "@/components/booking/booking-slot-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgendaAppointment } from "@/lib/appointment-agenda";
import {
  appointmentDirection,
  formatAppointmentTime,
} from "@/lib/appointment-presentation";
import type { AppointmentsCopy } from "./copy";
import { fetchWithAccessToken } from "@/lib/auth-browser";

export type AppointmentAction = "cancel" | "reschedule";

export function AppointmentActionDialog({
  appointment,
  action,
  accessToken,
  locale,
  copy,
  onClose,
  onSaved,
  returnFocus,
}: {
  appointment: AgendaAppointment;
  action: AppointmentAction;
  accessToken: string;
  locale: string;
  copy: AppointmentsCopy;
  onClose: () => void;
  onSaved: () => void;
  returnFocus: () => void;
}) {
  const [rangeStart] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [times, setTimes] = useState<{ startsAt: string; endsAt: string }[]>(
    [],
  );
  const [selectedTime, setSelectedTime] = useState("");
  const [loading, setLoading] = useState(action === "reschedule");
  const [retry, setRetry] = useState(0);
  const [timesError, setTimesError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const startsAt = new Date(
    rangeStart + offset * 30 * 86_400_000,
  ).toISOString();
  const endsAt = new Date(
    rangeStart + (offset + 1) * 30 * 86_400_000,
  ).toISOString();

  useEffect(() => {
    if (action !== "reschedule") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setTimesError("");
      setTimes([]);
      setSelectedTime("");
      try {
        const query = new URLSearchParams({
          occurrenceStartsAt: appointment.occurrenceStartsAt,
          startsAt,
          endsAt,
        });
        const response = await fetchWithAccessToken(
          `/api/account/appointments/${appointment.id}?${query}`,
          accessToken,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setTimesError(actionError(body.error, copy, copy.timesError));
          return;
        }
        setTimes(body.availableTimes);
      } catch {
        if (!controller.signal.aborted) setTimesError(copy.timesError);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [
    accessToken,
    action,
    appointment.id,
    appointment.occurrenceStartsAt,
    copy,
    startsAt,
    endsAt,
    retry,
  ]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetchWithAccessToken(
        `/api/account/appointments/${appointment.id}`,
        accessToken,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            occurrenceStartsAt: appointment.occurrenceStartsAt,
            ...(action === "reschedule" ? { startsAt: selectedTime } : {}),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(actionError(body.error, copy, copy.saveError));
        return;
      }
      onSaved();
    } catch {
      setError(copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        dir={appointmentDirection(locale)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col border-2 border-vast-ink bg-lumen-cream sm:max-w-2xl"
      >
        <DialogHeader className="pe-8">
          <DialogTitle className="font-display text-3xl">
            {action === "cancel" ? copy.cancelTitle : copy.rescheduleTitle}
          </DialogTitle>
          <DialogDescription>
            {action === "cancel" ? copy.cancelBody : copy.rescheduleBody}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto px-1 pb-1">
          <p className="text-sm font-semibold">
            <bdi>{appointment.providerName}</bdi>
          </p>
          <p className="mt-1 text-sm text-black/60">
            {new Intl.DateTimeFormat(locale, {
              timeZone: appointment.timeZone,
              dateStyle: "long",
            }).format(new Date(appointment.startsAt))}
            {" · "}
            <bdi>
              {formatAppointmentTime(appointment, locale, appointment.timeZone)}
            </bdi>
          </p>
          <p className="mt-2 text-xs text-black/55">
            {copy.timeZone.replace("{timeZone}", appointment.timeZone)}
          </p>
          {action === "reschedule" ? (
            <>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 rounded-full"
                  disabled={offset === 0 || loading || saving}
                  onClick={() => setOffset((value) => value - 1)}
                >
                  {copy.previousTimes}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 rounded-full"
                  disabled={loading || saving}
                  onClick={() => setOffset((value) => value + 1)}
                >
                  {copy.nextTimes}
                </Button>
              </div>
              <p className="mt-3 text-sm font-semibold">
                <bdi>
                  {new Intl.DateTimeFormat(locale, {
                    timeZone: appointment.timeZone,
                    dateStyle: "medium",
                  }).formatRange(new Date(startsAt), new Date(endsAt))}
                </bdi>
              </p>
              {loading ? (
                <p
                  role="status"
                  className="flex min-h-28 items-center justify-center gap-2 text-sm"
                >
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                  {copy.loading}
                </p>
              ) : timesError ? (
                <div className="mt-4 space-y-3">
                  <p role="alert" className="text-sm text-red-700">
                    {timesError}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    {copy.retry}
                  </Button>
                </div>
              ) : times.length ? (
                <BookingSlotPicker
                  slots={times}
                  timeZone={appointment.timeZone}
                  locale={locale}
                  copy={copy}
                  disabled={saving}
                  selectedStartsAt={selectedTime}
                  onSelect={(slot) => {
                    setSelectedTime(slot.startsAt);
                    setError("");
                  }}
                />
              ) : (
                <p className="py-8 text-sm text-black/60">{copy.noTimes}</p>
              )}
            </>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm font-semibold text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className="mt-auto shrink-0">
          <Button
            className="min-h-11 rounded-full"
            variant="outline"
            disabled={saving}
            onClick={onClose}
          >
            {copy.back}
          </Button>
          <Button
            className="min-h-11 rounded-full"
            variant={action === "cancel" ? "destructive" : "default"}
            disabled={
              saving || (action === "reschedule" && (loading || !selectedTime))
            }
            onClick={save}
          >
            {saving ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            {saving
              ? copy.saving
              : action === "cancel"
                ? copy.confirmCancel
                : copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function actionError(
  code: string | undefined,
  copy: AppointmentsCopy,
  fallback: string,
) {
  if (code === "reschedule_limit") return copy.rescheduleLimitError;
  if (code === "notice") return copy.noticeError;
  if (code === "not_found" || code === "inactive") return copy.changedError;
  return fallback;
}
