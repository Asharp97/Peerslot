// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAppointments } from "@/components/provider-workspace/provider-appointments";
import messages from "@/messages/en.json";

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/components/provider-workspace/provider-shell", () => ({
  useProviderWorkspace: () => ({
    accessToken: "access-token",
    data: {
      profile: { displayName: "Ada" },
      bookingPage: {
        timeZone: "Europe/Istanbul",
        appointmentDurationMinutes: 45,
        bookingIntervalMinutes: 45,
        minimumNoticeHours: 0,
      },
    },
  }),
}));

// Keep the real event source, event mount hooks, and Radix menu; supply only
// FullCalendar's public API and the grid geometry that jsdom cannot lay out.
vi.mock("@fullcalendar/react", async () => {
  const { useEffect, useImperativeHandle, useState } = await import("react");
  type CalendarEvent = {
    id: string;
    start: string;
    extendedProps: Record<string, unknown>;
  };
  return {
    default: function CalendarMock(props: {
      ref: React.Ref<unknown>;
      events: (range: { start: Date; end: Date }) => Promise<CalendarEvent[]>;
      eventDidMount: (info: { el: HTMLElement; event: { id: string } }) => void;
    }) {
      const { events: loadEvents } = props;
      const [events, setEvents] = useState<CalendarEvent[]>([]);
      useEffect(() => {
        void loadEvents({
          start: new Date("2030-01-14T00:00:00Z"),
          end: new Date("2030-01-21T00:00:00Z"),
        }).then(setEvents);
      }, [loadEvents]);
      useImperativeHandle(props.ref, () => ({
        getApi: () => ({
          getEventById: (id: string) => {
            const event = events.find((item) => item.id === id);
            return event ? { ...event, start: new Date(event.start) } : null;
          },
          refetchEvents: vi.fn(),
        }),
      }));
      return (
        <>
          <button type="button">Calendar toolbar</button>
          {events.map((event) => (
            <button
              key={event.id}
              ref={(el) => {
                if (el) props.eventDidMount({ el, event });
              }}
              type="button"
            >
              {event.extendedProps.appointment
                ? "Source session"
                : "Available slot"}
            </button>
          ))}
          <div className="fc-timegrid-col" data-date="2030-01-16">
            Empty time
          </div>
          <table className="fc-timegrid-slots">
            <tbody>
              <tr>
                <td className="fc-timegrid-slot-lane" data-time="14:00:00" />
              </tr>
            </tbody>
          </table>
        </>
      );
    },
  };
});

const copy = messages.ProviderWorkspace.appointments;
const appointment = {
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
  comment: "Bring the workbook",
  color: "#034f46",
};

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 140,
    height: 40,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: 100,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup({
  source = appointment,
  mutationError = "",
  students = [{ id: "student-id", displayName: "Ada", email: null }],
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/provider/students") return Response.json({ students });
      if (url === "/api/availability-windows")
        return Response.json({
          windows: [
            {
              id: "window-id",
              startsAt: "2030-01-16T13:00:00Z",
              endsAt: "2030-01-16T13:45:00Z",
              recurrence: "none",
              isActive: true,
            },
          ],
        });
      if (init?.method === "POST")
        return mutationError
          ? Response.json({ error: mutationError }, { status: 409 })
          : Response.json(
              { appointment: { ...source, id: "new-id" } },
              { status: 201 },
            );
      return Response.json({ appointments: [source] });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<ProviderAppointments copy={copy} />);
  return fetchMock;
}

async function copySession() {
  fireEvent.contextMenu(
    await screen.findByRole("button", { name: "Source session" }),
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Copy session" }),
  );
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
}

async function pasteAtEmptyTime() {
  fireEvent.contextMenu(screen.getByText("Empty time"), { clientY: 130 });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Paste session" }),
  );
  await screen.findByRole("dialog");
}

describe("appointment copy and paste", () => {
  it("disables paste before copying and leaves toolbar right clicks alone", async () => {
    setup();
    await screen.findByRole("button", { name: "Source session" });
    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Calendar toolbar" }),
    );
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByText("Empty time"), { clientY: 130 });
    expect(
      (
        await screen.findByRole("menuitem", { name: "Paste session" })
      ).getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      screen
        .getByRole("menuitem", { name: "Copy session" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("copies details and posts a new session at the snapped provider time after review", async () => {
    const fetchMock = setup();
    await copySession();
    expect(
      screen.getByText("Copied Ada’s session. Right-click a time to paste it."),
    ).toBeTruthy();
    await pasteAtEmptyTime();
    expect(screen.getByDisplayValue("2030-01-16")).toBeTruthy();
    expect(screen.getByDisplayValue("14:15")).toBeTruthy();
    expect(screen.getByDisplayValue("15:00")).toBeTruthy();
    expect(screen.getByDisplayValue("Bring the workbook")).toBeTruthy();
    expect(screen.getByDisplayValue("#034f46")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/appointments",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerStudentId: "student-id",
          startsAt: "2030-01-16T11:15:00.000Z",
          endsAt: "2030-01-16T12:00:00.000Z",
          comment: "Bring the workbook",
          recurrence: "weekly",
          color: "#034f46",
        }),
      }),
    );
    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH"),
    ).toBe(false);
  });

  it("pastes an exception into an available slot as a one-time session", async () => {
    const fetchMock = setup({ source: { ...appointment, isException: true } });
    await copySession();
    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Available slot" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Paste session" }),
    );
    await screen.findByRole("dialog");
    expect(screen.getByDisplayValue("16:00")).toBeTruthy();
    expect(screen.getByDisplayValue("16:45")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const body = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    )?.[1]?.body;
    expect(JSON.parse(String(body))).toMatchObject({
      recurrence: "none",
      startsAt: "2030-01-16T13:00:00.000Z",
    });
  });

  it("finds the day beneath FullCalendar's overlaid time lanes", async () => {
    setup();
    await copySession();
    fireEvent.contextMenu(document.querySelector(".fc-timegrid-slot-lane")!, {
      clientX: 50,
      clientY: 130,
    });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Paste session" }),
    );
    await screen.findByRole("dialog");
    expect(screen.getByDisplayValue("2030-01-16")).toBeTruthy();
    expect(screen.getByDisplayValue("14:15")).toBeTruthy();
  });

  it("keeps the draft and clipboard when the server rejects a scheduling conflict", async () => {
    setup({ mutationError: "This time overlaps another session" });
    await copySession();
    await pasteAtEmptyTime();
    await userEvent.click(screen.getByRole("button", { name: "Save session" }));
    expect(
      await screen.findByText("This time overlaps another session"),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await pasteAtEmptyTime();
    expect(screen.getByDisplayValue("Bring the workbook")).toBeTruthy();
  });

  it("does not replace an occupied session and never truncates an overnight copy", async () => {
    setup({ source: { ...appointment, endsAt: "2030-01-15T21:00:00Z" } });
    await copySession();
    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Source session" }),
    );
    expect(
      (
        await screen.findByRole("menuitem", { name: "Paste session" })
      ).getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.contextMenu(screen.getByText("Empty time"), { clientY: 130 });
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Paste session" }),
    );
    expect(await screen.findByText(copy.pasteDayError)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prefills the name for review when the copied student is no longer active", async () => {
    setup({ students: [] });
    await copySession();
    await pasteAtEmptyTime();
    expect(screen.getByDisplayValue("Ada")).toBeTruthy();
    expect(screen.getAllByRole("combobox")[1].textContent).toContain(
      "Add a new student",
    );
  });
});
