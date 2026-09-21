// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentAgenda } from "@/components/appointments/appointment-agenda";
import { AppointmentCard } from "@/components/appointments/appointment-card";
import {
  groupAppointmentsByDate,
  formatAppointmentTime,
} from "@/lib/appointment-presentation";
import type { AgendaAppointment } from "@/lib/appointment-agenda";
import messages from "@/messages/en.json";
import turkishMessages from "@/messages/tr.json";

vi.mock("@/i18n/navigation", () => ({
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

const copy = messages.Account.appointments;
const appointment: AgendaAppointment = {
  id: "appointment-id",
  occurrenceStartsAt: "2030-01-18T09:00:00Z",
  startsAt: "2030-01-18T09:00:00Z",
  endsAt: "2030-01-18T09:30:00Z",
  providerName: "Ada Provider",
  providerAvatar: null,
  role: "attending",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  timeZone: "Europe/Istanbul",
  status: "scheduled",
  minimumNoticeHours: 24,
  weeklyRescheduleLimit: 1,
  reschedulesRemaining: 1,
  rescheduleResetsAt: "2030-01-20T21:00:00Z",
  canChange: true,
  canReschedule: true,
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(overrides: Partial<AgendaAppointment> = {}, locale = "en") {
  let saved = false;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        saved = true;
        return Response.json({ appointment });
      }
      if (String(input).includes("appointment-id?"))
        return Response.json({
          availableTimes: [
            {
              startsAt: "2030-01-15T10:00:00Z",
              endsAt: "2030-01-15T10:30:00Z",
            },
          ],
        });
      const past = String(input).includes("view=past");
      return Response.json({
        appointments: past || saved ? [] : [{ ...appointment, ...overrides }],
        nextCursor: null,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<AppointmentAgenda accessToken="token" locale={locale} copy={copy} />);
  return fetchMock;
}

describe("appointment agenda", () => {
  it("renders chronological date groups and a real meeting action opening a new tab", async () => {
    setup();
    const provider = await screen.findByRole("heading", {
      name: "Ada Provider",
    });
    const card = provider.closest("article")!;
    expect(within(card).getByText(copy.statuses.scheduled)).toBeTruthy();
    expect(within(card).getByText(copy.roles.attending)).toBeTruthy();
    const link = within(card).getByRole("link", {
      name: /Google Meet.*Join meeting/,
    });
    expect(link.getAttribute("href")).toBe(appointment.meetingUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(card.querySelector("time")?.dateTime).toBe(appointment.startsAt);
    expect(
      screen
        .getByRole("tab", { name: copy.upcoming })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.querySelector(".fc")).toBeNull();
  });

  it("shows a card skeleton while loading and separate empty Upcoming/Past states", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ appointments: [], nextCursor: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AppointmentAgenda accessToken="token" locale="en" copy={copy} />);
    expect(screen.getByRole("status", { name: copy.loading })).toBeTruthy();
    await screen.findByRole("heading", { name: copy.upcomingEmpty });
    await userEvent.click(screen.getByRole("tab", { name: copy.past }));
    await screen.findByRole("heading", { name: copy.pastEmpty });
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/account/appointments?view=past",
    );
  });

  it("explains pending approval and hides meeting details even if a URL was supplied", async () => {
    setup({ status: "pending" });
    await screen.findByText(copy.statuses.pending);
    expect(screen.getByText(copy.pendingBody)).toBeTruthy();
    expect(screen.getByText(copy.pendingMeeting)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hides changes inside notice while preserving the confirmed meeting action", async () => {
    setup({ canChange: false, canReschedule: false });
    await screen.findByText(copy.locked);
    expect(screen.queryByRole("button", { name: copy.cancel })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.reschedule })).toBeNull();
    expect(screen.getByRole("link", { name: /Join meeting/ })).toBeTruthy();
  });

  it.each(["completed", "cancelled", "declined", "expired"] as const)(
    "shows %s without join or change actions",
    (status) => {
      render(
        <AppointmentCard
          appointment={{ ...appointment, status }}
          locale="en"
          timeZone="UTC"
          copy={copy}
          onAction={vi.fn()}
        />,
      );
      expect(screen.getByText(copy.statuses[status])).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("link")).toBeNull();
    },
  );

  it("marks appointments hosted by the signed-in professional", () => {
    render(
      <AppointmentCard
        appointment={{ ...appointment, role: "hosting", providerName: "Sam Client" }}
        locale="en"
        timeZone="UTC"
        copy={copy}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText(copy.roles.hosting)).toBeTruthy();
    expect(screen.getByText("Sam Client")).toBeTruthy();
    expect(screen.getByText(copy.roles.hosting).tagName).toBe("P");
    expect(screen.getByText(copy.statuses.scheduled).tagName).toBe("SPAN");
    expect(screen.getByRole("link", { name: copy.manageHosted }).getAttribute("href")).toBe("/provider/appointments");
    expect(screen.queryByRole("button", { name: copy.cancel })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.reschedule })).toBeNull();
    expect(screen.queryByText(copy.locked)).toBeNull();
  });

  it.each([messages.Account.appointments, turkishMessages.Account.appointments])("uses host-specific pending copy and a review action", (localizedCopy) => {
    render(<AppointmentCard
      appointment={{ ...appointment, role: "hosting", status: "pending" }}
      locale="en" timeZone="UTC" copy={localizedCopy} onAction={vi.fn()}
    />);
    expect(screen.getByText(localizedCopy.pendingHostingBody)).toBeTruthy();
    expect(screen.queryByText(localizedCopy.pendingBody)).toBeNull();
    expect(screen.getByRole("link", { name: localizedCopy.reviewRequest }).getAttribute("href")).toBe("/provider/requests");
    expect(screen.queryByRole("link", { name: /Google Meet/ })).toBeNull();
  });

  it("shows a supplied service and physical location without a meeting link", () => {
    render(
      <AppointmentCard
        appointment={{
          ...appointment,
          serviceName: "Consultation",
          location: "25 Example Street",
        }}
        locale="en"
        timeZone="UTC"
        copy={copy}
        onAction={vi.fn()}
      />,
    );
    expect(screen.getByText("Consultation")).toBeTruthy();
    expect(screen.getByText("25 Example Street")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("retries a failed fetch without showing a misleading empty state", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(
        Response.json({ appointments: [appointment], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AppointmentAgenda accessToken="token" locale="en" copy={copy} />);
    expect((await screen.findByRole("alert")).textContent).toBe(copy.loadError);
    expect(screen.queryByText(copy.upcomingEmpty)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: copy.retry }));
    await screen.findByText("Ada Provider");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits cancellation for the original occurrence and reloads after success", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: copy.cancel }));
    await user.click(screen.getByRole("button", { name: copy.confirmCancel }));
    await screen.findByText(copy.cancelSuccess);
    await screen.findByText(copy.upcomingEmpty);
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

  it("keeps the card unchanged and reports a rejected cancellation", async () => {
    const fetchMock = setup();
    await screen.findByText("Ada Provider");
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "notice" }, { status: 403 }),
    );
    const before = document.querySelector("article")!.textContent;
    await userEvent.click(screen.getByRole("button", { name: copy.cancel }));
    await userEvent.click(
      screen.getByRole("button", { name: copy.confirmCancel }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      copy.noticeError,
    );
    expect(document.querySelector("article")!.textContent).toBe(before);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: copy.back }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: copy.cancel })).toBe(
      document.activeElement,
    );
  });

  it("uses the shared slot picker and preserves occurrence identity when rescheduling", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: copy.reschedule }),
    );
    const slot = await screen.findByRole("button", {
      name: /Tuesday, January 15, 2030/,
    });
    await user.click(slot);
    expect(slot.getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: copy.save }));
    await screen.findByText(copy.rescheduleSuccess);
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

  it("appends pages, uses the cursor and keeps loaded cards on a page error", async () => {
    const fetchMock = setup();
    await screen.findByText("Ada Provider");
    fetchMock.mockResolvedValueOnce(
      Response.json({ appointments: [appointment], nextCursor: "next-page" }),
    );
    fireEvent(window, new Event("focus"));
    await screen.findByRole("button", { name: copy.loadMore });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(screen.getByRole("button", { name: copy.loadMore }));
    await screen.findByRole("alert");
    expect(screen.getByText("Ada Provider")).toBeTruthy();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("cursor=next-page");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        appointments: [
          { ...appointment, id: "second", providerName: "Another provider" },
        ],
        nextCursor: null,
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: copy.retry }));
    await screen.findByText("Another provider");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("supports Arabic RTL tabs and dialog direction", async () => {
    setup({}, "ar");
    await screen.findByText("Ada Provider");
    expect(
      screen.getByRole("tablist").closest("[dir]")?.getAttribute("dir"),
    ).toBe("rtl");
    await userEvent.click(screen.getByRole("button", { name: copy.cancel }));
    expect(screen.getByRole("dialog").getAttribute("dir")).toBe("rtl");
  });
});

describe("appointment date presentation", () => {
  it("sorts without mutating and groups Today/Tomorrow in the viewer timezone across a DST change", () => {
    const now = new Date("2030-03-10T04:30:00Z"); // March 9 in New York
    const rows = [
      { ...appointment, startsAt: "2030-03-10T14:00:00Z" },
      { ...appointment, startsAt: "2030-03-10T04:45:00Z" },
    ];
    const groups = groupAppointmentsByDate(
      rows,
      "upcoming",
      "en",
      "America/New_York",
      copy,
      now,
    );
    expect(groups.map((group) => group.label)).toEqual(["Today", "Tomorrow"]);
    expect(rows[0].startsAt).toBe("2030-03-10T14:00:00Z");
    expect(
      groupAppointmentsByDate(
        rows,
        "past",
        "en",
        "America/New_York",
        copy,
        now,
      ).map((group) => group.label),
    ).toEqual(["Tomorrow", "Today"]);
  });
  it("labels both dates when a time range crosses midnight", () => {
    const formatted = formatAppointmentTime(
      { startsAt: "2030-01-18T23:30:00Z", endsAt: "2030-01-19T00:30:00Z" },
      "en",
      "UTC",
    );
    expect(formatted).toContain("Jan 18");
    expect(formatted).toContain("Jan 19");
  });
});

describe("weekly reschedule allowance feedback", () => {
  it("shows the weekly reset while leaving eligible cancellation available", async () => {
    setup({ canReschedule: false, reschedulesRemaining: 0 });
    await screen.findByText(
      /You’ve reached this provider’s weekly reschedule limit/,
    );
    expect(screen.queryByRole("button", { name: copy.reschedule })).toBeNull();
    expect(screen.getByRole("button", { name: copy.cancel })).toBeTruthy();
    expect(screen.getByText(/Jan 21, 2030/)).toBeTruthy();
  });
  it("explains when the provider disables rescheduling", async () => {
    setup({
      weeklyRescheduleLimit: 0,
      reschedulesRemaining: 0,
      canReschedule: false,
    });
    await screen.findByText(copy.reschedulingDisabled);
    expect(screen.queryByRole("button", { name: copy.reschedule })).toBeNull();
  });
  it("reports a quota error without altering the card when another request used the allowance", async () => {
    const fetchMock = setup();
    await screen.findByText("Ada Provider");
    await userEvent.click(
      screen.getByRole("button", { name: copy.reschedule }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Tuesday, January 15, 2030/ }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "reschedule_limit" }, { status: 403 }),
    );
    const before = document.querySelector("article")!.textContent;
    await userEvent.click(screen.getByRole("button", { name: copy.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      copy.rescheduleLimitError,
    );
    expect(document.querySelector("article")!.textContent).toBe(before);
  });
});
