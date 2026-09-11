"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StudentAppointmentsCopy = {
  title: string;
  intro: string;
  empty: string;
  loading: string;
  reschedule: string;
  cancel: string;
  pending: string;
  scheduled: string;
  notice: string;
  locked: string;
  rescheduleTitle: string;
  rescheduleBody: string;
  cancelTitle: string;
  cancelBody: string;
  chooseTime: string;
  noTimes: string;
  save: string;
  saving: string;
  confirmCancel: string;
  back: string;
  loadError: string;
  saveError: string;
  noticeError: string;
  changedError: string;
};

type StudentAppointment = {
  id: string;
  occurrenceStartsAt: string;
  startsAt: string;
  endsAt: string;
  providerName: string;
  timeZone: string;
  status: "pending" | "scheduled";
  minimumNoticeHours: number;
  canChange: boolean;
  canReschedule: boolean;
};

export function StudentAppointments({
  accessToken,
  locale,
  copy,
}: {
  accessToken: string;
  locale: string;
  copy: StudentAppointmentsCopy;
}) {
  const [appointments, setAppointments] = useState<StudentAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<{
    appointment: StudentAppointment;
    action: "reschedule" | "cancel";
  } | null>(null);
  const [times, setTimes] = useState<
    Array<{ startsAt: string; endsAt: string }>
  >([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async () => {
    const response = await fetch("/api/account/appointments", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(copy.loadError);
    const body = (await response.json()) as {
      appointments: StudentAppointment[];
    };
    return body.appointments;
  }, [accessToken, copy.loadError]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const result = await loadAppointments();
        if (!cancelled) setAppointments(result);
      } catch {
        if (!cancelled) setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadAppointments, copy.loadError]);

  useEffect(() => {
    if (!selection || selection.action !== "reschedule") return;
    const controller = new AbortController();
    const startsAt = new Date();
    const params = new URLSearchParams({
      occurrenceStartsAt: selection.appointment.occurrenceStartsAt,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 30 * 86_400_000).toISOString(),
    });
    async function loadTimes() {
      try {
        const response = await fetch(
          `/api/account/appointments/${selection!.appointment.id}?${params}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = (await response.json()) as {
          availableTimes?: typeof times;
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            body.error === "notice" ? copy.noticeError : copy.loadError,
          );
        if (!controller.signal.aborted) setTimes(body.availableTimes ?? []);
      } catch (caught) {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : copy.loadError);
      } finally {
        if (!controller.signal.aborted) setLoadingTimes(false);
      }
    }
    void loadTimes();
    return () => controller.abort();
  }, [selection, accessToken, copy.loadError, copy.noticeError]);

  function open(
    appointment: StudentAppointment,
    action: "cancel" | "reschedule",
  ) {
    setError("");
    setTimes([]);
    setSelectedTime("");
    setLoadingTimes(action === "reschedule");
    setSelection({ appointment, action });
  }

  async function save() {
    if (!selection || (selection.action === "reschedule" && !selectedTime))
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/account/appointments/${selection.appointment.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: selection.action,
            occurrenceStartsAt: selection.appointment.occurrenceStartsAt,
            ...(selection.action === "reschedule"
              ? { startsAt: selectedTime }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error === "notice"
            ? copy.noticeError
            : body?.error === "not_found" || body?.error === "inactive"
              ? copy.changedError
              : copy.saveError,
        );
      }
      setSelection(null);
      setAppointments(await loadAppointments());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  function formatTime(value: string, timeZone: string) {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  return (
    <section className="mt-10 rounded-[28px] border border-black/10 bg-white p-6 sm:p-8">
      <h2 className="font-display text-3xl">{copy.title}</h2>
      <p className="mt-2 text-sm text-black/55">{copy.intro}</p>
      {error && !selection ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {copy.loading}
        </p>
      ) : !appointments.length ? (
        <p className="mt-5 text-sm text-black/55">{copy.empty}</p>
      ) : (
        <ul className="mt-5 divide-y divide-black/10">
          {appointments.map((appointment) => (
            <li
              key={`${appointment.id}:${appointment.occurrenceStartsAt}`}
              className="py-5 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{appointment.providerName}</h3>
                  <p className="mt-1 text-sm">
                    {formatTime(appointment.startsAt, appointment.timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-black/55">
                    {appointment.timeZone} · {copy[appointment.status]}
                  </p>
                  <p className="mt-2 text-xs text-black/55">
                    {appointment.canChange
                      ? copy.notice.replace(
                          "{hours}",
                          String(appointment.minimumNoticeHours),
                        )
                      : copy.locked}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!appointment.canReschedule || saving}
                    onClick={() => open(appointment, "reschedule")}
                  >
                    {copy.reschedule}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!appointment.canChange || saving}
                    onClick={() => open(appointment, "cancel")}
                  >
                    {copy.cancel}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!selection}
        onOpenChange={(value) => {
          if (!value && !saving) setSelection(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selection?.action === "cancel"
                ? copy.cancelTitle
                : copy.rescheduleTitle}
            </DialogTitle>
            <DialogDescription>
              {selection?.action === "cancel"
                ? copy.cancelBody
                : copy.rescheduleBody}
            </DialogDescription>
          </DialogHeader>
          {selection ? (
            <p className="text-sm font-semibold">
              {selection.appointment.providerName} ·{" "}
              {formatTime(
                selection.appointment.startsAt,
                selection.appointment.timeZone,
              )}
            </p>
          ) : null}
          {selection?.action === "reschedule" ? (
            loadingTimes ? (
              <p role="status" className="text-sm">
                {copy.loading}
              </p>
            ) : times.length ? (
              <div>
                <Label htmlFor="reschedule-time">{copy.chooseTime}</Label>
                <Select
                  value={selectedTime}
                  onValueChange={setSelectedTime}
                  disabled={saving}
                >
                  <SelectTrigger id="reschedule-time" className="mt-2 w-full">
                    <SelectValue placeholder={copy.chooseTime} />
                  </SelectTrigger>
                  <SelectContent>
                    {times.map((time) => (
                      <SelectItem key={time.startsAt} value={time.startsAt}>
                        {formatTime(
                          time.startsAt,
                          selection.appointment.timeZone,
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-black/55">
                  {selection.appointment.timeZone}
                </p>
              </div>
            ) : !error ? (
              <p className="text-sm">{copy.noTimes}</p>
            ) : null
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setSelection(null)}
            >
              {copy.back}
            </Button>
            <Button
              disabled={
                saving ||
                loadingTimes ||
                (selection?.action === "reschedule" && !selectedTime)
              }
              onClick={() => void save()}
            >
              {saving
                ? copy.saving
                : selection?.action === "cancel"
                  ? copy.confirmCancel
                  : copy.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
