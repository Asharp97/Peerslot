// @vitest-environment jsdom

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
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProviderShell,
  type ProviderShellCopy,
} from "@/components/provider-workspace/provider-shell";
import {
  ProviderAppointmentRequests,
  type ProviderAppointmentRequestsCopy,
} from "@/components/provider-workspace/provider-appointment-requests";

const { router } = vi.hoisted(() => ({ router: { replace: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
  usePathname: () => "/provider/requests",
  useRouter: () => router,
}));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/auth-browser", () => ({
  fetchAccessToken: async () => "access-token",
}));

const shellCopy = new Proxy(
  {},
  { get: (_target, property) => String(property) },
) as ProviderShellCopy;
const requestsCopy = new Proxy(
  {},
  { get: (_target, property) => String(property) },
) as ProviderAppointmentRequestsCopy;
const appointment = {
  id: "appointment-id",
  studentName: "Ada Student",
  studentEmail: "ada@example.com",
  startsAt: "2030-01-15T09:00:00.000Z",
  endsAt: "2030-01-15T09:45:00.000Z",
  comment: null,
};

function setupFetch(
  initialCount: number,
  reviewStatus = 200,
  providerStatus: "active" | "setup_required" = "active",
) {
  let appointments = Array.from({ length: initialCount }, (_, index) => ({
    ...appointment,
    id: `appointment-${index}`,
  }));
  const requests = vi.fn(async () => Response.json({ appointments }));
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/provider") {
      return Response.json({
        status: providerStatus,
        profile: providerStatus === "active" ? { displayName: "Ceyda" } : null,
        bookingPage: providerStatus === "active" ? {
          timeZone: "Europe/Istanbul",
          title: "Book with Ceyda",
          isPublished: true,
        } : null,
      });
    }
    if (url === "/api/provider/appointment-requests") return requests();
    if (options?.method === "PATCH") {
      if (reviewStatus === 200)
        appointments = appointments.filter(({ id }) => !url.endsWith(`/${id}`));
      return Response.json({}, { status: reviewStatus });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock };
}

function expectNavCount(count: number) {
  const links = screen.getAllByRole("link", { name: /requests/ });
  expect(links).toHaveLength(2);
  for (const link of links) {
    if (count) expect(within(link).getByText(String(count))).toBeTruthy();
    else expect(link.textContent).toBe("requests");
  }
}

describe("provider request navigation badge", () => {
  beforeEach(() => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the pending count in both navigation layouts", async () => {
    const { fetchMock } = setupFetch(12);
    render(<ProviderShell copy={shellCopy}>Dashboard</ProviderShell>);
    await waitFor(() => expectNavCount(12));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/provider/appointment-requests",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
        cache: "no-store",
      }),
    );
  });

  it("keeps shared appointments above the provider calendar and labels clients clearly", async () => {
    setupFetch(0);
    render(<ProviderShell copy={shellCopy}>Dashboard</ProviderShell>);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "myAppointments" })).toHaveLength(2);
    });

    for (const navigation of screen.getAllByRole("navigation")) {
      const links = within(navigation).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "overview",
        "myAppointments",
        "calendar",
        "requests",
        "clients",
        "personalActivities",
        "settings",
      ]);
      expect(links[1].getAttribute("href")).toBe("/my-appointments");
      expect(links[4].getAttribute("href")).toBe("/provider/clients");
    }
  });

  it("keeps the shared shell available when the account has no provider setup", async () => {
    setupFetch(0, 200, "setup_required");
    render(
      <ProviderShell
        allowSignedOut
        requireProviderSetup={false}
        copy={shellCopy}>
        Dashboard
      </ProviderShell>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "myAppointments" })).toHaveLength(2);
    });
    expect(screen.queryByRole("link", { name: "calendar" })).toBeNull();
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("hides the badge when there are no pending requests", async () => {
    const { requests } = setupFetch(0);
    render(<ProviderShell copy={shellCopy}>Dashboard</ProviderShell>);
    await waitFor(() => expect(requests).toHaveBeenCalledOnce());
    expectNavCount(0);
  });

  it.each(["accept", "decline"] as const)(
    "refreshes and hides the badge after the last request is reviewed: %s",
    async (decision) => {
      const user = userEvent.setup();
      const { fetchMock } = setupFetch(1);
      render(
        <ProviderShell copy={shellCopy}>
          <ProviderAppointmentRequests copy={requestsCopy} />
        </ProviderShell>,
      );
      await waitFor(() => expectNavCount(1));
      await user.click(await screen.findByRole("button", { name: decision }));
      await waitFor(() => expectNavCount(0));
      expect(screen.queryByText("Ada Student")).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/provider/appointment-requests/appointment-0",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ decision }),
        }),
      );
    },
  );

  it("keeps the badge when a review fails", async () => {
    const user = userEvent.setup();
    setupFetch(1, 500);
    render(
      <ProviderShell copy={shellCopy}>
        <ProviderAppointmentRequests copy={requestsCopy} />
      </ProviderShell>,
    );
    await waitFor(() => expectNavCount(1));
    await user.click(await screen.findByRole("button", { name: "accept" }));
    expect(await screen.findByText("reviewError")).toBeTruthy();
    expectNavCount(1);
  });

  it("updates on focus and keeps the last count if a background refresh fails", async () => {
    const { requests } = setupFetch(1);
    render(<ProviderShell copy={shellCopy}>Dashboard</ProviderShell>);
    await waitFor(() => expectNavCount(1));
    requests.mockResolvedValueOnce(
      Response.json({ appointments: [appointment, appointment] }),
    );
    fireEvent.focus(window);
    await waitFor(() => expectNavCount(2));
    requests.mockRejectedValueOnce(new Error("Network unavailable"));
    await act(async () => {
      fireEvent.focus(window);
    });
    expect(requests).toHaveBeenCalledTimes(3);
    expectNavCount(2);
    expect(screen.getByText("Dashboard")).toBeTruthy();
  });

  it("ignores an older response that arrives after a newer count", async () => {
    const { requests } = setupFetch(1);
    render(<ProviderShell copy={shellCopy}>Dashboard</ProviderShell>);
    await waitFor(() => expectNavCount(1));
    let resolveOlder!: (response: Response) => void;
    requests.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOlder = resolve;
        }),
    );
    fireEvent.focus(window);
    requests.mockResolvedValueOnce(Response.json({ appointments: [] }));
    fireEvent.focus(window);
    await waitFor(() => expectNavCount(0));
    await act(async () => {
      resolveOlder(Response.json({ appointments: [appointment] }));
    });
    expectNavCount(0);
  });

  it("refreshes periodically only while visible and clears the timer on unmount", async () => {
    const { requests } = setupFetch(1);
    vi.useFakeTimers();
    const view = render(
      <ProviderShell copy={shellCopy}>Dashboard</ProviderShell>,
    );
    await act(async () => {});
    expectNavCount(1);
    requests.mockResolvedValueOnce(Response.json({ appointments: [] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expectNavCount(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(requests).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
