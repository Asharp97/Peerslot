// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  JoinMeeting,
  ProviderAppointmentMeeting,
} from "@/components/appointment-meeting";
import messages from "@/messages/en.json";
import tr from "@/messages/tr.json";

const copy = messages.ProviderWorkspace.appointments.meeting;
const url = "https://meet.google.com/abc-defg-hij";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Google Meet join controls", () => {
  it.each([copy, tr.ProviderWorkspace.appointments.meeting])(
    "shows Google's logo and opens the meeting in a protected new tab",
    (labels) => {
      render(<JoinMeeting meetingUrl={url} status="scheduled" copy={labels} />);
      const link = screen.getByRole("link", { name: new RegExp(labels.join) });
      expect(link.getAttribute("href")).toBe(url);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(screen.getByAltText("Google Meet")).toBeTruthy();
      expect(link.textContent).toContain(labels.opensNewTab);
    },
  );
  it.each(["pending", "declined", "cancelled"])(
    "hides Join for %s appointments",
    (status) => {
      render(<JoinMeeting meetingUrl={url} status={status} copy={copy} />);
      expect(screen.queryByRole("link")).toBeNull();
    },
  );
  it.each([
    null,
    "javascript:alert(1)",
    "https://meet.google.com.evil.test/abc-defg-hij",
    "https://evil.test",
    "http://meet.google.com/abc-defg-hij",
  ])("does not render unsafe or missing meeting URLs: %s", (meetingUrl) => {
    render(
      <JoinMeeting meetingUrl={meetingUrl} status="scheduled" copy={copy} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("lets the provider recover a missing link without submitting the session form", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ status: "ready", meetingUrl: url }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ProviderAppointmentMeeting
        appointmentId="appointment"
        accessToken="token"
        status="scheduled"
        copy={copy}
        locale="en"
      />,
    );
    const button = screen.getByRole("button", {
      name: new RegExp(copy.create),
    });
    expect(button.getAttribute("type")).toBe("button");
    await user.click(button);
    expect(
      (
        await screen.findByRole("link", { name: new RegExp(copy.join) })
      ).getAttribute("href"),
    ).toBe(url);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/appointments/appointment/meeting",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
      }),
    );
  });
  it("offers a retry when Google is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "failed" })),
    );
    render(
      <ProviderAppointmentMeeting
        appointmentId="appointment"
        accessToken="token"
        status="scheduled"
        copy={copy}
        locale="en"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: new RegExp(copy.create) }),
    );
    expect(await screen.findByText(copy.failed)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: new RegExp(copy.retry) }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: new RegExp(copy.join) }),
    ).toBeNull();
  });
  it("directs an unconnected provider to localized Settings", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ status: "not_connected" })),
    );
    render(
      <ProviderAppointmentMeeting
        appointmentId="appointment"
        accessToken="token"
        status="scheduled"
        copy={copy}
        locale="tr"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: new RegExp(copy.create) }),
    );
    expect(
      (
        await screen.findByRole("link", { name: new RegExp(copy.connect) })
      ).getAttribute("href"),
    ).toBe("/tr/provider/settings");
  });
});
