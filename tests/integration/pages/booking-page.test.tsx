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
      "We sent a verification link to ada@example.com. Open it to verify your address and return to your selected appointment.",
    ],
    [
      "tr",
      "ada@example.com adresine bir doğrulama bağlantısı gönderdik. Adresinizi doğrulamak ve seçtiğiniz randevuya dönmek için bağlantıyı açın.",
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
