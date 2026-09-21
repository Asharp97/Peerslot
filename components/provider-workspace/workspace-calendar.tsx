"use client";

import { JoinMeeting, ProviderAppointmentMeeting, type AppointmentMeetingCopy } from "@/components/appointment-meeting";


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
  RotateCcw,
  Trash2,
  UserPlus,
  Coffee,
  RefreshCw,
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
import { expandAvailableSlots, type CalendarMoves } from "@/lib/calendar-moves";
import { expandAvailabilityRule } from "@/lib/availability-recurrence";
import { formatInTimeZone } from "@/lib/availability-window";
import {
  earliestAvailabilityLocal,
  previewAvailabilityWindow,
  zonedLocalDateTimeToUtc,
} from "@/lib/provider-availability";

import {
  personalActivityColor,
  type PersonalActivityName,
  type PersonalActivityOccurrence,
} from "@/lib/personal-activity";

import { personalActivityEndTime } from "@/lib/personal-activity-time";

import {
  CalendarCreatePopover,
  type CalendarCreateAnchor,
  type CalendarCreatePopoverCopy,
} from "./calendar-create-popover";

import { useProviderWorkspace } from "./provider-shell";
import {
  attendingAppointmentToEvent,
  type AttendingAppointment,
} from "@/lib/attending-appointment";

type ProviderStudent = {
  id: string;
  displayName: string;
  email: string | null;
};

type CalendarAppointment = {
  meetingUrl?: string | null;
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
  moves?: CalendarMoves;
  id: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  recurrence: "none" | "weekly";
};

type SessionDraft = {
  meetingUrl?: string | null;
  movedOriginalStartsAt?: string;
  entryType: "session" | "availability" | "personal";
  activityId?: string;
  activityScheduleId?: string;
  newActivityName?: string;
  newActivityDuration?: string;
  activityDurationMinutes?: number | null;
  endDate?: string;
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

export type WorkspaceCalendarCopy = CalendarCreatePopoverCopy & {
  meeting: AppointmentMeetingCopy;
  attendingSession: string;
  attendingWith: string;
  attendingDescription: string;
  attendingConfirmed: string;
  attendingLoadError: string;
  manageAttending: string;
  refreshCalendar: string;
  eyebrow: string;
  title: string;
  addToTimetable: string;
  addType: string;
  studentSession: string;
  freeTimeWindow: string;
  personalActivity: string;
  activityName: string;
  newActivity: string;
  newActivityName: string;
  activityDescription: string;
  activityDurationLabel: string;
  activityDurationHelp: string;
  activityDurationApplied: string;
  editActivity: string;
  activitySeriesHelp: string;
  saveActivity: string;
  deleteActivity: string;
  deleteActivityConfirm: string;
  activityTimeError: string;
  activityNameConflict: string;
  activityNotFound: string;
  activitySaveError: string;
  endDate: string;
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
  movedOccurrenceHelp: string;
  deleteMovedBlock: string;
  deleteMovedBlockConfirm: string;
  calendarBlockMissing: string;
  calendarBlockConflict: string;
  calendarBlockPast: string;
  calendarBlockInvalid: string;
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
  pendingRequest: string;
  editScope: string;
  thisSessionOnly: string;
  thisAndFutureSessions: string;
  deleteThisSession: string;
  deleteThisAndFutureSessions: string;
  deleteThisSessionConfirm: string;
  deleteThisAndFutureConfirm: string;
  sessionColor: string;
  exceptionHelp: string;
  seriesHelp: string;
  emptyStudents: string;
  loadError: string;
  saveError: string;
  pastSessionError: string;
  studentEmailConflict: string;
};

const newStudentValue = "__new_student__";
const newActivityValue = "__new_activity__";
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

export function WorkspaceCalendar({
  copy,
}: {
  copy: WorkspaceCalendarCopy;
}) {
  const locale = useLocale() as "en" | "tr";
  const { accessToken, data } = useProviderWorkspace();
  const [students, setStudents] = useState<ProviderStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState<
    (CalendarCreateAnchor & { id: number }) | null
  >(null);
  const [quickCreating, setQuickCreating] = useState(false);
  const quickCreateId = useRef(0);
  const [activityNames, setActivityNames] = useState<PersonalActivityName[]>(
    [],
  );
  const [saving, setSaving] = useState(false);
  const [calendarInteractionActive, setCalendarInteractionActive] =
    useState(false);
  const [interactionSaving, setInteractionSaving] = useState(false);
  const [error, setError] = useState("");
  const [attendingError, setAttendingError] = useState("");
  const [attendingSelection, setAttendingSelection] =
    useState<AttendingAppointment | null>(null);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [contextTarget, setContextTarget] =
    useState<CalendarContextTarget | null>(null);
  const [copiedAppointment, setCopiedAppointment] =
    useState<CalendarAppointment | null>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const timeZone = data.bookingPage.timeZone;
  useEffect(() => {
    const refresh = () => calendarRef.current?.getApi().refetchEvents();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
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
        const [
          appointmentsResponse,
          activitiesResponse,
          windowsResponse,
          attendingResponse,
        ] = await Promise.all([
          fetch(
            `/api/provider/appointments?startsAt=${encodeURIComponent(startsAt.toISOString())}&endsAt=${encodeURIComponent(endsAt.toISOString())}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            },
          ),
          fetch(
            `/api/provider/personal-activities/schedules?startsAt=${encodeURIComponent(startsAt.toISOString())}&endsAt=${encodeURIComponent(endsAt.toISOString())}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            },
          ),
          fetch("/api/availability-windows", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }),
          fetch(
            `/api/account/appointments?${new URLSearchParams({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            },
          ).catch(() => null),
        ]);

        if (
          !appointmentsResponse.ok ||
          !windowsResponse.ok ||
          !activitiesResponse.ok
        ) {
          throw new Error(copy.loadError);
        }
        const appointmentsBody = (await appointmentsResponse.json()) as {
          appointments: CalendarAppointment[];
        };
        const windowsBody = (await windowsResponse.json()) as {
          windows: AvailabilityWindow[];
        };

        const activitiesBody = (await activitiesResponse.json()) as {
          activities: PersonalActivityOccurrence[];
        };
        const attendingBody = attendingResponse?.ok
          ? ((await attendingResponse.json().catch(() => null)) as {
              appointments?: AttendingAppointment[];
            } | null)
          : null;
        setAttendingError(
          Array.isArray(attendingBody?.appointments)
            ? ""
            : copy.attendingLoadError,
        );
        const attendingAppointments = Array.isArray(attendingBody?.appointments)
          ? attendingBody.appointments.filter(
              (appointment) =>
                !appointmentsBody.appointments.some(
                  (hosted) => hosted.appointmentId === appointment.id,
                ),
            )
          : [];
        setError("");
        return [
          ...attendingAppointments.map((appointment) =>
            attendingAppointmentToEvent(
              appointment,
              {
                withTeacher: copy.attendingWith,
                pending: copy.pendingRequest,
                scheduled: copy.attendingConfirmed,
              },
              timeZone,
            ),
          ),
          ...activitiesBody.activities.map((activity) => ({
            id: `personal:${activity.id}`,
            title: activity.name,
            start: formatInTimeZone(new Date(activity.startsAt), timeZone),
            end: formatInTimeZone(new Date(activity.endsAt), timeZone),
            editable: true,
            backgroundColor: personalActivityColor,
            borderColor: "#b7791f",
            textColor: "#633c0c",
            classNames: ["provider-personal-activity"],
            extendedProps: {
              personalActivity: activity,
              recurrenceLabel:
                activity.recurrence === "weekly"
                  ? copy.everyWeek
                  : copy.oneTime,
            },
          })),
          ...availabilityToCalendarEvents(
            windowsBody.windows,
            appointmentsBody.appointments,
            activitiesBody.activities,
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
              ({ status }) =>
                status === "scheduled" ||
                status === "cancelled" ||
                status === "pending",
            )
            .map((appointment) =>
              appointmentToCalendarEvent(appointment, timeZone, {
                oneTime: copy.oneTime,
                weekly: copy.everyWeek,
                pending: copy.pendingRequest,
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
      copy.pendingRequest,
      copy.attendingWith,
      copy.attendingConfirmed,
      copy.attendingLoadError,
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

    void initializeStudents().catch(() => setError(copy.loadError));
  }, [loadStudents, copy.loadError]);

  useEffect(() => {
    if (!dialogOpen || draft?.entryType !== "personal") return;
    let cancelled = false;
    async function loadActivities() {
      try {
        const response = await fetch("/api/provider/personal-activities", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(copy.loadError);
        const body = (await response.json()) as {
          activities: PersonalActivityName[];
        };
        if (cancelled) return;
        setActivityNames(body.activities);
        setDraft((current) =>
          current?.entryType === "personal" && !current.activityId
            ? withActivityDuration(
                {
                  ...current,
                  activityId: body.activities[0]?.id ?? newActivityValue,
                },
                body.activities[0]?.defaultDurationMinutes,
                timeZone,
              )
            : current,
        );
      } catch {
        if (!cancelled) setError(copy.loadError);
      }
    }
    void loadActivities();
    return () => {
      cancelled = true;
    };
  }, [accessToken, copy.loadError, dialogOpen, draft?.entryType, timeZone]);

  const openNewSession = useCallback(
    (date = nextRoundedHour(timeZone)) => {
      setQuickCreate(null);
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
      if (info.allDay || saving || interactionSaving || quickCreating) return;
      const rect = info.dayEl?.getBoundingClientRect();
      setDialogOpen(false);
      setError("");
      setQuickCreate({
        id: ++quickCreateId.current,
        startsAt: calendarWallTimeToUtc(info.date, timeZone),
        x: info.jsEvent?.clientX ?? rect?.left ?? window.innerWidth / 2,
        y: info.jsEvent?.clientY ?? rect?.top ?? window.innerHeight / 3,
      });
    },
    [timeZone, saving, interactionSaving, quickCreating],
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
    if (calendarEvent?.extendedProps.attendingAppointment) {
      setContextTarget(null);
      return;
    }
    const appointment = calendarEvent?.extendedProps.appointment as
      | CalendarAppointment
      | undefined;
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
      if (quickCreating) return;
      setQuickCreate(null);
      const activity = info.event.extendedProps.personalActivity as
        | PersonalActivityOccurrence
        | undefined;
      const attending = info.event.extendedProps.attendingAppointment as
        | AttendingAppointment
        | undefined;
      if (attending) {
        setDialogOpen(false);
        setAttendingSelection(attending);
        return;
      }
      if (activity) {
        const start = splitProviderDateTime(
          activity.isMoved ? activity.startsAt : activity.ruleStartsAt,
          timeZone,
        );
        const end = splitProviderDateTime(
          activity.isMoved ? activity.endsAt : activity.ruleEndsAt,
          timeZone,
        );
        setDraft({
          entryType: "personal",
          activityId: activity.activityId,
          activityScheduleId: activity.scheduleId,
          movedOriginalStartsAt: activity.isMoved
            ? activity.originalStartsAt
            : undefined,
          appointmentId: null,
          availabilityWindowId: null,
          studentId: "",
          studentName: "",
          newStudentName: "",
          newStudentEmail: "",
          date: start.date,
          startsAt: start.time,
          endsAt: end.time,
          endDate: end.date,
          comment: "",
          status: "scheduled",
          recurrence: activity.recurrence,
          editScope: "future",
          occurrenceStartsAt: null,
          color: personalActivityColor,
        });
        setError("");
        setDialogOpen(true);
        return;
      }
      const availabilityWindow = info.event.extendedProps.availabilityWindow as
        | AvailabilityWindow
        | undefined;
      const availabilityOccurrence = info.event.extendedProps
        .availabilityOccurrence as
        | { startsAt: string; endsAt: string }
        | undefined;

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
          movedOriginalStartsAt: info.event.extendedProps.availabilityMoved
            ? info.event.extendedProps.availabilityOriginalStartsAt
            : undefined,
          endDate: endsAt.date,
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
        | CalendarAppointment
        | undefined;
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
        meetingUrl: appointment.meetingUrl,
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
    [timeZone, quickCreating],
  );

  const handleCalendarEventChange = useCallback(
    async (info: EventDropArg | EventResizeDoneArg, resize = false) => {
      if (info.oldEvent.extendedProps.attendingAppointment) {
        info.revert();
        return;
      }
      const appointment = info.oldEvent.extendedProps.appointment as
        | CalendarAppointment
        | undefined;
      const start = info.event.start;
      const end = info.event.end;

      const activity = info.oldEvent.extendedProps.personalActivity as
        | PersonalActivityOccurrence
        | undefined;
      const available = info.oldEvent.extendedProps.availabilityWindow as
        | AvailabilityWindow
        | undefined;
      if ((activity || available) && start && end) {
        setInteractionSaving(true);
        setError("");
        try {
          const response = await fetch(
            activity
              ? `/api/provider/personal-activities/schedules/${activity.scheduleId}/move`
              : `/api/availability-windows/${available!.id}/move`,
            {
              method: "PATCH",
              headers: authenticatedJsonHeaders(accessToken),
              body: JSON.stringify({
                originalStartsAt: activity
                  ? (activity.originalStartsAt ?? activity.startsAt)
                  : info.oldEvent.extendedProps.availabilityOriginalStartsAt,
                startsAt: calendarWallTimeToUtc(start, timeZone).toISOString(),
                ...(resize
                  ? {
                      endsAt: calendarWallTimeToUtc(
                        end,
                        timeZone,
                      ).toISOString(),
                    }
                  : {}),
              }),
            },
          );
          if (!response.ok)
            throw new Error(await responseError(response, copy));
          calendarRef.current?.getApi().refetchEvents();
        } catch (caught) {
          info.revert();
          setError(
            caught instanceof Error ? caught.message : copy.activitySaveError,
          );
        } finally {
          setInteractionSaving(false);
        }
        return;
      }
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

        if (!response.ok) throw new Error(await responseError(response, copy));

        calendarRef.current?.getApi().refetchEvents();
      } catch (caught) {
        info.revert();
        setError(caught instanceof Error ? caught.message : copy.saveError);
      } finally {
        setInteractionSaving(false);
      }
    },
    [accessToken, copy, timeZone],
  );

  function updateStart(
    changes: Partial<Pick<SessionDraft, "date" | "startsAt">>,
  ) {
    setDraft((current) => {
      if (!current) return current;
      const next = {
        ...current,
        ...changes,
        ...(changes.date ? { endDate: changes.date } : {}),
      };
      if (current.entryType === "availability" && current.movedOriginalStartsAt)
        return {
          ...next,
          ...personalActivityEndTime(
            next,
            data.bookingPage.appointmentDurationMinutes,
            timeZone,
          ),
        };
      return current.entryType === "personal"
        ? withActivityDuration(next, current.activityDurationMinutes, timeZone)
        : next;
    });
  }

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
      // Keep elapsed duration exact when a DST change repeats a local hour.
      const endsAt =
        draft.entryType === "availability" && draft.movedOriginalStartsAt
          ? new Date(
              startsAt.getTime() +
                data.bookingPage.appointmentDurationMinutes * 60_000,
            )
          : draft.entryType === "personal" && draft.activityDurationMinutes
            ? new Date(
                startsAt.getTime() + draft.activityDurationMinutes * 60_000,
              )
            : zonedLocalDateTimeToUtc(
                draft.entryType === "personal"
                  ? (draft.endDate ?? draft.date)
                  : draft.date,
                draft.endsAt,
                timeZone,
              );

      if (draft.entryType === "personal") {
        if (
          endsAt <= startsAt ||
          endsAt.getTime() - startsAt.getTime() > 86_400_000
        )
          throw new Error(copy.activityTimeError);
        let activityId = draft.activityId;
        if (!activityId || activityId === newActivityValue) {
          const response = await fetch("/api/provider/personal-activities", {
            method: "POST",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              name: draft.newActivityName ?? "",
              defaultDurationMinutes: draft.newActivityDuration
                ? Number(draft.newActivityDuration)
                : null,
            }),
          });
          if (!response.ok)
            throw new Error(await responseError(response, copy));
          const body = (await response.json()) as {
            activity: PersonalActivityName;
          };
          activityId = body.activity.id;
          setActivityNames((current) => [...current, body.activity]);
          setDraft((current) =>
            current ? { ...current, activityId } : current,
          );
        }
        const response = await fetch(
          draft.activityScheduleId
            ? `/api/provider/personal-activities/schedules/${draft.activityScheduleId}${draft.movedOriginalStartsAt ? "/move" : ""}`
            : "/api/provider/personal-activities/schedules",
          {
            method: draft.activityScheduleId ? "PATCH" : "POST",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              ...(draft.movedOriginalStartsAt
                ? { originalStartsAt: draft.movedOriginalStartsAt }
                : { activityId, recurrence: draft.recurrence }),
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response, copy));
        calendarRef.current?.getApi().refetchEvents();
        setDialogOpen(false);
        return;
      }

      if (draft.entryType === "availability") {
        if (!draft.movedOriginalStartsAt && !freeTimePreview?.slots.length) {
          throw new Error(copy.invalidFreeTime);
        }
        const response = await fetch(
          draft.availabilityWindowId
            ? `/api/availability-windows/${draft.availabilityWindowId}${draft.movedOriginalStartsAt ? "/move" : ""}`
            : "/api/availability-windows",
          {
            method: draft.availabilityWindowId ? "PATCH" : "POST",
            headers: authenticatedJsonHeaders(accessToken),
            body: JSON.stringify({
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              ...(draft.movedOriginalStartsAt
                ? { originalStartsAt: draft.movedOriginalStartsAt }
                : { recurrence: draft.recurrence }),
            }),
          },
        );
        if (!response.ok) throw new Error(await responseError(response, copy));

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
        if (!response.ok) throw new Error(await responseError(response, copy));
      } else {
        if (startsAt <= new Date()) throw new Error(copy.pastSessionError);
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
            throw new Error(await responseError(studentResponse, copy));
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
        if (!response.ok) throw new Error(await responseError(response, copy));
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
      if (!response.ok) throw new Error(await responseError(response, copy));

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
    if (
      !window.confirm(
        draft.movedOriginalStartsAt
          ? copy.deleteMovedBlockConfirm
          : copy.deleteFreeTimeConfirm,
      )
    )
      return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/availability-windows/${draft.availabilityWindowId}${draft.movedOriginalStartsAt ? "/move" : ""}`,
        {
          method: "DELETE",
          headers: authenticatedJsonHeaders(accessToken),
          ...(draft.movedOriginalStartsAt
            ? {
                body: JSON.stringify({
                  originalStartsAt: draft.movedOriginalStartsAt,
                }),
              }
            : {}),
        },
      );
      if (!response.ok) throw new Error(await responseError(response, copy));

      calendarRef.current?.getApi().refetchEvents();
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteActivitySchedule() {
    if (
      !draft?.activityScheduleId ||
      !window.confirm(
        draft.movedOriginalStartsAt
          ? copy.deleteMovedBlockConfirm
          : copy.deleteActivityConfirm,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/provider/personal-activities/schedules/${draft.activityScheduleId}${draft.movedOriginalStartsAt ? "/move" : ""}`,
        {
          method: "DELETE",
          headers: authenticatedJsonHeaders(accessToken),
          ...(draft.movedOriginalStartsAt
            ? {
                body: JSON.stringify({
                  originalStartsAt: draft.movedOriginalStartsAt,
                }),
              }
            : {}),
        },
      );
      if (!response.ok) throw new Error(await responseError(response, copy));
      calendarRef.current?.getApi().refetchEvents();
      setDialogOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : copy.activitySaveError,
      );
    } finally {
      setSaving(false);
    }
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
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold text-black/50">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#56a46f]" />
              {copy.freeTimeWindow}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#7859d6]" />
              {copy.studentSession}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#b7791f]" />
              {copy.personalActivity}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#2563eb]" />
              {copy.attendingSession}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs text-black/45">
            {copy.dragHint} {copy.copyPasteHint}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 items-center">
          <Button
            variant="outline"
            className="min-h-11 rounded-full text-vast-ink px-5 font-bold"
            disabled={loading || saving || interactionSaving || quickCreating}
            onClick={() => calendarRef.current?.getApi().refetchEvents()}>
            <RefreshCw size={16} />
            {copy.refreshCalendar}
          </Button>
          <Button
            className="min-h-11 rounded-full bg-vast-ink px-5 font-bold text-white"
            disabled={quickCreating}
            onClick={() => openNewSession()}>
            <CalendarPlus size={17} /> {copy.addToTimetable}
          </Button>
        </div>
      </header>

      {error && !dialogOpen && !quickCreate ? (
        <p className="mb-3 rounded-xl bg-ember-glow px-4 py-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}

      {copiedAppointment ? (
        <p role="status" className="mb-3 text-xs font-semibold text-black/60">
          {copy.sessionCopied.replace("{name}", copiedAppointment.studentName)}
        </p>
      ) : null}

      {attendingError ? (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm">
          {attendingError}
        </p>
      ) : null}

      <Dialog
        open={!!attendingSelection}
        onOpenChange={(open) => {
          if (!open) setAttendingSelection(null);
        }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.attendingSession}</DialogTitle>
            <DialogDescription>{copy.attendingDescription}</DialogDescription>
          </DialogHeader>
          {attendingSelection ? (
            <>
              <p className="font-semibold">
                {copy.attendingWith.replace(
                  "{name}",
                  attendingSelection.providerName,
                )}
              </p>
              <p className="text-sm">
                {new Intl.DateTimeFormat(locale, {
                  timeZone: attendingSelection.timeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(attendingSelection.startsAt))}{" "}
                –{" "}
                {new Intl.DateTimeFormat(locale, {
                  timeZone: attendingSelection.timeZone,
                  timeStyle: "short",
                }).format(new Date(attendingSelection.endsAt))}
              </p>
              <p className="text-xs text-black/55">
                {attendingSelection.timeZone} ·{" "}
                {attendingSelection.status === "pending"
                  ? copy.pendingRequest
                  : copy.attendingConfirmed}
              </p>
              <JoinMeeting meetingUrl={attendingSelection.meetingUrl} status={attendingSelection.status} copy={copy.meeting} />
              <a
                className="text-sm font-semibold underline"
                href={`/${locale}/my-appointments`}>
                {copy.manageAttending}
              </a>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ContextMenu modal={false}>
        <section
          aria-busy={loading || interactionSaving}
          className={`provider-calendar relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[24px] border border-black/10 bg-[#fbfaf4] p-3 shadow-sm sm:p-4 ${calendarInteractionActive ? "provider-calendar-interacting" : ""}`}>
          {loading || interactionSaving ? (
            <span
              aria-live="polite"
              className="absolute top-4 right-4 z-10 flex min-h-9 items-center gap-2 rounded-full bg-lavender-whisper px-3 text-xs font-bold shadow-sm"
              role="status">
              <LoaderCircle
                className="animate-spin motion-reduce:animate-none"
                size={16}
              />
              {interactionSaving ? copy.updatingSession : null}
            </span>
          ) : null}
          <ContextMenuTrigger
            asChild
            disabled={loading || saving || interactionSaving}>
            <div
              className="h-full min-w-0"
              onContextMenuCapture={handleCalendarContextMenu}
              onPointerDownCapture={(event) => {
                if (event.pointerType === "touch")
                  handleCalendarContextMenu(event);
              }}>
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
                eventResize={(info) =>
                  void handleCalendarEventChange(info, true)
                }
                eventAllow={(_drop, event) =>
                  !event?.extendedProps.attendingAppointment &&
                  !interactionSaving &&
                  !quickCreating
                }
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
                snapDuration="00:10:00"
                slotDuration="00:30:00"
                slotMaxTime="29:00:00"
                slotMinTime="05:00:00"
                timeZone="local"
              />
            </div>
          </ContextMenuTrigger>
        </section>
        <ContextMenuContent
          onCloseAutoFocus={(event) => event.preventDefault()}>
          <ContextMenuItem
            disabled={!contextTarget?.appointment}
            onSelect={() => {
              if (contextTarget?.appointment) {
                setCopiedAppointment({ ...contextTarget.appointment });
                setError("");
              }
            }}>
            <Copy aria-hidden="true" /> {copy.copySession}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={
              !copiedAppointment ||
              !contextTarget ||
              !!contextTarget.appointment
            }
            onSelect={pasteSession}>
            <ClipboardPaste aria-hidden="true" /> {copy.pasteSession}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {quickCreate ? (
        <CalendarCreatePopover
          key={quickCreate.id}
          anchor={quickCreate}
          accessToken={accessToken}
          timeZone={timeZone}
          locale={locale}
          sessionDuration={data.bookingPage.appointmentDurationMinutes}
          copy={copy}
          onClose={() => setQuickCreate(null)}
          onSaved={() => {
            setQuickCreate(null);
            calendarRef.current?.getApi().refetchEvents();
          }}
          onSavingChange={setQuickCreating}
          onStudentCreated={(student) =>
            setStudents((current) =>
              current.some(({ id }) => id === student.id)
                ? current
                : [...current, student],
            )
          }
          readError={(response) => responseError(response, copy)}
        />
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          {draft ? (
            <form onSubmit={saveSession}>
              <DialogHeader>
                <DialogTitle className="font-display text-3xl">
                  {draft.activityScheduleId
                    ? copy.editActivity
                    : draft.availabilityWindowId
                      ? copy.editFreeTime
                      : draft.appointmentId
                        ? copy.editSession
                        : copy.addToTimetable}
                </DialogTitle>
                <DialogDescription>
                  {draft.movedOriginalStartsAt
                    ? copy.movedOccurrenceHelp
                    : draft.entryType === "personal"
                      ? copy.activityDescription
                      : draft.availabilityWindowId
                        ? copy.editFreeTimeDescription
                        : draft.appointmentId
                          ? copy.editSessionDescription
                          : draft.entryType === "availability"
                            ? copy.freeTimeDescription
                            : copy.addSessionDescription}
                </DialogDescription>
              </DialogHeader>

              {draft.appointmentId && draft.entryType === "session" ? (
                <div className="mt-4">
                  <ProviderAppointmentMeeting
                    key={draft.appointmentId}
                    appointmentId={draft.appointmentId}
                    meetingUrl={draft.meetingUrl}
                    status={draft.status}
                    accessToken={accessToken}
                    locale={locale}
                    copy={copy.meeting}
                    onCreated={() => calendarRef.current?.getApi().refetchEvents()}
                  />
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {!draft.appointmentId &&
                !draft.availabilityWindowId &&
                !draft.activityScheduleId ? (
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
                            : entryType === "personal"
                              ? {
                                  ...draft,
                                  entryType: "personal",
                                  recurrence: "none",
                                  activityId: undefined,
                                  activityDurationMinutes: null,
                                  newActivityDuration: "",
                                  newActivityName: "",
                                  ...personalActivityEndTime(
                                    draft,
                                    60,
                                    timeZone,
                                  ),
                                }
                              : { ...draft, entryType: "session" },
                        )
                      }
                      value={draft.entryType}>
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session">
                          {copy.studentSession}
                        </SelectItem>
                        <SelectItem value="personal">
                          {copy.personalActivity}
                        </SelectItem>
                        <SelectItem value="availability">
                          {copy.freeTimeWindow}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                {draft.entryType === "personal" ? (
                  <>
                    <Field className="sm:col-span-2" label={copy.activityName}>
                      <Select
                        disabled={!!draft.movedOriginalStartsAt}
                        value={draft.activityId || newActivityValue}
                        onValueChange={(activityId) => {
                          // Radix's native form control can emit an empty value
                          // while asynchronously loaded options are registered.
                          if (activityId)
                            setDraft((current) =>
                              current && current.activityId !== activityId
                                ? withActivityDuration(
                                    { ...current, activityId },
                                    activityNames.find(
                                      ({ id }) => id === activityId,
                                    )?.defaultDurationMinutes,
                                    timeZone,
                                  )
                                : current,
                            );
                        }}>
                        <SelectTrigger
                          aria-label={copy.activityName}
                          className="min-h-11 w-full rounded-xl">
                          <SelectValue>
                            {activityNames.find(
                              ({ id }) => id === draft.activityId,
                            )?.name ?? copy.newActivity}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {activityNames.map((activity) => (
                            <SelectItem key={activity.id} value={activity.id}>
                              {activity.name}
                            </SelectItem>
                          ))}
                          <SelectItem value={newActivityValue}>
                            {copy.newActivity}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {!draft.activityId ||
                    draft.activityId === newActivityValue ? (
                      <Field
                        className="sm:col-span-2"
                        label={copy.newActivityName}>
                        <Input
                          aria-label={copy.newActivityName}
                          required
                          maxLength={100}
                          value={draft.newActivityName ?? ""}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              newActivityName: event.target.value,
                              activityId: newActivityValue,
                            })
                          }
                        />
                      </Field>
                    ) : null}
                    {!draft.activityId ||
                    draft.activityId === newActivityValue ? (
                      <Field
                        className="sm:col-span-2"
                        label={copy.activityDurationLabel}>
                        <Input
                          aria-label={copy.activityDurationLabel}
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          aria-describedby="activity-duration-help"
                          value={draft.newActivityDuration ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft((current) =>
                              current
                                ? withActivityDuration(
                                    {
                                      ...current,
                                      activityId: newActivityValue,
                                      newActivityDuration: value,
                                    },
                                    value === "" ? null : Number(value),
                                    timeZone,
                                  )
                                : current,
                            );
                          }}
                        />
                        <p
                          id="activity-duration-help"
                          className="mt-2 text-xs leading-5 text-black/50">
                          {copy.activityDurationHelp}
                        </p>
                      </Field>
                    ) : null}
                    {draft.activityDurationMinutes ? (
                      <p
                        role="status"
                        className="sm:col-span-2 rounded-xl bg-[#fde7b0] px-4 py-3 text-xs leading-5">
                        {copy.activityDurationApplied.replace(
                          "{minutes}",
                          String(draft.activityDurationMinutes),
                        )}
                      </p>
                    ) : null}
                  </>
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
                      value={draft.studentId}>
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
                    aria-label={copy.date}
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      updateStart({ date: event.target.value })
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
                    aria-label={copy.startsAt}
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      updateStart({ startsAt: event.target.value })
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
                {draft.entryType === "personal" ? (
                  <Field label={copy.endDate}>
                    <Input
                      aria-label={copy.endDate}
                      className="min-h-11 rounded-xl"
                      type="date"
                      required
                      min={draft.date}
                      value={draft.endDate ?? draft.date}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          endDate: event.target.value,
                          activityDurationMinutes: null,
                        })
                      }
                    />
                  </Field>
                ) : null}
                <Field label={copy.endsAt}>
                  <Input
                    readOnly={
                      draft.entryType === "availability" &&
                      !!draft.movedOriginalStartsAt
                    }
                    aria-label={copy.endsAt}
                    className="min-h-11 rounded-xl"
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        endsAt: event.target.value,
                        activityDurationMinutes: null,
                      })
                    }
                    required
                    type="time"
                    value={draft.endsAt}
                  />
                </Field>
                {!draft.appointmentId && !draft.movedOriginalStartsAt ? (
                  <Field label={copy.repetition}>
                    <Select
                      onValueChange={(recurrence) =>
                        setDraft({
                          ...draft,
                          recurrence: recurrence as "none" | "weekly",
                        })
                      }
                      value={draft.recurrence}>
                      <SelectTrigger className="min-h-11 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{copy.oneTime}</SelectItem>
                        <SelectItem value="weekly">{copy.everyWeek}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : draft.appointmentId && draft.recurrence === "weekly" ? (
                  <Field label={copy.editScope}>
                    <Select
                      onValueChange={(editScope) =>
                        setDraft({
                          ...draft,
                          editScope: editScope as "exception" | "future",
                        })
                      }
                      value={draft.editScope}>
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

              {draft.entryType === "availability" &&
              !draft.movedOriginalStartsAt ? (
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
                          key={slot.startsAt.toISOString()}>
                          {formatProviderTime(slot.startsAt, locale, timeZone)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1">{copy.invalidFreeTime}</p>
                  )}
                </div>
              ) : null}

              {draft.entryType === "personal" &&
              !draft.movedOriginalStartsAt &&
              draft.activityScheduleId &&
              draft.recurrence === "weekly" ? (
                <p className="mt-4 rounded-xl bg-[#fde7b0] px-4 py-3 text-xs leading-5">
                  {copy.activitySeriesHelp}
                </p>
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
                {draft.activityScheduleId ? (
                  <div className="mr-auto">
                    <Button
                      disabled={saving}
                      onClick={() => void deleteActivitySchedule()}
                      type="button"
                      variant="destructive">
                      <Trash2 size={15} />
                      {draft.movedOriginalStartsAt
                        ? copy.deleteMovedBlock
                        : copy.deleteActivity}
                    </Button>
                  </div>
                ) : draft.availabilityWindowId ? (
                  <div className="mr-auto">
                    <Button
                      disabled={saving}
                      onClick={() => void deleteAvailableTime()}
                      type="button"
                      variant="destructive">
                      <Trash2 size={15} />
                      {draft.movedOriginalStartsAt
                        ? copy.deleteMovedBlock
                        : copy.deleteFreeTime}
                    </Button>
                  </div>
                ) : draft.appointmentId ? (
                  <div className="mr-auto flex flex-wrap gap-2">
                    <Button
                      disabled={saving}
                      onClick={() => void deleteSession()}
                      type="button"
                      variant="destructive">
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
                      variant="outline">
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
                  ) : draft.entryType === "personal" ? (
                    <Coffee size={16} />
                  ) : draft.entryType === "availability" ? (
                    <Clock3 size={16} />
                  ) : draft.studentId === newStudentValue ? (
                    <UserPlus size={16} />
                  ) : (
                    <CalendarPlus size={16} />
                  )}
                  {saving
                    ? copy.saving
                    : draft.entryType === "personal"
                      ? copy.saveActivity
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
  if (info.event.extendedProps.attendingAppointment) {
    return (
      <div className="min-w-0 overflow-hidden px-1 py-0.5 leading-tight">
        <p className="truncate text-[9px] font-bold opacity-75">
          {info.timeText}
        </p>
        <p className="text-[11px] font-bold">{info.event.title}</p>
      </div>
    );
  }
  if (
    info.event.extendedProps.availabilitySlot ||
    info.event.extendedProps.personalActivity
  ) {
    return (
      <div className="flex min-w-0 items-start gap-0.5 overflow-hidden px-1 py-0.5 leading-tight">
        <GripVertical
          aria-hidden="true"
          className="provider-session-drag-handle mt-0.5 size-3 shrink-0 opacity-55"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-[9px] font-bold opacity-75">
            {info.timeText}
          </p>
          <p className="truncate text-[11px] font-extrabold">
            {info.event.title}
          </p>
        </div>
      </div>
    );
  }

  const appointment = info.event.extendedProps.appointment as
    | CalendarAppointment
    | undefined;
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
  labels: { oneTime: string; weekly: string; pending: string },
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
        appointment.status === "pending"
          ? labels.pending
          : appointment.recurrence === "weekly" && !appointment.isException
            ? labels.weekly
            : labels.oneTime,
    },
  };
}

function availabilityToCalendarEvents(
  windows: AvailabilityWindow[],
  appointments: CalendarAppointment[],
  activities: PersonalActivityOccurrence[],
  range: { startsAt: Date; endsAt: Date },
  timeZone: string,
  config: {
    durationMinutes: number;
    intervalMinutes: number;
    title: string;
  },
): EventInput[] {
  return windows.flatMap((window) => {
    const rule = {
      ...window,
      startsAt: new Date(window.startsAt),
      endsAt: new Date(window.endsAt),
    };
    return expandAvailableSlots(
      rule,
      range,
      timeZone,
      config.durationMinutes,
      config.intervalMinutes,
    )
      .filter(
        (slot) =>
          !activities.some(
            (activity) =>
              new Date(activity.startsAt) < slot.endsAt &&
              new Date(activity.endsAt) > slot.startsAt,
          ) &&
          !appointments.some(
            (appointment) =>
              (appointment.status === "scheduled" ||
                appointment.status === "pending") &&
              new Date(appointment.startsAt) < slot.endsAt &&
              new Date(appointment.endsAt) > slot.startsAt,
          ),
      )
      .map((slot) => {
        const occurrence = slot.moved
          ? slot
          : expandAvailabilityRule(
              rule,
              {
                startsAt: slot.originalStartsAt,
                endsAt: new Date(slot.originalStartsAt.getTime() + 1),
              },
              timeZone,
            )[0];
        return {
          id: `availability:${slot.id}`,
          title: config.title,
          start: formatInTimeZone(slot.startsAt, timeZone),
          end: formatInTimeZone(slot.endsAt, timeZone),
          editable: true,
          durationEditable: false,
          backgroundColor: "#dff3e4",
          borderColor: "#56a46f",
          textColor: "#174b2a",
          classNames: ["provider-availability-window"],
          extendedProps: {
            availabilityWindowId: window.id,
            availabilitySlot: true,
            availabilityWindow: window,
            availabilityOriginalStartsAt: slot.originalStartsAt.toISOString(),
            availabilityMoved: slot.moved,
            availabilityOccurrence: {
              startsAt: occurrence.startsAt.toISOString(),
              endsAt: occurrence.endsAt.toISOString(),
            },
          },
        };
      });
  });
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

async function responseError(
  response: Response,
  copy: WorkspaceCalendarCopy,
) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    studentName?: string;
  } | null;
  if (body?.code === "student_email_conflict" && body.studentName) {
    return copy.studentEmailConflict.replace("{name}", body.studentName);
  }
  const moveErrors: Record<string, string> = {
    calendar_block_missing: copy.calendarBlockMissing,
    calendar_block_conflict: copy.calendarBlockConflict,
    calendar_block_past: copy.calendarBlockPast,
    calendar_block_invalid: copy.calendarBlockInvalid,
  };
  if (body?.code && moveErrors[body.code]) return moveErrors[body.code];
  if (body?.code === "past") return copy.pastSessionError;
  if (body?.code === "activity_name_conflict") return copy.activityNameConflict;
  if (body?.code === "activity_not_found") return copy.activityNotFound;
  if (body?.code === "invalid_activity_time") return copy.activityTimeError;
  if (body?.code === "invalid_activity") return copy.activitySaveError;
  return body?.error ?? copy.saveError;
}

function withActivityDuration(
  draft: SessionDraft,
  duration: number | null | undefined,
  timeZone: string,
): SessionDraft {
  const validDuration =
    duration != null &&
    Number.isInteger(duration) &&
    duration >= 1 &&
    duration <= 1440
      ? duration
      : null;
  return {
    ...draft,
    activityDurationMinutes: validDuration,
    ...personalActivityEndTime(draft, validDuration, timeZone),
  };
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
