// @vitest-environment jsdom
import type { EventInput } from "@fullcalendar/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCalendar } from "@/components/provider-workspace/workspace-calendar";
import { ProviderDirectory } from "@/components/provider-workspace/provider-directory";
import {
  personalActivityColor,
  type PersonalActivityOccurrence,
  type PersonalActivityName,
} from "@/lib/personal-activity";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

const calendar = vi.hoisted(() => ({
  props: {} as Record<string, unknown>,
  timeZone: "Europe/Istanbul",
}));
vi.mock("@fullcalendar/react", () => ({
  default: (props: Record<string, unknown>) => {
    calendar.props = props;
    return null;
  },
}));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@/components/provider-workspace/provider-shell", () => ({
  useProviderWorkspace: () => ({
    accessToken: "provider-token",
    data: {
      profile: { displayName: "Ada" },
      bookingPage: {
        timeZone: calendar.timeZone,
        appointmentDurationMinutes: 45,
        bookingIntervalMinutes: 75,
        minimumNoticeHours: 24,
      },
    },
  }),
}));
const copy = en.ProviderWorkspace.calendar;
const activity: PersonalActivityOccurrence = {
  id: "occurrence",
  scheduleId: "schedule-id",
  activityId: "activity-id",
  name: "Prayer",
  startsAt: "2030-01-15T09:45:00Z",
  endsAt: "2030-01-15T10:15:00Z",
  ruleStartsAt: "2030-01-15T09:45:00Z",
  ruleEndsAt: "2030-01-15T10:15:00Z",
  recurrence: "none",
};

beforeEach(() => {
  calendar.timeZone = "Europe/Istanbul";
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockCalendar(
  activities = [activity],
  names: PersonalActivityName[] = [
    { id: "activity-id", name: "Prayer", defaultDurationMinutes: null },
  ],
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method)
        return Response.json(
          url === "/api/provider/personal-activities"
            ? { activity: { id: "new-activity", name: "Gym" } }
            : { schedule: { id: "saved" } },
        );
      if (url.includes("personal-activities/schedules"))
        return Response.json({ activities });
      if (url.includes("personal-activities"))
        return Response.json({ activities: names });
      if (url.includes("students")) return Response.json({ students: [] });
      if (url.includes("availability-windows"))
        return Response.json({
          windows: [
            {
              id: "window",
              startsAt: "2030-01-15T09:00:00Z",
              endsAt: "2030-01-15T12:00:00Z",
              recurrence: "none",
              isActive: true,
            },
          ],
        });
      return Response.json({ appointments: [] });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
async function openPersonal(date = "2030-01-15T12:00:00") {
  const user = userEvent.setup();
  render(<WorkspaceCalendar copy={copy} />);
  await user.click(screen.getByRole("button", { name: copy.addToTimetable }));
  fireEvent.change(screen.getByLabelText(copy.date), {
    target: { value: date.slice(0, 10) },
  });
  fireEvent.change(screen.getByLabelText(copy.startsAt), {
    target: { value: date.slice(11, 16) },
  });
  await user.click(screen.getAllByRole("combobox")[0]);
  await user.click(screen.getByRole("option", { name: copy.personalActivity }));
  return user;
}
async function loadEvents() {
  let events: EventInput[] = [];
  await act(async () => {
    events = await (
      calendar.props.events as (range: unknown) => Promise<EventInput[]>
    )({
      start: new Date("2030-01-14T00:00:00Z"),
      end: new Date("2030-01-21T00:00:00Z"),
    });
  });
  return events;
}

describe("personal activities in the calendar", () => {
  it("saves custom personal time with no student, duration or rest fields and removes the old manager button", async () => {
    const fetchMock = mockCalendar();
    const user = await openPersonal();
    expect(
      screen.queryByRole("button", {
        name: en.ProviderWorkspace.clients.title,
      }),
    ).toBeNull();
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector('input[type="email"]')).toBeNull();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("combobox", { name: copy.activityName })
          .textContent,
      ).toContain("Prayer"),
    );
    const times =
      dialog.querySelectorAll<HTMLInputElement>('input[type="time"]');
    expect(times[0].value).toBe("12:00");
    expect(times[1].value).toBe("13:00"); // Independent of the configured 45-minute session.
    fireEvent.change(times[1], { target: { value: "12:07" } });
    await user.click(
      within(dialog).getByRole("button", { name: copy.saveActivity }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(mutations).toHaveLength(1);
    expect(mutations[0][0]).toBe("/api/provider/personal-activities/schedules");
    expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
      activityId: "activity-id",
      startsAt: "2030-01-15T09:00:00.000Z",
      endsAt: "2030-01-15T09:07:00.000Z",
      recurrence: "none",
    });
  });

  it("creates a reusable activity name directly from Add without creating a student", async () => {
    const fetchMock = mockCalendar([], []);
    const user = await openPersonal();
    await user.type(
      screen.getByRole("textbox", { name: copy.newActivityName }),
      "Gym",
    );
    await user.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(mutations.map(([url]) => url)).toEqual([
      "/api/provider/personal-activities",
      "/api/provider/personal-activities/schedules",
    ]);
    expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
      name: "Gym",
      defaultDurationMinutes: null,
    });
    expect(JSON.parse(String(mutations[1][1]?.body)).activityId).toBe(
      "new-activity",
    );
  });

  it("renders amber activities and retains available slots touching their boundaries", async () => {
    mockCalendar();
    render(<WorkspaceCalendar copy={copy} />);
    const events = await loadEvents();
    expect(events.find((event) => event.title === "Prayer")).toMatchObject({
      backgroundColor: personalActivityColor,
      borderColor: "#b7791f",
      editable: true,
      start: "2030-01-15T12:45:00",
      end: "2030-01-15T13:15:00",
    });
    expect(
      events
        .filter((event) => event.title === copy.availableSlot)
        .map((event) => event.start),
    ).toEqual(["2030-01-15T12:00:00", "2030-01-15T13:15:00"]);
    const content = (
      calendar.props.eventContent as (info: unknown) => React.ReactNode
    )({
      event: {
        title: activity.name,
        extendedProps: { personalActivity: activity },
      },
      timeText: "12:45 – 13:15",
    });
    render(<>{content}</>);
    expect(screen.getByText("Prayer")).toBeTruthy();
  });

  it("moves a personal activity in the provider time zone using its independent endpoint", async () => {
    const fetchMock = mockCalendar();
    render(<WorkspaceCalendar copy={copy} />);
    const revert = vi.fn();
    await act(async () => {
      await (calendar.props.eventDrop as (arg: unknown) => Promise<void>)({
        oldEvent: { extendedProps: { personalActivity: activity } },
        event: {
          start: new Date("2030-01-15T13:07:00"),
          end: new Date("2030-01-15T13:24:00"),
        },
        revert,
      });
    });
    expect(revert).not.toHaveBeenCalled();
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    )!;
    expect(mutation[0]).toBe(
      "/api/provider/personal-activities/schedules/schedule-id/move",
    );
    expect(JSON.parse(String(mutation[1]?.body))).toEqual({
      originalStartsAt: activity.startsAt,
      startsAt: "2030-01-15T10:07:00.000Z",
    });
  });

  it("shows weekly edit scope and deletes a schedule without deleting its reusable name", async () => {
    const weekly = {
      ...activity,
      recurrence: "weekly" as const,
      ruleStartsAt: "2030-01-08T09:45:00Z",
      ruleEndsAt: "2030-01-08T10:15:00Z",
    };
    const fetchMock = mockCalendar([weekly]);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<WorkspaceCalendar copy={copy} />);
    const events = await loadEvents();
    expect(events[0].editable).toBe(true);
    await act(async () => {
      (calendar.props.eventClick as (arg: unknown) => void)({
        event: { extendedProps: { personalActivity: weekly } },
      });
    });
    expect(screen.getByText(copy.activitySeriesHelp)).toBeTruthy();
    expect(
      screen
        .getByRole("dialog")
        .querySelector<HTMLInputElement>('input[type="date"]')?.value,
    ).toBe("2030-01-08");
    fireEvent.click(screen.getByRole("button", { name: copy.deleteActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(confirm).toHaveBeenCalledWith(copy.deleteActivityConfirm);
    expect(
      fetchMock.mock.calls
        .filter(([, init]) => init?.method === "DELETE")
        .map(([url]) => url),
    ).toEqual(["/api/provider/personal-activities/schedules/schedule-id"]);
  });
});

describe("activity management page", () => {
  it.each(["en", "tr"] as const)(
    "adds, renames and deletes by name only in %s",
    async (locale) => {
      const messages = (locale === "en" ? en : tr).ProviderWorkspace
        .personalActivities;
      let entries: { id: string; name: string }[] = [];
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "POST")
            entries = [{ id: "activity-id", ...JSON.parse(String(init.body)) }];
          if (init?.method === "PATCH")
            entries = [{ id: "activity-id", ...JSON.parse(String(init.body)) }];
          if (init?.method === "DELETE") entries = [];
          return Response.json({ activities: entries });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true),
      );
      const user = userEvent.setup();
      render(<ProviderDirectory kind="activities" copy={messages} />);
      await screen.findByText(messages.empty);
      expect(screen.getAllByRole("textbox")).toHaveLength(1);
      expect(screen.queryByRole("dialog")).toBeNull();
      await user.type(
        screen.getByRole("textbox", { name: messages.name }),
        "Gym",
      );
      await user.click(screen.getByRole("button", { name: messages.add }));
      await screen.findByText("Gym");
      await user.click(
        screen.getByRole("button", { name: `${messages.edit}: Gym` }),
      );
      const name = screen.getByRole("textbox", { name: messages.name });
      await user.clear(name);
      await user.type(name, "Lunch");
      await user.click(screen.getByRole("button", { name: messages.save }));
      await screen.findByText("Lunch");
      await user.click(
        screen.getByRole("button", { name: `${messages.remove}: Lunch` }),
      );
      await screen.findByText(messages.empty);
      const changes = fetchMock.mock.calls
        .filter(([, init]) => init?.body)
        .map(([, init]) => JSON.parse(String(init?.body)));
      expect(changes).toEqual([
        { name: "Gym", defaultDurationMinutes: null },
        { name: "Lunch", defaultDurationMinutes: null },
      ]);
    },
  );
});

describe("personal activity default duration controls", () => {
  it("saves the exact duration when the end falls in a repeated daylight-saving hour", async () => {
    calendar.timeZone = "America/New_York";
    const fetchMock = mockCalendar(
      [],
      [{ id: "activity-id", name: "Prayer", defaultDurationMinutes: 30 }],
    );
    const user = await openPersonal("2030-11-03T01:45:00");
    await waitFor(() =>
      expect(
        (screen.getByLabelText(copy.endsAt) as HTMLInputElement).value,
      ).toBe("01:15"),
    );
    await user.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(mutation[1]?.body))).toMatchObject({
      startsAt: "2030-11-03T05:45:00.000Z",
      endsAt: "2030-11-03T06:15:00.000Z",
    });
  });
  it("automatically fills the chosen start and end, follows start/date edits and crosses midnight", async () => {
    const fetchMock = mockCalendar(
      [],
      [{ id: "activity-id", name: "Prayer", defaultDurationMinutes: 17 }],
    );
    const user = await openPersonal();
    const end = screen.getByLabelText(copy.endsAt) as HTMLInputElement;
    await waitFor(() => expect(end.value).toBe("12:17"));
    expect(
      (screen.getByLabelText(copy.startsAt) as HTMLInputElement).value,
    ).toBe("12:00");
    fireEvent.change(screen.getByLabelText(copy.startsAt), {
      target: { value: "23:50" },
    });
    expect(end.value).toBe("00:07");
    expect(
      (screen.getByLabelText(copy.endDate) as HTMLInputElement).value,
    ).toBe("2030-01-16");
    fireEvent.change(screen.getByLabelText(copy.date), {
      target: { value: "2030-01-17" },
    });
    expect(
      (screen.getByLabelText(copy.endDate) as HTMLInputElement).value,
    ).toBe("2030-01-18");
    await user.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutation = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )!;
    expect(JSON.parse(String(mutation[1]?.body))).toMatchObject({
      startsAt: "2030-01-17T20:50:00.000Z",
      endsAt: "2030-01-17T21:07:00.000Z",
    });
  });

  it("uses each activity's own duration and keeps custom times editable when no default exists", async () => {
    mockCalendar(
      [],
      [
        { id: "activity-id", name: "Prayer", defaultDurationMinutes: 17 },
        { id: "gym", name: "Gym", defaultDurationMinutes: 90 },
        { id: "custom", name: "Custom", defaultDurationMinutes: null },
      ],
    );
    const user = await openPersonal();
    const end = screen.getByLabelText(copy.endsAt) as HTMLInputElement;
    await waitFor(() => expect(end.value).toBe("12:17"));
    await user.click(screen.getByRole("combobox", { name: copy.activityName }));
    await user.click(screen.getByRole("option", { name: "Gym" }));
    expect(end.value).toBe("13:30");
    await user.click(screen.getByRole("combobox", { name: copy.activityName }));
    await user.click(screen.getByRole("option", { name: "Custom" }));
    expect(end.disabled).toBe(false);
    fireEvent.change(end, { target: { value: "12:39" } });
    fireEvent.change(screen.getByLabelText(copy.startsAt), {
      target: { value: "12:07" },
    });
    expect(end.value).toBe("12:39");
  });

  it("allows a duration to be entered while creating an activity directly in the calendar", async () => {
    const fetchMock = mockCalendar([], []);
    const user = await openPersonal();
    await user.type(
      screen.getByRole("textbox", { name: copy.newActivityName }),
      "Gym",
    );
    await user.type(
      screen.getByRole("spinbutton", { name: copy.activityDurationLabel }),
      "90",
    );
    expect((screen.getByLabelText(copy.endsAt) as HTMLInputElement).value).toBe(
      "13:30",
    );
    await user.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutations = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
      name: "Gym",
      defaultDurationMinutes: 90,
    });
    expect(JSON.parse(String(mutations[1][1]?.body))).toMatchObject({
      startsAt: "2030-01-15T09:00:00.000Z",
      endsAt: "2030-01-15T10:30:00.000Z",
    });
  });

  it("preserves an existing schedule when its activity now has a different default", async () => {
    mockCalendar(
      [activity],
      [
        {
          id: activity.activityId,
          name: activity.name,
          defaultDurationMinutes: 90,
        },
      ],
    );
    render(<WorkspaceCalendar copy={copy} />);
    await act(async () => {
      (calendar.props.eventClick as (arg: unknown) => void)({
        event: { extendedProps: { personalActivity: activity } },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: copy.activityName }).textContent,
      ).toContain("Prayer"),
    );
    expect(
      (screen.getByLabelText(copy.startsAt) as HTMLInputElement).value,
    ).toBe("12:45");
    expect((screen.getByLabelText(copy.endsAt) as HTMLInputElement).value).toBe(
      "13:15",
    );
  });

  it("allows overriding one occurrence without changing its saved default", async () => {
    const fetchMock = mockCalendar(
      [],
      [{ id: "activity-id", name: "Prayer", defaultDurationMinutes: 17 }],
    );
    const user = await openPersonal();
    const end = screen.getByLabelText(copy.endsAt) as HTMLInputElement;
    await waitFor(() => expect(end.value).toBe("12:17"));
    fireEvent.change(end, { target: { value: "12:32" } });
    fireEvent.change(screen.getByLabelText(copy.startsAt), {
      target: { value: "12:05" },
    });
    expect(end.value).toBe("12:32");
    await user.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(mutations).toHaveLength(1);
    expect(mutations[0][0]).toBe("/api/provider/personal-activities/schedules");
  });

  it.each(["en", "tr"] as const)(
    "adds, edits, and clears an activity's default duration in %s",
    async (locale) => {
      const messages = (locale === "en" ? en : tr).ProviderWorkspace
        .personalActivities;
      let entries: PersonalActivityName[] = [];
      const fetchMock = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method)
            entries = [{ id: "activity-id", ...JSON.parse(String(init.body)) }];
          return Response.json({ activities: entries });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<ProviderDirectory kind="activities" copy={messages} />);
      await screen.findByText(messages.empty);
      await user.type(
        screen.getByRole("textbox", { name: messages.name }),
        "Gym",
      );
      await user.type(
        screen.getByRole("spinbutton", { name: messages.durationLabel }),
        "60",
      );
      await user.click(screen.getByRole("button", { name: messages.add }));
      await screen.findByText(
        messages.durationSummary.replace("{minutes}", "60"),
      );
      await user.click(
        screen.getByRole("button", { name: messages.edit + ": Gym" }),
      );
      const duration = screen.getByRole("spinbutton", {
        name: messages.durationLabel,
      }) as HTMLInputElement;
      expect(duration.value).toBe("60");
      await user.clear(duration);
      await user.type(duration, "90");
      await user.click(screen.getByRole("button", { name: messages.save }));
      await screen.findByText(
        messages.durationSummary.replace("{minutes}", "90"),
      );
      await user.click(
        screen.getByRole("button", { name: messages.edit + ": Gym" }),
      );
      await user.clear(duration);
      await user.click(screen.getByRole("button", { name: messages.save }));
      await screen.findByText(messages.customDuration);
      expect(
        fetchMock.mock.calls
          .filter(([, init]) => init?.body)
          .map(
            ([, init]) => JSON.parse(String(init?.body)).defaultDurationMinutes,
          ),
      ).toEqual([60, 90, null]);
    },
  );
});

describe("calendar block drag interactions", () => {
  it.each(["none", "weekly"] as const)(
    "drags a %s personal activity by occurrence and retains the provider time zone",
    async (recurrence) => {
      const item = { ...activity, recurrence };
      const fetchMock = mockCalendar([item]);
      render(<WorkspaceCalendar copy={copy} />);
      const events = await loadEvents();
      expect(events[0].editable).toBe(true);
      const revert = vi.fn();
      await act(async () => {
        await (calendar.props.eventDrop as (info: unknown) => Promise<void>)({
          oldEvent: { extendedProps: events[0].extendedProps },
          event: {
            start: new Date("2030-01-16T13:10:00"),
            end: new Date("2030-01-16T13:40:00"),
          },
          revert,
        });
      });
      const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
      expect(mutations).toHaveLength(1);
      expect(mutations[0][0]).toBe(
        "/api/provider/personal-activities/schedules/schedule-id/move",
      );
      expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
        originalStartsAt: activity.startsAt,
        startsAt: "2030-01-16T10:10:00.000Z",
      });
      expect(revert).not.toHaveBeenCalled();
    },
  );
  it("makes each green block draggable while keeping its fixed duration", async () => {
    const fetchMock = mockCalendar([]);
    render(<WorkspaceCalendar copy={copy} />);
    const event = (await loadEvents()).find(
      (item) => item.extendedProps?.availabilitySlot,
    )!;
    expect(event.editable).toBe(true);
    expect(event.durationEditable).toBe(false);
    const revert = vi.fn();
    await act(async () => {
      await (calendar.props.eventDrop as (info: unknown) => Promise<void>)({
        oldEvent: { extendedProps: event.extendedProps },
        event: {
          start: new Date("2030-01-16T13:10:00"),
          end: new Date("2030-01-16T13:55:00"),
        },
        revert,
      });
    });
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method);
    expect(mutations[0][0]).toBe("/api/availability-windows/window/move");
    expect(JSON.parse(String(mutations[0][1]?.body))).toEqual({
      originalStartsAt: "2030-01-15T09:00:00.000Z",
      startsAt: "2030-01-16T10:10:00.000Z",
    });
    expect(revert).not.toHaveBeenCalled();
  });
  it("reverts a rejected green-block drag and displays the specific error", async () => {
    const fetchMock = mockCalendar([]);
    render(<WorkspaceCalendar copy={copy} />);
    const event = (await loadEvents()).find(
      (item) => item.extendedProps?.availabilitySlot,
    )!;
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: "calendar_block_conflict" }, { status: 409 }),
    );
    const revert = vi.fn();
    await act(async () => {
      await (calendar.props.eventDrop as (info: unknown) => Promise<void>)({
        oldEvent: { extendedProps: event.extendedProps },
        event: {
          start: new Date("2030-01-16T13:10:00"),
          end: new Date("2030-01-16T13:55:00"),
        },
        revert,
      });
    });
    expect(revert).toHaveBeenCalledOnce();
    expect(screen.getByText(copy.calendarBlockConflict)).toBeTruthy();
  });
  it("editing and deleting a dragged weekly activity targets only the moved occurrence", async () => {
    const moved = {
      ...activity,
      recurrence: "weekly" as const,
      isMoved: true,
      originalStartsAt: activity.startsAt,
      startsAt: "2030-01-16T10:10:00Z",
      endsAt: "2030-01-16T10:40:00Z",
    };
    const fetchMock = mockCalendar([moved]);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<WorkspaceCalendar copy={copy} />);
    const click = async () =>
      act(async () => {
        (calendar.props.eventClick as (info: unknown) => void)({
          event: { extendedProps: { personalActivity: moved } },
        });
      });
    await click();
    expect((screen.getByLabelText(copy.date) as HTMLInputElement).value).toBe(
      "2030-01-16",
    );
    expect(screen.queryByText(copy.activitySeriesHelp)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.saveActivity }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const patch = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    )!;
    expect(patch[0]).toBe(
      "/api/provider/personal-activities/schedules/schedule-id/move",
    );
    expect(JSON.parse(String(patch[1]?.body))).toEqual({
      originalStartsAt: activity.startsAt,
      startsAt: "2030-01-16T10:10:00.000Z",
      endsAt: "2030-01-16T10:40:00.000Z",
    });
    await click();
    fireEvent.click(
      screen.getByRole("button", { name: copy.deleteMovedBlock }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const deletion = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    )!;
    expect(deletion[0]).toBe(patch[0]);
    expect(JSON.parse(String(deletion[1]?.body))).toEqual({
      originalStartsAt: activity.startsAt,
    });
  });
});

describe("editing moved availability", () => {
  it("edits or deletes only the selected green block and keeps its duration fixed", async () => {
    const fetchMock = mockCalendar([]);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(<WorkspaceCalendar copy={copy} />);
    const props = {
      availabilityWindow: {
        id: "window",
        startsAt: "2030-01-15T09:00:00Z",
        endsAt: "2030-01-15T12:00:00Z",
        isActive: true,
        recurrence: "weekly",
      },
      availabilityMoved: true,
      availabilityOriginalStartsAt: "2030-01-15T09:00:00.000Z",
      availabilityOccurrence: {
        startsAt: "2030-01-16T09:00:00Z",
        endsAt: "2030-01-16T09:45:00Z",
      },
    };
    const click = async () =>
      act(async () => {
        (calendar.props.eventClick as (info: unknown) => void)({
          event: { extendedProps: props },
        });
      });
    await click();
    expect((screen.getByLabelText(copy.date) as HTMLInputElement).value).toBe(
      "2030-01-16",
    );
    expect(
      (screen.getByLabelText(copy.endsAt) as HTMLInputElement).readOnly,
    ).toBe(true);
    expect(screen.queryByText(copy.repetition)).toBeNull();
    fireEvent.change(screen.getByLabelText(copy.startsAt), {
      target: { value: "15:10" },
    });
    expect((screen.getByLabelText(copy.endsAt) as HTMLInputElement).value).toBe(
      "15:55",
    );
    fireEvent.click(
      screen.getByRole("button", { name: copy.saveFreeTimeChanges }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const patch = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    )!;
    expect(patch[0]).toBe("/api/availability-windows/window/move");
    expect(JSON.parse(String(patch[1]?.body))).toEqual({
      originalStartsAt: props.availabilityOriginalStartsAt,
      startsAt: "2030-01-16T12:10:00.000Z",
      endsAt: "2030-01-16T12:55:00.000Z",
    });
    await click();
    fireEvent.click(
      screen.getByRole("button", { name: copy.deleteMovedBlock }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const deletion = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    )!;
    expect(deletion[0]).toBe(patch[0]);
    expect(JSON.parse(String(deletion[1]?.body))).toEqual({
      originalStartsAt: props.availabilityOriginalStartsAt,
    });
  });
});
