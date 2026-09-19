// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleMeetSettings } from "@/components/provider-workspace/google-meet-settings";
import messages from "@/messages/en.json";
const copy = messages.ProviderWorkspace.settings.googleMeet;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Google Meet connection settings", () => {
  it("shows the connected Google email and can disconnect", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          configured: true,
          connected: true,
          email: "host@gmail.com",
        }),
      )
      .mockResolvedValueOnce(Response.json({ connected: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleMeetSettings copy={copy} accessToken="token" locale="en" />);
    expect(await screen.findByText("Connected as host@gmail.com")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: copy.disconnect }));
    expect(
      await screen.findByRole("button", { name: copy.connect }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/provider/google-meet",
      expect.objectContaining({
        method: "DELETE",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
      }),
    );
  });
  it("explains when the server has no Google configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ configured: false, connected: false, email: null }),
        ),
    );
    render(<GoogleMeetSettings copy={copy} accessToken="token" locale="en" />);
    expect(await screen.findByText(copy.notConfigured)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.connect })).toBeNull();
  });
  it("sends the locale and authentication when connecting and reports failures", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ configured: true, connected: false, email: null }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: "not_configured" }, { status: 503 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleMeetSettings copy={copy} accessToken="token" locale="tr" />);
    await user.click(await screen.findByRole("button", { name: copy.connect }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/provider/google-meet",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ locale: "tr" }),
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: copy.connect })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  });
});
