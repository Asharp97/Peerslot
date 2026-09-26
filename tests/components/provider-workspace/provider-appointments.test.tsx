// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkspaceCalendar,
  readableTextColor,
  type WorkspaceCalendarCopy,
} from "@/components/provider-workspace/workspace-calendar";
import { ProviderDirectory } from "@/components/provider-workspace/provider-directory";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";
import { findAppointmentConflictInRows } from "@/lib/provider-appointment-occurrence";

const calendar = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    calendar.props = props;
    return null;
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/components/provider-workspace/provider-shell", () => ({
  useProviderWorkspace: () => ({
    accessToken: "access-token",
    data: {
      offersAppointments: true,
      profile: { displayName: "Ada" },
      bookingPage: {
        timeZone: "Europe/Istanbul",
        appointmentDurationMinutes: 45,
        bookingIntervalMinutes: 45,
        minimumNoticeHours: 0,
        isPublished: true,
      },
    },
  }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

describe("provider appointments calendar", () => {
  it.each(["pending", "scheduled"] as const)(
    "shows lessons attended with another teacher as %s alongside teaching sessions",
    async (status) => {
      const attending = {
        id: "ceyda-session",
        occurrenceStartsAt: "2030-01-16T09:00:00Z",
        startsAt: "2030-01-16T09:00:00Z",
        endsAt: "2030-01-16T09:30:00Z",
        providerName: "Ceyda",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        timeZone: "UTC",
        status,
        canChange: true,
        canReschedule: true,
        minimumNoticeHours: 24,
      };
      const baseFetch = calendarFetchMock();
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).includes("/api/account/appointments")
          ? Promise.resolve(Response.json({ appointments: [attending] }))
          : baseFetch(input, init),
      );
      vi.stubGlobal("fetch", fetchMock);
      const realCopy = en.ProviderWorkspace.calendar;
      render(<WorkspaceCalendar copy={realCopy} />);
      let events: Array<Record<string, unknown>> = [];
      await act(async () => {
        events = await (
          calendar.props!.events as (range: {
            start: Date;
            end: Date;
          }) => Promise<typeof events>
        )({
          start: new Date("2030-01-14T00:00:00Z"),
          end: new Date("2030-01-21T00:00:00Z"),
        });
      });
      expect(events).toHaveLength(2);
      const event = events.find((item) =>
        String(item.id).startsWith("attending:"),
      )!;
      expect(event).toMatchObject({
        start: "2030-01-16T12:00:00",
        end: "2030-01-16T12:30:00",
        editable: false,
        startEditable: false,
        durationEditable: false,
        borderColor: "#2563eb",
      });
      expect(event.title).toBe(
        `Appointment with Ceyda · ${status === "pending" ? realCopy.pendingRequest : realCopy.attendingConfirmed}`,
      );
      expect(
        events.find((item) => item.id === scheduledAppointment.id),
      ).toMatchObject({ editable: true });
      act(() =>
        (calendar.props!.eventClick as (info: { event: unknown }) => void)({
          event,
        }),
      );
      expect(
        screen.getByRole("heading", { name: realCopy.attendingSession }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("heading", { name: realCopy.editSession }),
      ).toBeNull();
      expect(
        screen
          .getByRole("link", { name: realCopy.manageAttending })
          .getAttribute("href"),
      ).toBe("/en/my-appointments");
      if (status === "scheduled") {
        expect(screen.getByRole("link", { name: /Google Meet.*Join/ }).getAttribute("href")).toBe(attending.meetingUrl);
      } else {
        expect(screen.queryByRole("link", { name: /Google Meet.*Join/ })).toBeNull();
      }
      const revert = vi.fn();
      await act(async () => {
        await (calendar.props!.eventDrop as (info: unknown) => Promise<void>)({
          oldEvent: event,
          event,
          revert,
        });
      });
      expect(revert).toHaveBeenCalledOnce();
      expect(
        fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
      ).toBe(false);
    },
  );
  it("keeps teaching sessions visible if the attendee calendar fails", async () => {
    const baseFetch = calendarFetchMock();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/api/account/appointments")
        ? Promise.reject(new TypeError("offline"))
        : baseFetch(input, init),
    );
    render(<WorkspaceCalendar copy={en.ProviderWorkspace.calendar} />);
    let events: unknown[] = [];
    await act(async () => {
      events = await (
        calendar.props!.events as (range: {
          start: Date;
          end: Date;
        }) => Promise<unknown[]>
      )({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
    });
    expect(events).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe(
      en.ProviderWorkspace.calendar.attendingLoadError,
    );
  });
  it.each(["en", "tr"] as const)(
    "shows the conflicting student's name in %s while preserving the edit",
    async (locale) => {
      const messages = (locale === "tr" ? tr : en).ProviderWorkspace.clients;
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "PATCH")
            return Response.json(
              {
                code: "student_email_conflict",
                studentName: "Existing Ada",
                error: "This email already belongs to Existing Ada.",
              },
              { status: 409 },
            );
          return Response.json({
            students: [{ id: "student-id", displayName: "Ada", email: null }],
          });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<ProviderDirectory kind="clients" copy={messages} />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      fireEvent.click(
        await screen.findByRole("button", { name: `${messages.edit}: Ada` }),
      );
      const fields = screen.getAllByRole("textbox");
      const emailInput = fields.find(
        (field) => field.getAttribute("type") === "email",
      )!;
      fireEvent.change(emailInput, { target: { value: "ada@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: messages.save }));
      expect(
        await screen.findByText(
          messages.emailConflict.replace("{name}", "Existing Ada"),
        ),
      ).toBeTruthy();
      expect((emailInput as HTMLInputElement).value).toBe("ada@example.com");
      expect(screen.getByRole("button", { name: messages.save })).toBeTruthy();
    },
  );

  it("explains a past session before creating a student or appointment", async () => {
    const fetchMock = calendarFetchMock({ appointments: [] });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      const dateClick = calendar.props?.dateClick as (info: unknown) => void;
      dateClick({ allDay: false, date: new Date("2020-01-08T12:00:00") });
    });
    const user = userEvent.setup();
    await user.type(
      screen.getByRole("combobox", { name: copy.quickSearchStudent }),
      "New Student",
    );
    await screen.findByRole("option", { name: copy.quickCreate });
    await user.keyboard("{Enter}");
    expect(await screen.findByText(copy.pastSessionError)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });

  it.each(["none", "weekly"] as const)(
    "saves a %s session on the clicked day when the previous day has the same time",
    async (recurrence) => {
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => undefined;
      HTMLElement.prototype.releasePointerCapture = () => undefined;
      HTMLElement.prototype.scrollIntoView = () => undefined;
      const user = userEvent.setup();
      const previousDay = {
        id: "previous-day",
        studentName: "Ada",
        status: "scheduled" as const,
        startsAt: new Date("2030-01-07T09:00:00Z"),
        endsAt: new Date("2030-01-07T09:45:00Z"),
        recurrence: "weekly" as const,
        deletedAt: null,
        recurrenceEndsAt: null,
        exceptionForAppointmentId: null,
        exceptionOriginalStartsAt: null,
      };
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === "/api/provider/students")
            return Response.json({
              students: [{ id: "student-id", displayName: "Ada", email: null }],
            });
          if (init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            const conflict = findAppointmentConflictInRows(
              [previousDay],
              {
                startsAt: new Date(body.startsAt),
                endsAt: new Date(body.endsAt),
                recurrence: body.recurrence,
              },
              "Europe/Istanbul",
            );
            return conflict
              ? Response.json(
                  { error: "Unexpected previous-day conflict" },
                  { status: 409 },
                )
              : Response.json(
                  { appointment: { id: "new-session" } },
                  { status: 201 },
                );
          }
          return Response.json({
            appointments: [],
            windows: [],
            activities: [],
          });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<WorkspaceCalendar copy={copy} />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      act(() => {
        const dateClick = calendar.props?.dateClick as (info: unknown) => void;
        dateClick({ allDay: false, date: new Date("2030-01-08T12:00:00") });
      });
      if (recurrence === "weekly") {
        await user.click(screen.getByText(new RegExp(copy.quickOptions)));
        await user.selectOptions(
          screen.getByLabelText(copy.repetition),
          "weekly",
        );
      }
      await user.click(await screen.findByRole("option", { name: /Ada/ }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      const request = fetchMock.mock.calls.find(
        ([, init]) => init?.method === "POST",
      );
      expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
        startsAt: "2030-01-08T09:00:00.000Z",
        endsAt: "2030-01-08T09:45:00.000Z",
        recurrence,
      });
    },
  );

  it("shows pending requests at their actual date and time so blocked slots are visible", async () => {
    vi.stubGlobal(
      "fetch",
      calendarFetchMock({
        appointments: [
          {
            id: "pending-id",
            appointmentId: "pending-id",
            occurrenceStartsAt: "2030-01-15T09:00:00Z",
            startsAt: "2030-01-15T09:00:00Z",
            endsAt: "2030-01-15T09:45:00Z",
            status: "pending",
            studentName: "Awaiting Student",
            recurrence: "none",
            color: "#f0d7ff",
            isException: false,
          },
        ],
      }),
    );
    render(<WorkspaceCalendar copy={copy} />);
    let events: Array<{
      start: string;
      editable: boolean;
      extendedProps: { recurrenceLabel: string };
    }> = [];
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<typeof events>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      start: "2030-01-15T12:00:00",
      editable: false,
      extendedProps: { recurrenceLabel: copy.pendingRequest },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    calendar.props = null;
  });

  it("loads the visible range through an event source without a datesSet state loop", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account/appointments"))
        return Response.json({ appointments: [] });
      if (url.includes("/api/provider/students")) {
        return Response.json({ students: [] });
      }
      if (url.includes("/api/availability-windows")) {
        return Response.json({ windows: [] });
      }
      return Response.json({
        activities: [],
        appointments: [
          {
            id: "occurrence-id",
            appointmentId: "appointment-id",
            occurrenceStartsAt: "2030-01-15T09:00:00Z",
            recurrence: "weekly",
            isException: false,
            providerStudentId: "student-id",
            studentName: "Ada",
            startsAt: "2030-01-15T09:00:00Z",
            endsAt: "2030-01-15T09:45:00Z",
            status: "scheduled",
            comment: null,
            color: "#034f46",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<WorkspaceCalendar copy={copy} />);

    expect(
      screen.getByRole("heading", { name: "Ada’s sessions" }),
    ).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/provider/students",
        expect.any(Object),
      );
    });
    expect(calendar.props?.datesSet).toBeUndefined();
    expect(calendar.props?.events).toBeTypeOf("function");
    expect(calendar.props?.snapDuration).toBe("00:10:00");

    const calendarSurface = document.querySelector(".provider-calendar");
    act(() => {
      const startDrag = calendar.props?.eventDragStart as () => void;
      startDrag();
    });
    expect(
      calendarSurface?.classList.contains("provider-calendar-interacting"),
    ).toBe(true);
    act(() => {
      const stopDrag = calendar.props?.eventDragStop as () => void;
      stopDrag();
    });
    expect(
      calendarSurface?.classList.contains("provider-calendar-interacting"),
    ).toBe(false);

    let events: unknown[] = [];
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<unknown[]>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/provider/appointments?startsAt="),
      expect.any(Object),
    );
    expect(events[0]).toMatchObject({
      editable: true,
      classNames: ["provider-session-scheduled", "provider-session-draggable"],
      backgroundColor: "#034f46",
      borderColor: "#ffffff",
      textColor: "#ffffff",
      extendedProps: { recurrenceLabel: "everyWeek" },
    });

    const renderEvent = calendar.props?.eventContent as (info: {
      event: {
        title: string;
        extendedProps: Record<string, unknown>;
      };
      timeText: string;
    }) => React.ReactElement;
    const event = events[0] as {
      extendedProps: Record<string, unknown>;
      title: string;
    };
    const { container } = render(
      renderEvent({
        event: {
          title: event.title,
          extendedProps: event.extendedProps,
        },
        timeText: "12:00",
      }),
    );
    expect(
      container.querySelector(".provider-session-drag-handle"),
    ).toBeTruthy();
  });

  it("renders a weekly free-time window as bordered, labeled slots", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account/appointments"))
        return Response.json({ appointments: [] });
      if (url.includes("/api/provider/students")) {
        return Response.json({ students: [] });
      }
      if (url.includes("/api/availability-windows")) {
        return Response.json({
          windows: [
            {
              id: "window-id",
              startsAt: "2030-01-07T09:00:00Z",
              endsAt: "2030-01-07T12:00:00Z",
              isActive: true,
              recurrence: "weekly",
            },
          ],
        });
      }
      return Response.json({ appointments: [], activities: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);

    let events: Array<Record<string, unknown>> = [];
    await waitFor(() => expect(calendar.props?.events).toBeTypeOf("function"));
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<Array<Record<string, unknown>>>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
    });

    expect(events).toHaveLength(8);
    expect(events).toContainEqual(
      expect.objectContaining({
        title: "availableSlot",
        backgroundColor: "#dff3e4",
        borderColor: "#56a46f",
        extendedProps: expect.objectContaining({
          availabilityWindowId: "window-id",
          availabilitySlot: true,
          availabilityWindow: expect.objectContaining({ id: "window-id" }),
        }),
      }),
    );

    const renderEvent = calendar.props?.eventContent as (info: {
      event: {
        title: string;
        extendedProps: Record<string, unknown>;
      };
      timeText: string;
    }) => unknown;
    expect(
      renderEvent({
        event: {
          title: "availableSlot",
          extendedProps: {
            availabilityWindowId: "window-id",
            availabilitySlot: true,
          },
        },
        timeText: "09:00",
      }),
    ).not.toBeNull();
  });

  it("adds a weekly free-time window from the Add dialog", async () => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
    HTMLElement.prototype.scrollIntoView = () => undefined;
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/account/appointments"))
          return Response.json({ appointments: [] });
        if (url.includes("/api/provider/students")) {
          return Response.json({ students: [] });
        }
        if (
          url.includes("/api/availability-windows") &&
          init?.method === "POST"
        ) {
          return Response.json(
            { window: { id: "window-id" } },
            { status: 201 },
          );
        }
        if (url.includes("/api/availability-windows")) {
          return Response.json({ windows: [] });
        }
        return Response.json({ appointments: [], activities: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);

    await user.click(screen.getByRole("button", { name: "addToTimetable" }));
    const [typeSelect] = screen.getAllByRole("combobox");
    await user.click(typeSelect);
    await user.click(screen.getByRole("option", { name: "freeTimeWindow" }));

    const date = document.querySelector<HTMLInputElement>('input[type="date"]');
    const times =
      document.querySelectorAll<HTMLInputElement>('input[type="time"]');
    fireEvent.change(date!, { target: { value: "2030-01-15" } });
    fireEvent.change(times[0], { target: { value: "09:00" } });
    fireEvent.change(times[1], { target: { value: "12:00" } });
    await user.click(screen.getByRole("button", { name: "saveFreeTime" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/availability-windows",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            startsAt: "2030-01-15T06:00:00.000Z",
            endsAt: "2030-01-15T09:00:00.000Z",
            recurrence: "weekly",
          }),
        }),
      );
    });
  });

  it("edits an available-time window by clicking one of its slots", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/account/appointments"))
          return Response.json({ appointments: [] });
        if (url.includes("/api/provider/students")) {
          return Response.json({ students: [] });
        }
        if (
          url.includes("/api/availability-windows/window-id") &&
          init?.method === "PATCH"
        ) {
          return Response.json({ window: { id: "window-id" } });
        }
        if (url.includes("/api/availability-windows")) {
          return Response.json({ windows: [availabilityWindow] });
        }
        return Response.json({ appointments: [], activities: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);

    let events: Array<Record<string, unknown>> = [];
    await waitFor(() => expect(calendar.props?.events).toBeTypeOf("function"));
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<Array<Record<string, unknown>>>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
      const clickEvent = calendar.props?.eventClick as (input: unknown) => void;
      clickEvent({
        event: { extendedProps: events[0].extendedProps },
      });
    });

    expect(screen.getByRole("heading", { name: "editFreeTime" })).toBeTruthy();
    const date = document.querySelector<HTMLInputElement>('input[type="date"]');
    const times =
      document.querySelectorAll<HTMLInputElement>('input[type="time"]');
    fireEvent.change(date!, { target: { value: "2030-01-15" } });
    fireEvent.change(times[0], { target: { value: "13:00" } });
    fireEvent.change(times[1], { target: { value: "16:00" } });
    await user.click(
      screen.getByRole("button", { name: "saveFreeTimeChanges" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/availability-windows/window-id",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            startsAt: "2030-01-15T10:00:00.000Z",
            endsAt: "2030-01-15T13:00:00.000Z",
            recurrence: "weekly",
          }),
        }),
      );
    });
  });

  it("deletes an available-time window from its edit dialog", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => true);
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/account/appointments"))
          return Response.json({ appointments: [] });
        if (url.includes("/api/provider/students")) {
          return Response.json({ students: [] });
        }
        if (
          url.includes("/api/availability-windows/window-id") &&
          init?.method === "DELETE"
        ) {
          return Response.json({ deleted: true });
        }
        if (url.includes("/api/availability-windows")) {
          return Response.json({ windows: [availabilityWindow] });
        }
        return Response.json({ appointments: [], activities: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirm);
    render(<WorkspaceCalendar copy={copy} />);

    let events: Array<Record<string, unknown>> = [];
    await waitFor(() => expect(calendar.props?.events).toBeTypeOf("function"));
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<Array<Record<string, unknown>>>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
      const clickEvent = calendar.props?.eventClick as (input: unknown) => void;
      clickEvent({
        event: { extendedProps: events[0].extendedProps },
      });
    });

    await user.click(screen.getByRole("button", { name: "deleteFreeTime" }));

    expect(confirm).toHaveBeenCalledWith(copy.deleteFreeTimeConfirm);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/availability-windows/window-id",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("explains that removing a student preserves appointment history", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn(() => false);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account/appointments"))
        return Response.json({ appointments: [] });
      if (url.includes("/api/provider/students")) {
        return Response.json({
          students: [
            {
              id: "student-id",
              displayName: "Ada Student",
              email: "ada@example.com",
            },
          ],
        });
      }
      if (url.includes("/api/availability-windows")) {
        return Response.json({ windows: [] });
      }
      return Response.json({ appointments: [], activities: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirm);
    render(
      <ProviderDirectory
        kind="clients"
        copy={en.ProviderWorkspace.clients}
      />,
    );

    expect(await screen.findByText("Ada Student")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: `${en.ProviderWorkspace.clients.remove}: Ada Student`,
      }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "Remove Ada Student from your active clients? Existing and historical appointments will be preserved.",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/provider/students/student-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("deletes only the selected recurring occurrence from its edit dialog", async () => {
    const appointment = {
      id: "occurrence-id",
      appointmentId: "appointment-id",
      occurrenceStartsAt: "2030-01-15T09:00:00Z",
      recurrence: "weekly" as const,
      isException: false,
      providerStudentId: "student-id",
      studentName: "Ada",
      startsAt: "2030-01-15T09:00:00Z",
      endsAt: "2030-01-15T09:45:00Z",
      status: "scheduled" as const,
      comment: null,
      color: "#034f46",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/account/appointments"))
        return Response.json({ appointments: [] });
      if (url.includes("/api/provider/students")) {
        return Response.json({ students: [] });
      }
      if (url.includes("/api/availability-windows")) {
        return Response.json({ windows: [] });
      }
      if (url.includes("/api/provider/appointments/appointment-id")) {
        return Response.json({ deleted: true, scope: "occurrence" });
      }
      return Response.json({ appointments: [], activities: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<WorkspaceCalendar copy={copy} />);

    await act(async () => {
      const clickEvent = calendar.props?.eventClick as (input: unknown) => void;
      clickEvent({ event: { extendedProps: { appointment } } });
    });
    fireEvent.click(screen.getByRole("button", { name: "deleteThisSession" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/provider/appointments/appointment-id",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({
            deleteScope: "occurrence",
            occurrenceStartsAt: "2030-01-15T09:00:00Z",
          }),
        }),
      );
    });
  });

  it("moves a weekly occurrence in the provider time zone", async () => {
    const fetchMock = calendarFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);
    await waitFor(() =>
      expect(calendar.props?.eventDrop).toBeTypeOf("function"),
    );

    const revert = vi.fn();
    await act(async () => {
      const eventDrop = calendar.props?.eventDrop as (
        input: unknown,
      ) => Promise<void>;
      await eventDrop({
        oldEvent: { extendedProps: { appointment: scheduledAppointment } },
        event: {
          start: new Date(2030, 0, 16, 14, 0),
          end: new Date(2030, 0, 16, 14, 45),
        },
        revert,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/appointments/appointment-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          startsAt: "2030-01-16T11:00:00.000Z",
          endsAt: "2030-01-16T11:45:00.000Z",
          editScope: "exception",
          occurrenceStartsAt: "2030-01-15T09:00:00Z",
        }),
      }),
    );
    expect(revert).not.toHaveBeenCalled();
  });

  it("resizes a session and reverts a rejected overlap", async () => {
    const fetchMock = calendarFetchMock({
      appointmentMutation: new Response(
        JSON.stringify({ error: "This time overlaps another session" }),
        { status: 409 },
      ),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);
    await waitFor(() =>
      expect(calendar.props?.eventResize).toBeTypeOf("function"),
    );

    const revert = vi.fn();
    await act(async () => {
      const eventResize = calendar.props?.eventResize as (
        input: unknown,
      ) => Promise<void>;
      await eventResize({
        oldEvent: { extendedProps: { appointment: scheduledAppointment } },
        event: {
          start: new Date(2030, 0, 15, 12, 0),
          end: new Date(2030, 0, 15, 13, 0),
        },
        revert,
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/appointments/appointment-id",
      expect.objectContaining({
        body: JSON.stringify({
          startsAt: "2030-01-15T09:00:00.000Z",
          endsAt: "2030-01-15T10:00:00.000Z",
          editScope: "exception",
          occurrenceStartsAt: "2030-01-15T09:00:00Z",
        }),
      }),
    );
    expect(revert).toHaveBeenCalledTimes(1);
    expect(screen.getByText("This time overlaps another session")).toBeTruthy();
  });

  it("keeps cancelled sessions and availability projections fixed", async () => {
    const fetchMock = calendarFetchMock({
      appointments: [{ ...scheduledAppointment, status: "cancelled" }],
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceCalendar copy={copy} />);

    let events: Array<Record<string, unknown>> = [];
    await waitFor(() => expect(calendar.props?.events).toBeTypeOf("function"));
    await act(async () => {
      const loadEvents = calendar.props?.events as (range: {
        start: Date;
        end: Date;
      }) => Promise<Array<Record<string, unknown>>>;
      events = await loadEvents({
        start: new Date("2030-01-14T00:00:00Z"),
        end: new Date("2030-01-21T00:00:00Z"),
      });
    });

    expect(events[0]).toMatchObject({ editable: false });
  });
});

describe("session color contrast", () => {
  it("uses dark text on light colors and white text on dark colors", () => {
    expect(readableTextColor("#f0d7ff")).toBe("#1a1a1a");
    expect(readableTextColor("#034f46")).toBe("#ffffff");
  });
});

const copy = new Proxy(
  {
    title: "{name}’s sessions",
  },
  {
    get: (target, property) =>
      property in target
        ? target[property as keyof typeof target]
        : String(property),
  },
) as unknown as WorkspaceCalendarCopy;

const availabilityWindow = {
  id: "window-id",
  startsAt: "2030-01-07T09:00:00Z",
  endsAt: "2030-01-07T12:00:00Z",
  isActive: true,
  recurrence: "weekly",
};

const scheduledAppointment = {
  id: "occurrence-id",
  appointmentId: "appointment-id",
  occurrenceStartsAt: "2030-01-15T09:00:00Z",
  recurrence: "weekly" as const,
  isException: false,
  providerStudentId: "student-id",
  studentName: "Ada",
  startsAt: "2030-01-15T09:00:00Z",
  endsAt: "2030-01-15T09:45:00Z",
  status: "scheduled" as const,
  comment: null,
  color: "#034f46",
};

function calendarFetchMock({
  appointments = [scheduledAppointment],
  appointmentMutation = Response.json({ appointment: scheduledAppointment }),
}: {
  appointments?: Array<Record<string, unknown>>;
  appointmentMutation?: Response;
} = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/account/appointments"))
      return Response.json({ appointments: [] });
    if (url.includes("/api/provider/personal-activities"))
      return Response.json({ activities: [] });
    if (url.includes("/api/provider/students")) {
      return Response.json({ students: [] });
    }
    if (url.includes("/api/availability-windows")) {
      return Response.json({ windows: [] });
    }
    if (init?.method === "PATCH") return appointmentMutation.clone();
    return Response.json({ appointments, activities: [] });
  });
}
