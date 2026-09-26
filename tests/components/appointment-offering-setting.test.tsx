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
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppointmentOfferingSetting } from "@/components/appointment-offering-setting";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup(
  initial: boolean,
  options: {
    status?: number;
    code?: string;
    setupRequired?: boolean;
    locale?: "en" | "tr";
  } = {},
) {
  let saved = initial;
  const fetchMock = vi.fn(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        if (options.status)
          return Response.json(
            { code: options.code },
            { status: options.status },
          );
        saved = JSON.parse(String(init.body)).offersAppointments;
        return Response.json({
          offersAppointments: saved,
          setupRequired: options.setupRequired,
        });
      }
      return Response.json({ offersAppointments: saved });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const locale = options.locale ?? "en";
  const messages = locale === "tr" ? tr : en;
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <AppointmentOfferingSetting accessToken="token" />
    </NextIntlClientProvider>,
  );
  return { fetchMock, view, copy: messages.AppointmentOffering };
}

describe("appointment offering account switch", () => {
  it.each(["en", "tr"] as const)(
    "loads the saved value and explains the switch in %s",
    async (locale) => {
      const { copy } = setup(true, { locale });
      const control = await screen.findByRole("switch", { name: copy.label });
      await waitFor(() =>
        expect(control.getAttribute("aria-checked")).toBe("true"),
      );
      expect(screen.getByText(copy.hint)).toBeTruthy();
    },
  );

  it.each([true, false])(
    "saves from %s, notifies navigation, and stays on Account settings",
    async (initial) => {
      const { copy, fetchMock } = setup(initial);
      const changed = vi.fn();
      window.addEventListener("peerslot:offering-change", changed);
      try {
        const control = await screen.findByRole("switch", { name: copy.label });
        await waitFor(() =>
          expect(control.hasAttribute("disabled")).toBe(false),
        );
        await userEvent.setup().click(control);
        await waitFor(() =>
          expect(control.getAttribute("aria-checked")).toBe(String(!initial)),
        );
        const mutation = fetchMock.mock.calls.find(
          ([, init]) => init?.method === "PATCH",
        );
        expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
          offersAppointments: !initial,
        });
        expect(changed).toHaveBeenCalledOnce();
        expect(router.push).not.toHaveBeenCalled();
        fireEvent.focus(window);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
        expect(control.getAttribute("aria-checked")).toBe(String(!initial));
      } finally {
        window.removeEventListener("peerslot:offering-change", changed);
      }
    },
  );

  it("opens setup when a client starts offering appointments", async () => {
    const { copy } = setup(false, { setupRequired: true });
    const control = await screen.findByRole("switch", { name: copy.label });
    await waitFor(() => expect(control.hasAttribute("disabled")).toBe(false));
    await userEvent.setup().click(control);
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/auth/provider"),
    );
  });

  it("ignores a stale refresh arriving after the switch is saved", async () => {
    const { copy, fetchMock } = setup(true);
    const control = await screen.findByRole("switch", { name: copy.label });
    await waitFor(() =>
      expect(control.getAttribute("aria-checked")).toBe("true"),
    );
    let resolveRefresh!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    fireEvent.focus(window);
    await userEvent.setup().click(control);
    await waitFor(() =>
      expect(control.getAttribute("aria-checked")).toBe("false"),
    );
    await act(async () => {
      resolveRefresh(Response.json({ offersAppointments: true }));
    });
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it.each([409, 500])(
    "keeps the saved setting unchanged after error %s",
    async (status) => {
      const { copy } = setup(true, {
        status,
        code: status === 409 ? "pending_requests" : undefined,
      });
      const control = await screen.findByRole("switch", { name: copy.label });
      await waitFor(() =>
        expect(control.getAttribute("aria-checked")).toBe("true"),
      );
      await userEvent.setup().click(control);
      expect((await screen.findByRole("alert")).textContent).toContain(
        status === 409 ? copy.pending_requests : copy.save,
      );
      expect(control.getAttribute("aria-checked")).toBe("true");
      if (status === 409)
        expect(
          screen.getByRole("link", { name: copy.review }).getAttribute("href"),
        ).toBe("/provider/requests");
    },
  );

  it("retries an initial load error without assuming a default", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("Offline"))
        .mockResolvedValue(Response.json({ offersAppointments: true })),
    );
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <AppointmentOfferingSetting accessToken="token" />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText(en.AppointmentOffering.load)).toBeTruthy();
    expect(screen.getByRole("switch").hasAttribute("disabled")).toBe(true);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: en.AppointmentOffering.retry }),
      );
    });
    await waitFor(() =>
      expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
        "true",
      ),
    );
  });
});
