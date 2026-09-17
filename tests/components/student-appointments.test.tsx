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
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentAppointments } from "@/components/student-appointments";
import messages from "@/messages/en.json";
import type {
  CalendarOptions,
  EventClickArg,
  DatesSetArg,
} from "@fullcalendar/core";

const calendar = vi.hoisted(() => ({ props: {} as CalendarOptions }));
vi.mock("@fullcalendar/react", () => ({
  default: (props: CalendarOptions) => {
    calendar.props = props;
    return <div data-testid="attendee-calendar" />;
  },
}));

const copy = messages.Account.appointments;
const appointment = {
  id: "appointment-id",
  occurrenceStartsAt: "2030-01-18T09:00:00Z",
  startsAt: "2030-01-18T09:00:00Z",
  endsAt: "2030-01-18T09:30:00Z",
  providerName: "Ada Provider",
  timeZone: "Europe/Istanbul",
  status: "scheduled",
  minimumNoticeHours: 24,
  canChange: true,
  canReschedule: true,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(canChange = true) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Response.json({ appointment });
      if (String(input).includes("appointment-id?"))
        return Response.json({
          availableTimes: [
            {
              startsAt: "2030-01-15T10:00:00Z",
              endsAt: "2030-01-15T10:30:00Z",
            },
          ],
        });
      return Response.json({
        appointments: [{ ...appointment, canChange, canReschedule: canChange }],
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<StudentAppointments accessToken="token" locale="en" copy={copy} />);
  return fetchMock;
}
describe("student appointment controls", () => {
  it("displays lessons in a read-only calendar and can open the attendee controls", async () => {
    setup();
    await screen.findByText("Ada Provider");
    expect(calendar.props.editable).toBe(false);
    const events = calendar.props.events as Array<{
      id: string;
      title: string;
      editable: boolean;
      extendedProps: Record<string, unknown>;
    }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Lesson with Ada Provider · Confirmed",
      editable: false,
    });
    act(() => {
      calendar.props.eventClick?.({
        event: events[0],
      } as unknown as EventClickArg);
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: copy.detailsTitle }),
    ).toBeTruthy();
  });
  it("loads the week being viewed, including weeks outside the old 90-day window", async () => {
    const fetchMock = setup();
    await screen.findByText("Ada Provider");
    act(() => {
      calendar.props.datesSet?.({
        start: new Date("2030-06-03T00:00:00Z"),
        end: new Date("2030-06-10T00:00:00Z"),
      } as DatesSetArg);
    });
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("startsAt=2030-06-03"),
        ),
      ).toBe(true),
    );
    const latest = fetchMock.mock.calls.at(-1)!;
    const params = new URL(String(latest[0]), "http://localhost").searchParams;
    expect(params.get("endsAt")).toBe("2030-06-10T00:00:00.000Z");
  });
  it("offers a retry when calendar loading fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(
        Response.json({
          appointments: [{ ...appointment, status: "pending" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<StudentAppointments accessToken="token" locale="en" copy={copy} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: copy.refresh }));
    await screen.findByText("Ada Provider");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calendar.props.events).toMatchObject([
      { title: "Lesson with Ada Provider · Awaiting confirmation" },
    ]);
  });
  it("locks both actions when the existing appointment is inside notice", async () => {
    setup(false);
    await screen.findByText("Ada Provider");
    expect(
      (screen.getByRole("button", { name: copy.cancel }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: copy.reschedule,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(copy.locked)).toBeTruthy();
  });
  it("confirms a cancellation against the existing occurrence", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: copy.cancel }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: copy.confirmCancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/appointments/appointment-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          action: "cancel",
          occurrenceStartsAt: appointment.occurrenceStartsAt,
        }),
      }),
    );
  });
  it("submits the selected replacement time without changing the original occurrence identity", async () => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.setPointerCapture = () => undefined;
    HTMLElement.prototype.releasePointerCapture = () => undefined;
    HTMLElement.prototype.scrollIntoView = () => undefined;
    const fetchMock = setup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: copy.reschedule }),
    );
    await user.click(await screen.findByRole("combobox"));
    await user.click(screen.getByRole("option"));
    await user.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/appointments/appointment-id",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          action: "reschedule",
          occurrenceStartsAt: appointment.occurrenceStartsAt,
          startsAt: "2030-01-15T10:00:00Z",
        }),
      }),
    );
  });
});
