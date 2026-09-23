// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BookingPage from "@/app/[locale]/book/[slug]/page";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

const translation = vi.hoisted(() => ({ locale: "en", onError: vi.fn() }));

// Keep the real message formatter: a key-only translation mock hides missing
// interpolation values at the server-page/client-component boundary.
vi.mock("next-intl/server", () => ({
  setRequestLocale: (locale: string) => {
    translation.locale = locale;
  },
  getTranslations: async () =>
    createTranslator({
      locale: translation.locale,
      messages: translation.locale === "tr" ? tr : en,
      namespace: "BookingPage",
      onError: translation.onError,
    }),
}));
vi.mock("@/i18n/navigation", () => ({ Link: "a" }));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: async () => [
                {
                  bookingPageId: "33ead7c8-d327-4e79-9624-f405a834f14f",
                  userId: "provider-id",
                  displayName: "Ada Provider",
                  professionalTitle: "Teacher",
                  title: "Book with Ada Provider",
                  timeZone: "Europe/Istanbul",
                  duration: 30,
                },
              ],
            }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/available-times", () => ({
  getAvailableTimesForPublishedBookingPage: async () => ({
    availableTimes: [{ startsAt: new Date("2030-01-15T09:00:00.000Z") }],
  }),
}));

beforeEach(() => {
  translation.onError.mockClear();
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

describe("booking page verification copy", () => {
  it.each([
    [
      "en",
      "If ada@example.com needs verification, open the link in your inbox to return to your selected appointment. If you already have a verified account, go back and sign in with your existing password or Google.",
    ],
    [
      "tr",
      "ada@example.com adresinizin doğrulanması gerekiyorsa seçtiğiniz randevuya dönmek için gelen kutunuzdaki bağlantıyı açın. Zaten doğrulanmış bir hesabınız varsa geri dönüp mevcut şifrenizle veya Google ile giriş yapın.",
    ],
  ])(
    "renders the actual %s verification message after sign-up",
    async (locale, expectedMessage) => {
      const copy = (locale === "tr" ? tr : en).BookingPage;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        switch (String(input)) {
          case "/api/auth/get-session":
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          case "/api/booking-intent":
            return Response.json({
              returnPath: `/${locale}/book/ABCDEFGH?booking=1`,
            });
          case "/api/auth/sign-up/email":
            return Response.json({ user: { id: "student-id" } });
          case "/api/auth/sign-in/email":
            return Response.json(
              { code: "INVALID_EMAIL_OR_PASSWORD" },
              { status: 401 },
            );
          default:
            throw new Error(`Unexpected request: ${input}`);
        }
      });
      vi.stubGlobal("fetch", fetchMock);
      render(
        await BookingPage({
          params: Promise.resolve({ locale, slug: "ABCDEFGH" }),
        }),
      );
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole("button", { name: /12:00/ }));
      fireEvent.change(screen.getByLabelText(copy.name), {
        target: { value: "Ada Student" },
      });
      fireEvent.change(screen.getByLabelText(copy.email), {
        target: { value: "ada@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: copy.continue }));
      await screen.findByRole("heading", { name: copy.authTitle });
      fireEvent.change(screen.getByLabelText(copy.password), {
        target: { value: "correct-horse-battery" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: copy.registerAction }),
      );

      await screen.findByRole("heading", { name: copy.verifyTitle });
      expect(screen.getByText(expectedMessage)).toBeTruthy();
      expect(screen.queryByText("BookingPage.verifyBody")).toBeNull();
      expect(screen.queryByText(/\{email\}/)).toBeNull();
      expect(translation.onError).not.toHaveBeenCalled();
    },
  );
});

describe("booking page validation messages", () => {
  const cases = [
    ["past", 400, "pastTimeError"],
    ["minimum_notice", 400, "minimumNoticeError"],
    ["upcoming_appointment", 409, "upcomingAppointmentError"],
    ["unavailable", 409, "unavailableTimeError"],
    ["email_unverified", 403, "emailUnverifiedError"],
    ["unauthenticated", 401, "sessionExpiredError"],
    ["page_not_found", 404, "pageUnavailableError"],
    [undefined, 429, "rateLimitError"],
    [undefined, 500, "requestError"],
  ] as const;
  for (const locale of ["en", "tr"] as const) {
    it.each(cases)(
      "shows the real " + locale + " message for %s (%s)",
      async (code, status, key) => {
        const copy = (locale === "tr" ? tr : en).BookingPage;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
          if (String(input) === "/api/auth/get-session")
            return Response.json({
              user: { name: "Ada", email: "ada@example.com" },
            });
          if (String(input).endsWith("/appointments"))
            return Response.json({ code, minimumNoticeHours: 24 }, { status });
          throw new Error("Unexpected request: " + input);
        });
        vi.stubGlobal("fetch", fetchMock);
        render(
          await BookingPage({
            params: Promise.resolve({ locale, slug: "ABCDEFGH" }),
          }),
        );
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: /12:00/ }));
        fireEvent.click(
          await screen.findByRole("button", { name: copy.confirmRequest }),
        );
        const notice = locale === "en" ? "24 hours" : "24 saat";
        expect(
          await screen.findByText(copy[key].replace("{notice}", notice)),
        ).toBeTruthy();
        expect(screen.queryByText(copy.requestedTitle)).toBeNull();
        expect(translation.onError).not.toHaveBeenCalled();
      },
    );
  }
});
