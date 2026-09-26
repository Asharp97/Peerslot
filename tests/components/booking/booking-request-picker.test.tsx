// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { groupBookingSlots } from "@/lib/booking-slot-presentation";

import {
  BookingRequestPicker,
  type BookingRequestCopy,
} from "@/components/booking/booking-request-picker";

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

describe("booking slot presentation", () => {
  it("groups slots by local date and time of day", () => {
    const days = groupBookingSlots(
      [
        { startsAt: "2026-08-13T08:00:00.000Z" },
        { startsAt: "2026-08-13T10:00:00.000Z" },
        { startsAt: "2026-08-13T15:00:00.000Z" },
        { startsAt: "2026-08-14T08:00:00.000Z" },
      ],
      "tr",
      "Europe/Istanbul",
    );

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({
      dateKey: "2026-08-13",
      day: "13",
      weekday: "Perşembe",
      monthYear: "Ağustos 2026",
    });
    expect(days[0].periods.map(({ period }) => period)).toEqual([
      "morning",
      "afternoon",
      "evening",
    ]);
    expect(days[0].periods.map(({ slots }) => slots[0].time)).toEqual([
      "11:00",
      "13:00",
      "18:00",
    ]);
  });

  it("uses the provider time zone instead of the browser time zone", () => {
    const [day] = groupBookingSlots(
      [{ startsAt: "2026-12-31T23:30:00.000Z" }],
      "en",
      "Europe/Istanbul",
    );

    expect(day).toMatchObject({
      dateKey: "2027-01-01",
      day: "1",
      weekday: "Friday",
      monthYear: "January 2027",
    });
    expect(day.periods[0]).toMatchObject({
      period: "morning",
      slots: [{ time: "02:30 AM" }],
    });
  });
});

describe("booking authentication", () => {
  it("shows authentication before an unauthenticated request can be confirmed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BookingRequestPicker
        bookingPageId="33ead7c8-d327-4e79-9624-f405a834f14f"
        bookingTitle="Counseling session"
        copy={copy}
        locale="en"
        slug="ABCDEFGH"
        slots={[{ startsAt: "2030-01-15T09:00:00.000Z" }]}
        timeZone="Europe/Istanbul"
      />,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Tuesday, January 15, 2030 at 12:00 PM/,
      }),
    );

    fireEvent.change(screen.getByLabelText(copy.name), {
      target: { value: "Ada Student" },
    });
    fireEvent.change(screen.getByLabelText(copy.email), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.continue }));

    expect(
      await screen.findByRole("heading", { name: copy.authTitle }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: copy.googleAction }),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("/appointments"),
      ),
    ).toBe(false);
  });

  it.each(["email", "google", "google-from-sign-in"])(
    "starts %s registration without a checkbox and preserves the slot",
    async (method) => {
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          void _init;
          const url = String(input);
          if (url === "/api/auth/get-session") {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (url === "/api/booking-intent") {
            return Response.json({
              returnPath: "/en/book/ABCDEFGH?booking=1",
            });
          }
          if (url === "/api/auth/sign-in/email") {
            return Response.json(
              { code: "INVALID_EMAIL_OR_PASSWORD" },
              { status: 401 },
            );
          }
          if (url === "/api/auth/sign-up/email") {
            return Response.json({ user: { id: "student-id" } });
          }
          return Response.json(
            { error: "Unexpected request" },
            { status: 500 },
          );
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      render(
        <BookingRequestPicker
          bookingPageId="33ead7c8-d327-4e79-9624-f405a834f14f"
          bookingTitle="Counseling session"
          copy={copy}
          locale="en"
          slug="ABCDEFGH"
          slots={[{ startsAt: "2030-01-15T09:00:00.000Z" }]}
          timeZone="Europe/Istanbul"
        />,
      );

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      fireEvent.click(
        screen.getByRole("button", {
          name: /Tuesday, January 15, 2030 at 12:00 PM/,
        }),
      );
      fireEvent.change(screen.getByLabelText(copy.name), {
        target: { value: "Ada Student" },
      });
      fireEvent.change(screen.getByLabelText(copy.email), {
        target: { value: "ada@example.com" },
      });
      fireEvent.click(screen.getByRole("button", { name: copy.continue }));
      await screen.findByRole("heading", { name: copy.authTitle });
      expect(
        screen.getByRole("button", { name: copy.registerAction }),
      ).toBeTruthy();
      expect(
        screen.getByLabelText(copy.password).getAttribute("autocomplete"),
      ).toBe("new-password");
      fireEvent.change(screen.getByLabelText(copy.password), {
        target: { value: "correct-horse-battery" },
      });
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.getByRole("link", { name: copy.termsLink }).getAttribute("href"),
      ).toBe("/en/policy/terms-agreements");
      expect(
        screen
          .getByRole("link", { name: copy.privacyLink })
          .getAttribute("href"),
      ).toBe("/en/policy/privacy");
      if (method === "google-from-sign-in") {
        fireEvent.click(screen.getByRole("button", { name: copy.signInTab }));
        expect(screen.getByRole("link", { name: copy.termsLink })).toBeTruthy();
        expect(screen.getByRole("link", { name: copy.privacyLink })).toBeTruthy();
      }
      if (method.startsWith("google")) {
        fireEvent.click(
          screen.getByRole("button", { name: copy.googleAction }),
        );
        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            "/api/auth/sign-in/social",
            expect.objectContaining({ method: "POST" }),
          ),
        );
        const request = fetchMock.mock.calls.find(
          ([url]) => String(url) === "/api/auth/sign-in/social",
        );
        expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
          requestSignUp: true,
          additionalData: { termsAccepted: true, offersAppointments: false },
          callbackURL: expect.stringContaining("/en/book/ABCDEFGH?booking=1"),
        });
        expect(await screen.findByText(copy.socialError)).toBeTruthy();
        return;
      }
      fireEvent.click(
        screen.getByRole("button", { name: copy.registerAction }),
      );

      expect(
        await screen.findByRole("heading", { name: copy.verifyTitle }),
      ).toBeTruthy();
      const registration = fetchMock.mock.calls.find(
        ([url]) => String(url) === "/api/auth/sign-up/email",
      );
      expect(JSON.parse(String(registration?.[1]?.body))).toMatchObject({
        callbackURL: "/en/book/ABCDEFGH?booking=1",
        email: "ada@example.com",
        termsAccepted: true,
          offersAppointments: false,
      });
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === "/api/auth/sign-in/email",
        ),
      ).toBe(true);
    },
  );
});

describe("existing accounts booking with another teacher", () => {
  const teacher = {
    id: "teacher-user-id",
    name: "Ada Teacher",
    email: "teacher@example.com",
    emailVerified: true,
  };

  function mockBookingAuth({
    signedIn = false,
    failure,
  }: {
    signedIn?: boolean;
    failure?: { status: number; code: string } | "network";
  } = {}) {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        void _init;
        switch (String(input)) {
          case "/api/auth/get-session":
            return Response.json(signedIn ? { user: teacher } : null);
          case "/api/booking-intent":
            return Response.json({ returnPath: "/en/book/ABCDEFGH?booking=1" });
          case "/api/auth/sign-in/email":
            if (failure === "network") throw new TypeError("Failed to fetch");
            if (failure)
              return Response.json(
                { code: failure.code },
                { status: failure.status },
              );
            signedIn = true;
            return Response.json({ user: teacher, token: "test-session" });
          case "/api/auth/sign-up/email":
            // Better Auth returns this same synthetic success for a duplicate email.
            // It neither authenticates the teacher nor sends a verification email.
            return Response.json({
              token: null,
              user: { ...teacher, id: "synthetic-id", emailVerified: false },
            });
          case "/api/booking-pages/ABCDEFGH/appointments":
            return Response.json(
              { appointment: { id: "appointment-id", status: "pending" } },
              { status: 201 },
            );
          default:
            throw new Error(`Unexpected request: ${input}`);
        }
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function chooseAppointment() {
    render(
      <BookingRequestPicker
        bookingPageId="33ead7c8-d327-4e79-9624-f405a834f14f"
        bookingTitle="Another teacher's lesson"
        copy={copy}
        locale="en"
        slug="ABCDEFGH"
        slots={[{ startsAt: "2030-01-15T09:00:00.000Z" }]}
        timeZone="Europe/Istanbul"
      />,
    );
    const slot = screen.getByRole("button", { name: /12:00 PM/ });
    await waitFor(() =>
      expect((slot as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(slot);
  }

  async function authenticate(mode: "register" | "sign-in" = "register") {
    await chooseAppointment();
    fireEvent.change(screen.getByLabelText(copy.name), {
      target: { value: "Typed name" },
    });
    fireEvent.change(screen.getByLabelText(copy.email), {
      target: { value: teacher.email },
    });
    fireEvent.change(screen.getByLabelText(copy.comment), {
      target: { value: "Keep this booking note" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.continue }));
    await screen.findByRole("heading", { name: copy.authTitle });
    if (mode === "sign-in")
      fireEvent.click(screen.getByRole("button", { name: copy.signInTab }));
    fireEvent.change(screen.getByLabelText(copy.password), {
      target: { value: "correct-horse-battery" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: mode === "register" ? copy.registerAction : copy.signInAction,
      }),
    );
  }

  it.each(["register", "sign-in"] as const)(
    "continues a verified teacher to confirmation from %s without asking for verification",
    async (mode) => {
      const fetchMock = mockBookingAuth();
      await authenticate(mode);
      await screen.findByRole("heading", { name: copy.confirmTitle });
      expect(
        screen.queryByRole("heading", { name: copy.verifyTitle }),
      ).toBeNull();
      expect(screen.getByText(teacher.name)).toBeTruthy();
      expect(screen.getByText(teacher.email)).toBeTruthy();
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === "/api/auth/sign-up/email",
        ),
      ).toBe(false);
      const signIn = fetchMock.mock.calls.find(
        ([url]) => String(url) === "/api/auth/sign-in/email",
      );
      expect(JSON.parse(String(signIn?.[1]?.body))).toMatchObject({
        email: teacher.email,
        password: "correct-horse-battery",
        callbackURL: "/en/book/ABCDEFGH?booking=1",
      });
      fireEvent.click(
        screen.getByRole("button", { name: copy.confirmRequest }),
      );
      await screen.findByRole("heading", { name: copy.requestedTitle });
      const booking = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith("/appointments"),
      );
      expect(JSON.parse(String(booking?.[1]?.body))).toEqual({
        startsAt: "2030-01-15T09:00:00.000Z",
        comment: "Keep this booking note",
      });
    },
  );

  it("uses an already signed-in teacher's account without any new authentication", async () => {
    const fetchMock = mockBookingAuth({ signedIn: true });
    await chooseAppointment();
    await screen.findByRole("heading", { name: copy.confirmTitle });
    expect(screen.getByText(teacher.email)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["register", "sign-in"] as const)(
    "keeps an unverified account in verification from %s and preserves the booking callback",
    async (mode) => {
      const fetchMock = mockBookingAuth({
        failure: { status: 403, code: "EMAIL_NOT_VERIFIED" },
      });
      await authenticate(mode);
      await screen.findByRole("heading", { name: copy.verifyTitle });
      expect(
        screen.queryByRole("heading", { name: copy.confirmTitle }),
      ).toBeNull();
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === "/api/auth/sign-up/email",
        ),
      ).toBe(false);
      const signIn = fetchMock.mock.calls.find(
        ([url]) => String(url) === "/api/auth/sign-in/email",
      );
      expect(JSON.parse(String(signIn?.[1]?.body))).toMatchObject({
        callbackURL: "/en/book/ABCDEFGH?booking=1",
      });
    },
  );

  it.each([
    { status: 429, code: "TOO_MANY_REQUESTS" },
    { status: 500, code: "INTERNAL_SERVER_ERROR" },
    "network",
  ] as const)(
    "allows retry after authentication fails (%j), without creating an account",
    async (failure) => {
      const fetchMock = mockBookingAuth({ failure });
      await authenticate();
      await screen.findByText(copy.authError);
      expect(
        (
          screen.getByRole("button", {
            name: copy.registerAction,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === "/api/auth/sign-up/email",
        ),
      ).toBe(false);
      expect(
        screen.queryByRole("heading", { name: copy.verifyTitle }),
      ).toBeNull();
    },
  );

  it("does not treat the synthetic duplicate-email signup response as authentication", async () => {
    const fetchMock = mockBookingAuth({
      failure: { status: 401, code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    await authenticate();
    await screen.findByRole("heading", { name: copy.verifyTitle });
    expect(
      screen.queryByRole("button", { name: copy.confirmRequest }),
    ).toBeNull();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/appointments"),
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: copy.verifyAction }));
    await screen.findByRole("button", { name: copy.signInAction });
  });
});

const copy = new Proxy(
  {},
  { get: (_target, property) => String(property) },
) as BookingRequestCopy;
