"use client";

import type {
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import trLocale from "@fullcalendar/core/locales/tr";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import {
  CalendarPlus,
  ClipboardPaste,
  Clock3,
  Copy,
  GripVertical,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useLocale } from "next-intl";
import {
  FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { expandAvailabilityRule } from "@/lib/availability-recurrence";
import {
  deriveAvailabilitySlots,
  formatInTimeZone,
} from "@/lib/availability-window";
import {
  earliestAvailabilityLocal,
  previewAvailabilityWindow,
  zonedLocalDateTimeToUtc,
} from "@/lib/provider-availability";

import { useProviderWorkspace } from "./provider-shell";

type ProviderStudent = {
  id: string;
  displayName: string;
  email: string | null;
};

type CalendarAppointment = {
  id: string;
  appointmentId: string;
  occurrenceStartsAt: string;
  recurrence: "none" | "weekly";
  isException: boolean;
  providerStudentId: string | null;
  studentName: string;
  startsAt: string;
  endsAt: string;
  status: "pending" | "scheduled" | "declined" | "cancelled";
  comment: string | null;
  color: string;
};

type AvailabilityWindow = {
  id: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  recurrence: "none" | "weekly";
};

type SessionDraft = {
  entryType: "session" | "availability";
  appointmentId: string | null;
  availabilityWindowId: string | null;
  studentId: string;
  studentName: string;
  newStudentName: string;
  newStudentEmail: string;
  date: string;
  startsAt: string;
  endsAt: string;
  comment: string;
  status: "scheduled" | "cancelled";
  recurrence: "none" | "weekly";
  editScope: "exception" | "future";
  occurrenceStartsAt: string | null;
  color: string;
};

type CalendarContextTarget = {
  appointment?: CalendarAppointment;
  date: Date;
};

export type ProviderAppointmentsCopy = {
  eyebrow: string;
  title: string;
  addToTimetable: string;
  addType: string;
  studentSession: string;
  freeTimeWindow: string;
  availableSlot: string;
  freeTimeDescription: string;
  editFreeTime: string;
  editFreeTimeDescription: string;
  saveFreeTime: string;
  saveFreeTimeChanges: string;
  deleteFreeTime: string;
  deleteFreeTimeConfirm: string;
  freeTimePreview: string;
  generatedTimes: string;
  invalidFreeTime: string;
  manageStudents: string;
  manageStudentsDescription: string;
  editSession: string;
  addSessionDescription: string;
  editSessionDescription: string;
  student: string;
  newStudent: string;
  studentName: string;
  studentEmail: string;
  date: string;
  startsAt: string;
  endsAt: string;
  comment: string;
  commentPlaceholder: string;
  save: string;
  saving: string;
  updatingSession: string;
  dragHint: string;
  copySession: string;
  pasteSession: string;
  copyPasteHint: string;
  sessionCopied: string;
  pasteDayError: string;
  cancelSession: string;
  restoreSession: string;
  repetition: string;
  oneTime: string;
  everyWeek: string;
  editScope: string;
  thisSessionOnly: string;
  thisAndFutureSessions: string;
  deleteThisSession: string;
  deleteThisAndFutureSessions: string;
  deleteThisSessionConfirm: string;
  deleteThisAndFutureConfirm: string;
  sessionColor: string;
  editStudent: string;
  deleteStudent: string;
  deleteStudentConfirm: string;
  noStudents: string;
  cancelEdit: string;
  exceptionHelp: string;
  seriesHelp: string;
  emptyStudents: string;
  loadError: string;
  saveError: string;
};

const newStudentValue = "__new_student__";
const calendarPlugins = [timeGridPlugin, interactionPlugin];
const calendarLocales = [trLocale];
const calendarDayHeaderFormat = {
  weekday: "short" as const,
  day: "numeric" as const,
};
const calendarEventTimeFormat = {
  hour: "2-digit" as const,
  minute: "2-digit" as const,
  hour12: false,
};
const calendarHeaderToolbar = {
  left: "prev,next today",
  center: "title",
  right: "",
};

export function ProviderAppointments({
  copy,
}: {
  copy: ProviderAppointmentsCopy;
}) {
  const locale = useLocale() as "en" | "tr";
  const { accessToken, data } = useProviderWorkspace();
  const [students, setStudents] = useState<ProviderStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [studentsDialogOpen, setStudentsDialogOpen] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [studentSaving, setStudentSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calendarInteractionActive, setCalendarInteractionActive] =
    useState(false);
  const [interactionSaving, setInteractionSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [contextTarget, setContextTarget] =
    useState<CalendarContextTarget | null>(null);
  const [copiedAppointment, setCopiedAppointment] =
    useState<CalendarAppointment | null>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const timeZone = data.bookingPage.timeZone;
  const earliestAvailability = useMemo(
    () =>
      earliestAvailabilityLocal({
        now: new Date(),
        minimumNoticeHours: data.bookingPage.minimumNoticeHours,
        timeZone,
      }),
    [data.bookingPage.minimumNoticeHours, timeZone],
  );

  const loadCalendarEvents = useCallback(
    async (fetchInfo: EventSourceFuncArg): Promise<EventInput[]> => {
      setLoading(true);
      try {
        const startsAt = new Date(fetchInfo.start.getTime() - 86_400_000);
        const endsAt = new Date(fetchInfo.end.getTime() + 86_400_000);
        const [appointmentsResponse, windowsResponse] = await Promise.all([
          fetch(
            `/api/provider/appointments?startsAt=${encodeURIComponent(startsAt.toISOString())}&endsAt=${encodeURIComponent(endsAt.toISOString())}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            },
          ),
          fetch("/api/availability-windows", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }),
        ]);

        if (!appointmentsResponse.ok || !windowsResponse.ok) {
          throw new Error(copy.loadError);
        }
        const appointmentsBody = (await appointmentsResponse.json()) as {
          appointments: CalendarAppointment[];
        };
        const windowsBody = (await windowsResponse.json()) as {
          windows: AvailabilityWindow[];
        };

        setError("");
        return [
          ...availabilityToCalendarEvents(
            windowsBody.windows,
            appointmentsBody.appointments,
            { startsAt, endsAt },
            timeZone,
            {
              durationMinutes: data.bookingPage.appointmentDurationMinutes,
              intervalMinutes: data.bookingPage.bookingIntervalMinutes,
              title: copy.availableSlot,
            },
          ),
          ...appointmentsBody.appointments
            .filter(
              ({ status }) => status === "scheduled" || status === "cancelled",
            )
            .map((appointment) =>
              appointmentToCalendarEvent(appointment, timeZone, {
                oneTime: copy.oneTime,
                weekly: copy.everyWeek,
              }),
            ),
        ];
      } catch {
        setError(copy.loadError);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [
      accessToken,
      copy.availableSlot,
      copy.everyWeek,
      copy.loadError,
      copy.oneTime,
      data.bookingPage.appointmentDurationMinutes,
      data.bookingPage.bookingIntervalMinutes,
      timeZone,
    ],
  );

  const loadStudents = useCallback(async () => {
    const response = await fetch("/api/provider/students", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const body = (await response.json()) as { students: ProviderStudent[] };
    setStudents(body.students);
  }, [accessToken]);

  useEffect(() => {
    async function initializeStudents() {
      await loadStudents();
    }

    void initializeStudents();
  }, [loadStudents]);

  const openNewSession = useCallback(
    (date = nextRoundedHour(timeZone)) => {
      const local = localDateTime(date);
      const end = new Date(
        date.getTime() + data.bookingPage.appointmentDurationMinutes * 60_000,
      );
      const localEnd = localDateTime(end);
      setDraft({
        entryType: "session",
        appointmentId: null,
        availabilityWindowId: null,
        studentId: students[0]?.id ?? newStudentValue,
        studentName: "",
        newStudentName: "",
        newStudentEmail: "",
        date: local.date,
        startsAt: local.time,
        endsAt: localEnd.time,
        comment: "",
        status: "scheduled",
        recurrence: "weekly",
        editScope: "exception",
        occurrenceStartsAt: null,
        color: "#f0d7ff",
      });
      setError("");
      setDialogOpen(true);
    },
    [data.bookingPage.appointmentDurationMinutes, students, timeZone],
  );

  const freeTimePreview = useMemo(() => {
    if (!draft || draft.entryType !== "availability") {
      return null;
    }
    try {
      return previewAvailabilityWindow({
        date: draft.date,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        timeZone,
        durationMinutes: data.bookingPage.appointmentDurationMinutes,
        intervalMinutes: data.bookingPage.bookingIntervalMinutes,
      });
    } catch {
      return null;
    }
  }, [data.bookingPage, draft, timeZone]);

  const handleDateClick = useCallback(
    (info: DateClickArg) => {
      if (!info.allDay) openNewSession(info.date);
    },
    [openNewSession],
  );

  function handleCalendarContextMenu(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const eventElement = target?.closest<HTMLElement>(
      "[data-calendar-event-id]",
    );
    const calendarEvent = eventElement
      ? calendarRef.current
          ?.getApi()
          .getEventById(eventElement.dataset.calendarEventId!)
      : null;
    const appointment = calendarEvent?.extendedProps.appointment as
      CalendarAppointment | undefined;
    const date =
      calendarEvent?.start ??
      calendarTimeAtPointer(
        event.currentTarget,
        target,
        event.clientX,
        event.clientY,
      );

    if (
      !date ||
      loading ||
      saving ||
      interactionSaving ||
      calendarInteractionActive
    ) {
      setContextTarget(null);
      // Leave the native menu available on headers and toolbar controls.
      event.stopPropagation();
      return;
    }

    setContextTarget({ appointment, date });
  }

  function pasteSession() {
    if (!copiedAppointment || !contextTarget || contextTarget.appointment)
      return;

    try {
      const startsAt = calendarWallTimeToUtc(contextTarget.date, timeZone);
      const duration =
        new Date(copiedAppointment.endsAt).getTime() -
        new Date(copiedAppointment.startsAt).getTime();
      const start = splitProviderDateTime(startsAt.toISOString(), timeZone);
      const end = splitProviderDateTime(
        new Date(startsAt.getTime() + duration).toISOString(),
        timeZone,
      );
      if (start.date !== end.date) throw new Error(copy.pasteDayError);

      const student = students.find(
        ({ id }) => id === copiedAppointment.providerStudentId,
      );
      setDraft({
        entryType: "session",
        appointmentId: null,
        availabilityWindowId: null,
        studentId: student?.id ?? newStudentValue,
        studentName: copiedAppointment.studentName,
        newStudentName: student ? "" : copiedAppointment.studentName,
        newStudentEmail: "",
        date: start.date,
        startsAt: start.time,
        endsAt: end.time,
        comment: copiedAppointment.comment ?? "",
        status: "scheduled",
        recurrence: copiedAppointment.isException
          ? "none"
          : copiedAppointment.recurrence,
        editScope: "exception",
        occurrenceStartsAt: null,
        color: copiedAppointment.color,
      });
      setError("");
      setDialogOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    }
  }

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const availabilityWindow = info.event.extendedProps.availabilityWindow as
        AvailabilityWindow | undefined;
      const availabilityOccurrence = info.event.extendedProps
        .availabilityOccurrence as
        { startsAt: string; endsAt: string } | undefined;

      if (availabilityWindow && availabilityOccurrence) {
        const startsAt = splitProviderDateTime(
          availabilityOccurrence.startsAt,
          timeZone,
        );
        const endsAt = splitProviderDateTime(
          availabilityOccurrence.endsAt,
          timeZone,
        );
        setDraft({
          entryType: "availability",
          appointmentId: null,
          availabilityWindowId: availabilityWindow.id,
          studentId: "",
          studentName: "",
          newStudentName: "",
          newStudentEmail: "",
          date: startsAt.date,
          startsAt: startsAt.time,
          endsAt: endsAt.time,
          comment: "",
          status: "scheduled",
          recurrence: availabilityWindow.recurrence,
          editScope: "future",
          occurrenceStartsAt: availabilityOccurrence.startsAt,
          color: "#dff3e4",
        });
        setError("");
        setDialogOpen(true);
        return;
      }

      const appointment = info.event.extendedProps.appointment as
        CalendarAppointment | undefined;
      if (
        !appointment ||
        (appointment.status !== "scheduled" &&
          appointment.status !== "cancelled")
      ) {
        return;
      }
      const startsAt = splitProviderDateTime(appointment.startsAt, timeZone);
      const endsAt = splitProviderDateTime(appointment.endsAt, timeZone);
      setDraft({
        entryType: "session",
        appointmentId: appointment.appointmentId,
        availabilityWindowId: null,
        studentId: appointment.providerStudentId ?? "",
        studentName: appointment.studentName,
        newStudentName: "",
        newStudentEmail: "",
        date: startsAt.date,
        startsAt: startsAt.time,
        endsAt: endsAt.time,
        comment: appointment.comment ?? "",
        status: appointment.status,
        recurrence: appointment.recurrence,
        editScope: "exception",
        occurrenceStartsAt: appointment.occurrenceStartsAt,
        color: appointment.color,
      });
      setError("");
      setDialogOpen(true);
    },
    [timeZone],
  );

  const handleCalendarEventChange = useCallback(
    async (info: EventDropArg | EventResizeDoneArg) => {
      const appointment = info.oldEvent.extendedProps.appointment as
        CalendarAppointment | undefined;
      const start = info.event.start;
      const end = info.event.end;

      if (
        !appointment ||
        appointment.status !== "scheduled" ||
        !start ||
        !end
      ) {
        info.revert();
        return;
      }

      setInteractionSaving(true);
      setError("");

      try {
        const startsAt = calendarWallTimeToUtc(start, timeZone);
        const endsAt = calendarWallTimeToUtc(end, timeZone);
        const response = await fetch(
          `/api/provider/appointments/${appointment.appointmentId}`,
          {
            method: "PATCH",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              editScope: "exception",
              ...(appointment.recurrence === "weekly"
                ? { occurrenceStartsAt: appointment.occurrenceStartsAt }
                : {}),
            }),
          },
        );

        if (!response.ok) throw new Error(await responseError(response));

        calendarRef.current?.getApi().refetchEvents();
      } catch (caught) {
        info.revert();
        setError(caught instanceof Error ? caught.message : copy.saveError);
      } finally {
        setInteractionSaving(false);
      }
    },
    [accessToken, copy.saveError, timeZone],
  );

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError("");

    try {
      const startsAt = zonedLocalDateTimeToUtc(
        draft.date,
        draft.startsAt,
        timeZone,
      );
      const endsAt = zonedLocalDateTimeToUtc(
        draft.date,
        draft.endsAt,
        timeZone,
      );

      if (draft.entryType === "availability") {
        if (!freeTimePreview?.slots.length) {
          throw new Error(copy.invalidFreeTime);
        }
        const response = await fetch(
          draft.availabilityWindowId
            ? `/api/availability-windows/${draft.availabilityWindowId}`
            : "/api/availability-windows",
          {
            method: draft.availabilityWindowId ? "PATCH" : "POST",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              recurrence: draft.recurrence,
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response));

        calendarRef.current?.getApi().refetchEvents();
        setDialogOpen(false);
        return;
      }

      if (draft.appointmentId) {
        const response = await fetch(
          `/api/provider/appointments/${draft.appointmentId}`,
          {
            method: "PATCH",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              comment: draft.comment || null,
              status: draft.status,
              color: draft.color,
              editScope: draft.editScope,
              occurrenceStartsAt: draft.occurrenceStartsAt,
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response));
      } else {
        let providerStudentId = draft.studentId;
        if (providerStudentId === newStudentValue) {
          const studentResponse = await fetch("/api/provider/students", {
            method: "POST",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              displayName: draft.newStudentName,
              email: draft.newStudentEmail || undefined,
            }),
          });
          if (!studentResponse.ok) {
            throw new Error(await responseError(studentResponse));
          }
          const studentBody = (await studentResponse.json()) as {
            student: ProviderStudent;
          };
          providerStudentId = studentBody.student.id;
          setStudents((current) =>
            current.some(({ id }) => id === studentBody.student.id)
              ? current
              : [...current, studentBody.student].sort((first, second) =>
                  first.displayName.localeCompare(second.displayName),
                ),
          );
        }

        const response = await fetch("/api/provider/appointments", {
          method: "POST",
          headers: authenticatedJsonHeaders(accessToken),
          body: JSON.stringify({
            providerStudentId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            comment: draft.comment || undefined,
            recurrence: draft.recurrence,
            color: draft.color,
          }),
        });
        if (!response.ok) throw new Error(await responseError(response));
      }

      calendarRef.current?.getApi().refetchEvents();
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCancellation() {
    if (!draft?.appointmentId) return;
    setDraft({
      ...draft,
      status: draft.status === "scheduled" ? "cancelled" : "scheduled",
    });
  }

  async function deleteSession() {
    if (!draft?.appointmentId || !draft.occurrenceStartsAt) return;
    const deleteFuture =
      draft.recurrence === "weekly" && draft.editScope === "future";
    if (
      !window.confirm(
        deleteFuture
          ? copy.deleteThisAndFutureConfirm
          : copy.deleteThisSessionConfirm,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/provider/appointments/${draft.appointmentId}`,
        {
          method: "DELETE",
          headers: authenticatedJsonHeaders(accessToken),
          body: JSON.stringify({
            deleteScope: deleteFuture ? "future" : "occurrence",
            occurrenceStartsAt: draft.occurrenceStartsAt,
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));

      calendarRef.current?.getApi().refetchEvents();
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAvailableTime() {
    if (!draft?.availabilityWindowId) return;
    if (!window.confirm(copy.deleteFreeTimeConfirm)) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/availability-windows/${draft.availabilityWindowId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) throw new Error(await responseError(response));

      calendarRef.current?.getApi().refetchEvents();
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  function beginStudentEdit(student: ProviderStudent) {
    setEditingStudentId(student.id);
    setStudentName(student.displayName);
    setStudentEmail(student.email ?? "");
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStudentId) return;
    setStudentSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/provider/students/${editingStudentId}`,
        {
          method: "PATCH",
          headers: authenticatedJsonHeaders(accessToken),
          body: JSON.stringify({
            displayName: studentName,
            email: studentEmail,
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      await loadStudents();
      calendarRef.current?.getApi().refetchEvents();
      setEditingStudentId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setStudentSaving(false);
    }
  }

  async function deleteStudent(student: ProviderStudent) {
    if (
      !window.confirm(
        copy.deleteStudentConfirm.replace("{name}", student.displayName),
      )
    ) {
      return;
    }
    setError("");
    const response = await fetch(`/api/provider/students/${student.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      setError(await responseError(response));
      return;
    }
    await loadStudents();
    calendarRef.current?.getApi().refetchEvents();
    if (editingStudentId === student.id) setEditingStudentId(null);
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-160 flex-col lg:h-[calc(100dvh-5rem)]">
      <header className="mb-4 flex shrink-0 items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-[0.16em] text-black/45 uppercase">
            {copy.eyebrow}
          </p>
          <h1 className="mt-1 font-display text-4xl tracking-[-0.04em] sm:text-5xl">
            {copy.title.replace("{name}", data.profile.displayName)}
          </h1>
          <div className="mt-2 flex gap-3 text-[10px] font-bold text-black/50">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#56a46f]" />
              {copy.freeTimeWindow}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#7859d6]" />
              {copy.studentSession}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs text-black/45">
            {copy.dragHint} {copy.copyPasteHint}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            className="min-h-11 rounded-full"
            onClick={() => setStudentsDialogOpen(true)}
            variant="outline"
          >
            <Users size={17} /> {copy.manageStudents}
          </Button>
          <Button
            className="min-h-11 rounded-full bg-vast-ink px-5 font-bold text-white"
            onClick={() => openNewSession()}
          >
            <CalendarPlus size={17} /> {copy.addToTimetable}
          </Button>
        </div>
      </header>

      {error && !dialogOpen ? (
        <p className="mb-3 rounded-xl bg-ember-glow px-4 py-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}

      {copiedAppointment ? (
        <p role="status" className="mb-3 text-xs font-semibold text-black/60">
          {copy.sessionCopied.replace("{name}", copiedAppointment.studentName)}
        </p>
      ) : null}

      <ContextMenu modal={false}>
        <section
          aria-busy={loading || interactionSaving}
          className={`provider-calendar relative min-h-0 flex-1 overflow-x-auto rounded-[24px] border border-black/10 bg-[#fbfaf4] p-3 shadow-sm sm:p-4 ${calendarInteractionActive ? "provider-calendar-interacting" : ""}`}
        >
          {loading || interactionSaving ? (
            <span
              aria-live="polite"
              className="absolute top-4 right-4 z-10 flex min-h-9 items-center gap-2 rounded-full bg-lavender-whisper px-3 text-xs font-bold shadow-sm"
              role="status"
            >
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                size={16}
              />
              {interactionSaving ? copy.updatingSession : null}
            </span>
          ) : null}
          <ContextMenuTrigger
            asChild
            disabled={loading || saving || interactionSaving}
          >
            <div
              className="h-full min-w-190"
              onContextMenuCapture={handleCalendarContextMenu}
              onPointerDownCapture={(event) => {
                if (event.pointerType === "touch")
                  handleCalendarContextMenu(event);
              }}
            >
              <FullCalendar
                allDaySlot={false}
                dateClick={handleDateClick}
                dayHeaderFormat={calendarDayHeaderFormat}
                eventClick={handleEventClick}
                eventContent={renderSession}
                eventDidMount={(info) => {
                  info.el.dataset.calendarEventId = info.event.id;
                }}
                eventDragStart={() => setCalendarInteractionActive(true)}
                eventDragStop={() => setCalendarInteractionActive(false)}
                eventDrop={handleCalendarEventChange}
                eventResizeStart={() => setCalendarInteractionActive(true)}
                eventResizeStop={() => setCalendarInteractionActive(false)}
                eventResize={handleCalendarEventChange}
                eventAllow={() => !interactionSaving}
                eventMinHeight={34}
                eventTimeFormat={calendarEventTimeFormat}
                events={loadCalendarEvents}
                expandRows
                firstDay={1}
                headerToolbar={calendarHeaderToolbar}
                height="100%"
                initialView="timeGridWeek"
                locale={locale}
                locales={calendarLocales}
                nowIndicator
                plugins={calendarPlugins}
                ref={calendarRef}
                scrollTime="08:00:00"
                snapDuration="00:15:00"
                slotDuration="00:30:00"
                slotMaxTime="22:00:00"
                slotMinTime="07:00:00"
                timeZone="local"
              />
            </div>
          </ContextMenuTrigger>
        </section>
        <ContextMenuContent
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ContextMenuItem
            disabled={!contextTarget?.appointment}
            onSelect={() => {
              if (contextTarget?.appointment) {
                setCopiedAppointment({ ...contextTarget.appointment });
                setError("");
              }
            }}
          >
            <Copy aria-hidden="true" /> {copy.copySession}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={
              !copiedAppointment ||
              !contextTarget ||
              !!contextTarget.appointment
            }
            onSelect={pasteSession}
          >
            <ClipboardPaste aria-hidden="true" /> {copy.pasteSession}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          {draft ? (
            <form onSubmit={saveSession}>
              <DialogHeader>
                <DialogTitle className="font-display text-3xl">
                  {draft.availabilityWindowId
                    ? copy.editFreeTime
                    : draft.appointmentId
                      ? copy.editSession
                      : copy.addToTimetable}
                </DialogTitle>
                <DialogDescription>
                  {draft.availabilityWindowId
                    ? copy.editFreeTimeDescription
                    : draft.appointmentId
                      ? copy.editSessionDescription
                      : draft.entryType === "availability"
                        ? copy.freeTimeDescription
                        : copy.addSessionDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {!draft.appointmentId && !draft.availabilityWindowId ? (
                  <Field className="sm:col-span-2" label={copy.addType}>
                    <Select
                      onValueChange={(entryType) =>
                        setDraft(
                          entryType === "availability"
                            ? {
                                ...draft,
                                entryType: "availability",
                                ...freeTimeDefaults(
                                  earliestAvailability,
                                  timeZone,
                                ),
                              }
                            : { ...draft, entryType: "session" },
                        )
                      }
                      value={draft.entryType}
                    >
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session">
                          {copy.studentSession}
                        </SelectItem>
                        <SelectItem value="availability">
                          {copy.freeTimeWindow}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                {draft.appointmentId ? (
                  <Field label={copy.student}>
                    <div className="flex min-h-11 items-center rounded-xl border border-black/10 bg-black/3 px-3 text-sm font-semibold">
                      {draft.studentName}
                    </div>
                  </Field>
                ) : draft.entryType === "session" ? (
                  <Field label={copy.student}>
                    <Select
                      onValueChange={(studentId) =>
                        setDraft({ ...draft, studentId })
                      }
                      value={draft.studentId}
                    >
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue placeholder={copy.emptyStudents} />
                      </SelectTrigger>
                      <SelectContent>
                        {students.map((student) => (
                          <SelectItem key={student.id} value={student.id}>
                            {student.displayName}
                          </SelectItem>
                        ))}
                        <SelectItem value={newStudentValue}>
                          {copy.newStudent}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                {!draft.appointmentId &&
                draft.entryType === "session" &&
                draft.studentId === newStudentValue ? (
                  <>
                    <Field label={copy.studentName}>
                      <Input
                        className="min-h-11 rounded-xl"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            newStudentName: event.target.value,
                          })
                        }
                        required
                        value={draft.newStudentName}
                      />
                    </Field>
                    <Field label={copy.studentEmail}>
                      <Input
                        className="min-h-11 rounded-xl"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            newStudentEmail: event.target.value,
                          })
                        }
                        type="email"
                        value={draft.newStudentEmail}
                      />
                    </Field>
                  </>
                ) : null}

                <Field label={copy.date}>
                  <Input
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      setDraft({ ...draft, date: event.target.value })
                    }
                    required
                    min={
                      draft.entryType === "availability"
                        ? earliestAvailability.date
                        : undefined
                    }
                    type="date"
                    value={draft.date}
                  />
                </Field>
                <Field label={copy.startsAt}>
                  <Input
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      setDraft({ ...draft, startsAt: event.target.value })
                    }
                    required
                    min={
                      draft.entryType === "availability" &&
                      draft.date === earliestAvailability.date
                        ? earliestAvailability.time
                        : undefined
                    }
                    type="time"
                    value={draft.startsAt}
                  />
                </Field>
                <Field label={copy.endsAt}>
                  <Input
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      setDraft({ ...draft, endsAt: event.target.value })
                    }
                    required
                    type="time"
                    value={draft.endsAt}
                  />
                </Field>
                {!draft.appointmentId ? (
                  <Field label={copy.repetition}>
                    <Select
                      onValueChange={(recurrence) =>
                        setDraft({
                          ...draft,
                          recurrence: recurrence as "none" | "weekly",
                        })
                      }
                      value={draft.recurrence}
                    >
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{copy.oneTime}</SelectItem>
                        <SelectItem value="weekly">{copy.everyWeek}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : draft.recurrence === "weekly" ? (
                  <Field label={copy.editScope}>
                    <Select
                      onValueChange={(editScope) =>
                        setDraft({
                          ...draft,
                          editScope: editScope as "exception" | "future",
                        })
                      }
                      value={draft.editScope}
                    >
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exception">
                          {copy.thisSessionOnly}
                        </SelectItem>
                        <SelectItem value="future">
                          {copy.thisAndFutureSessions}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                {draft.entryType === "session" ? (
                  <>
                    <Field label={copy.sessionColor}>
                      <div className="flex min-h-11 items-center gap-3 rounded-xl border border-black/10 bg-white px-3">
                        <Input
                          aria-label={copy.sessionColor}
                          className="h-8 w-12 cursor-pointer border-0 p-0"
                          onChange={(event) =>
                            setDraft({ ...draft, color: event.target.value })
                          }
                          type="color"
                          value={draft.color}
                        />
                        <span className="font-mono text-xs font-semibold">
                          {draft.color.toUpperCase()}
                        </span>
                      </div>
                    </Field>
                    <Field className="sm:col-span-2" label={copy.comment}>
                      <Textarea
                        className="min-h-24 rounded-xl"
                        onChange={(event) =>
                          setDraft({ ...draft, comment: event.target.value })
                        }
                        placeholder={copy.commentPlaceholder}
                        value={draft.comment}
                      />
                    </Field>
                  </>
                ) : null}
              </div>

              {draft.entryType === "availability" ? (
                <div className="mt-4 rounded-xl bg-[#dff3e4] px-4 py-3 text-xs text-[#245e37]">
                  <p className="font-bold">{copy.freeTimePreview}</p>
                  {freeTimePreview?.slots.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="w-full font-semibold">
                        {freeTimePreview.slots.length} {copy.generatedTimes}
                      </span>
                      {freeTimePreview.slots.map((slot) => (
                        <span
                          className="rounded-full border border-[#56a46f]/40 bg-white/60 px-2.5 py-1 font-semibold"
                          key={slot.startsAt.toISOString()}
                        >
                          {formatProviderTime(slot.startsAt, locale, timeZone)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1">{copy.invalidFreeTime}</p>
                  )}
                </div>
              ) : null}

              {draft.appointmentId ? (
                <p className="mt-4 rounded-xl bg-lavender-whisper px-4 py-3 text-xs leading-5">
                  {draft.editScope === "future"
                    ? copy.seriesHelp
                    : copy.exceptionHelp}
                </p>
              ) : null}
              {error ? (
                <p className="mt-4 rounded-xl bg-ember-glow px-4 py-3 text-xs font-semibold">
                  {error}
                </p>
              ) : null}

              <DialogFooter className="mt-6 -mx-4 -mb-4">
                {draft.availabilityWindowId ? (
                  <div className="mr-auto">
                    <Button
                      disabled={saving}
                      onClick={() => void deleteAvailableTime()}
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 size={15} />
                      {copy.deleteFreeTime}
                    </Button>
                  </div>
                ) : draft.appointmentId ? (
                  <div className="mr-auto flex flex-wrap gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => void deleteSession()}
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 size={15} />
                      {draft.recurrence === "weekly" &&
                      draft.editScope === "future"
                        ? copy.deleteThisAndFutureSessions
                        : copy.deleteThisSession}
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={toggleCancellation}
                      type="button"
                      variant="outline"
                    >
                      {draft.status === "scheduled" ? (
                        copy.cancelSession
                      ) : (
                        <>
                          <RotateCcw size={15} /> {copy.restoreSession}
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
                <Button disabled={saving} type="submit">
                  {saving ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : draft.entryType === "availability" ? (
                    <Clock3 size={16} />
                  ) : draft.studentId === newStudentValue ? (
                    <UserPlus size={16} />
                  ) : (
                    <CalendarPlus size={16} />
                  )}
                  {saving
                    ? copy.saving
                    : draft.entryType === "availability"
                      ? draft.availabilityWindowId
                        ? copy.saveFreeTimeChanges
                        : copy.saveFreeTime
                      : copy.save}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={studentsDialogOpen} onOpenChange={setStudentsDialogOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-3xl">
              {copy.manageStudents}
            </DialogTitle>
            <DialogDescription>
              {copy.manageStudentsDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-3">
            {students.length ? (
              students.map((student) =>
                editingStudentId === student.id ? (
                  <form
                    className="rounded-2xl border border-black/10 bg-lavender-whisper/40 p-4"
                    key={student.id}
                    onSubmit={saveStudent}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={copy.studentName}>
                        <Input
                          onChange={(event) =>
                            setStudentName(event.target.value)
                          }
                          required
                          value={studentName}
                        />
                      </Field>
                      <Field label={copy.studentEmail}>
                        <Input
                          onChange={(event) =>
                            setStudentEmail(event.target.value)
                          }
                          type="email"
                          value={studentEmail}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        onClick={() => setEditingStudentId(null)}
                        type="button"
                        variant="outline"
                      >
                        {copy.cancelEdit}
                      </Button>
                      <Button disabled={studentSaving} type="submit">
                        {studentSaving ? copy.saving : copy.save}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div
                    className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-4"
                    key={student.id}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lavender-whisper font-bold">
                      {student.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {student.displayName}
                      </p>
                      <p className="truncate text-xs text-black/50">
                        {student.email ?? "—"}
                      </p>
                    </div>
                    <Button
                      aria-label={copy.editStudent}
                      onClick={() => beginStudentEdit(student)}
                      size="icon"
                      variant="outline"
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      aria-label={copy.deleteStudent}
                      onClick={() => void deleteStudent(student)}
                      size="icon"
                      variant="outline"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ),
              )
            ) : (
              <p className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/45">
                {copy.noStudents}
              </p>
            )}
          </div>
          {error ? (
            <p className="mt-4 rounded-xl bg-ember-glow px-4 py-3 text-xs font-semibold">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 text-xs font-bold text-black/55">{label}</Label>
      {children}
    </div>
  );
}

function renderSession(info: EventContentArg) {
  if (info.event.extendedProps.availabilitySlot) {
    return (
      <div className="overflow-hidden px-1 py-0.5 leading-tight">
        <p className="truncate text-[9px] font-bold opacity-75">
          {info.timeText}
        </p>
        <p className="truncate text-[11px] font-extrabold">
          {info.event.title}
        </p>
      </div>
    );
  }

  const appointment = info.event.extendedProps.appointment as
    CalendarAppointment | undefined;
  if (!appointment) return null;

  const recurrenceLabel = info.event.extendedProps.recurrenceLabel as string;
  const isDraggable = appointment.status === "scheduled";

  return (
    <div className="flex min-w-0 items-start gap-0.5 overflow-hidden px-1 py-0.5 leading-tight">
      {isDraggable ? (
        <GripVertical
          aria-hidden="true"
          className="provider-session-drag-handle mt-0.5 size-3 shrink-0 opacity-55"
          strokeWidth={2.5}
        />
      ) : null}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="flex gap-1 truncate text-[9px] font-bold opacity-80">
          <span>{info.timeText}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{recurrenceLabel}</span>
        </p>
        <p className="truncate text-[11px] font-bold">
          {appointment.studentName}
        </p>
      </div>
    </div>
  );
}

function appointmentToCalendarEvent(
  appointment: CalendarAppointment,
  timeZone: string,
  labels: { oneTime: string; weekly: string },
): EventInput {
  return {
    id: appointment.id,
    title: appointment.studentName,
    start: formatInTimeZone(new Date(appointment.startsAt), timeZone),
    end: formatInTimeZone(new Date(appointment.endsAt), timeZone),
    editable: appointment.status === "scheduled",
    classNames:
      appointment.status === "cancelled"
        ? ["provider-session-cancelled"]
        : appointment.status === "scheduled"
          ? ["provider-session-scheduled", "provider-session-draggable"]
          : ["provider-session-scheduled"],
    backgroundColor: appointment.color,
    borderColor: readableBorderColor(appointment.color),
    textColor: readableTextColor(appointment.color),
    extendedProps: {
      appointment,
      recurrenceLabel:
        appointment.recurrence === "weekly" && !appointment.isException
          ? labels.weekly
          : labels.oneTime,
    },
  };
}

function availabilityToCalendarEvents(
  windows: AvailabilityWindow[],
  appointments: CalendarAppointment[],
  range: { startsAt: Date; endsAt: Date },
  timeZone: string,
  config: {
    durationMinutes: number;
    intervalMinutes: number;
    title: string;
  },
): EventInput[] {
  return windows.flatMap((window) =>
    expandAvailabilityRule(
      {
        ...window,
        startsAt: new Date(window.startsAt),
        endsAt: new Date(window.endsAt),
        isActive: window.isActive,
      },
      range,
      timeZone,
    ).flatMap((occurrence) => {
      let slotIndex = 0;
      return deriveAvailabilitySlots(
        occurrence,
        config.durationMinutes,
        config.intervalMinutes,
        () => `${occurrence.id}:${slotIndex++}`,
      )
        .filter(
          (slot) =>
            !appointments.some(
              (appointment) =>
                (appointment.status === "scheduled" ||
                  appointment.status === "pending") &&
                new Date(appointment.startsAt) < slot.endsAt &&
                new Date(appointment.endsAt) > slot.startsAt,
            ),
        )
        .map((slot) => ({
          id: `availability:${slot.id}`,
          title: config.title,
          start: formatInTimeZone(slot.startsAt, timeZone),
          end: formatInTimeZone(slot.endsAt, timeZone),
          editable: false,
          backgroundColor: "#dff3e4",
          borderColor: "#56a46f",
          textColor: "#174b2a",
          classNames: ["provider-availability-window"],
          extendedProps: {
            availabilityWindowId: window.id,
            availabilitySlot: true,
            availabilityWindow: window,
            availabilityOccurrence: {
              startsAt: occurrence.startsAt.toISOString(),
              endsAt: occurrence.endsAt.toISOString(),
            },
          },
        }));
    }),
  );
}

export function readableTextColor(background: string) {
  const [red, green, blue] = [1, 3, 5].map((index) =>
    Number.parseInt(background.slice(index, index + 2), 16),
  );
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 145 ? "#1a1a1a" : "#ffffff";
}

function readableBorderColor(background: string) {
  return readableTextColor(background) === "#ffffff" ? "#ffffff" : "#1a1a1a";
}

function formatProviderTime(date: Date, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function authenticatedJsonHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? "Unable to save the session";
}

function nextRoundedHour(timeZone: string) {
  const date = new Date(formatInTimeZone(new Date(), timeZone));
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

function freeTimeDefaults(
  earliest: { date: string; time: string },
  timeZone: string,
) {
  if (earliest.time > "20:00") {
    return {
      date: addLocalDays(earliest.date, 1),
      startsAt: "09:00",
      endsAt: "12:00",
    };
  }
  const startsAt = zonedLocalDateTimeToUtc(
    earliest.date,
    earliest.time,
    timeZone,
  );
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
  const start = splitProviderDateTime(startsAt.toISOString(), timeZone);
  const end = splitProviderDateTime(endsAt.toISOString(), timeZone);

  return { date: start.date, startsAt: start.time, endsAt: end.time };
}

function addLocalDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}`;
}

function localDateTime(date: Date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function calendarWallTimeToUtc(date: Date, timeZone: string) {
  const local = localDateTime(date);
  return zonedLocalDateTimeToUtc(local.date, local.time, timeZone);
}

function calendarTimeAtPointer(
  calendar: HTMLElement,
  target: Element | null,
  clientX: number,
  clientY: number,
): Date | null {
  const dayColumn =
    target?.closest<HTMLElement>(".fc-timegrid-col[data-date]") ??
    (target?.closest(".fc-timegrid-slots")
      ? Array.from(
          calendar.querySelectorAll<HTMLElement>(".fc-timegrid-col[data-date]"),
        ).find((column) => {
          const bounds = column.getBoundingClientRect();
          return clientX >= bounds.left && clientX < bounds.right;
        })
      : null);
  const day = dayColumn?.dataset.date;
  if (!day) return null;

  // Day columns and time rows are separate, overlaid FullCalendar tables.
  // Use viewport bounds so scrolling and different row heights stay accurate.
  const rows = calendar.querySelectorAll<HTMLElement>(
    ".fc-timegrid-slot-lane[data-time]",
  );
  for (const row of rows) {
    const bounds = row.getBoundingClientRect();
    if (bounds.height <= 0 || clientY < bounds.top || clientY >= bounds.bottom)
      continue;
    const [hours, minutes] = row.dataset.time!.split(":").map(Number);
    const snappedMinutes =
      hours * 60 +
      minutes +
      Math.floor(((clientY - bounds.top) / bounds.height) * 2) * 15;
    return new Date(
      `${day}T${pad(Math.floor(snappedMinutes / 60))}:${pad(snappedMinutes % 60)}:00`,
    );
  }
  return null;
}

function splitProviderDateTime(value: string, timeZone: string) {
  const [date, time] = formatInTimeZone(new Date(value), timeZone).split("T");
  return { date, time: time.slice(0, 5) };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
