// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderAuthFlow } from "@/components/provider-auth-flow";
import messages from "@/messages/en.json";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("provider registration without a checkbox", () => {
  it("opens sign-in when entered from the homepage Login button", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 401 })));
    const copy = messages.ProviderAuth.flow;
    render(<ProviderAuthFlow copy={copy} locale="en" initialMode="sign-in" />);
    await screen.findByRole("heading", { name: copy.signInTitle });
    expect(screen.queryByRole("heading", { name: copy.registerTitle })).toBeNull();
  });
  it.each(["email", "google"])(
    "starts %s registration from the notice",
    async (method) => {
      const copy = messages.ProviderAuth.flow;
      const user = userEvent.setup();
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, _init?: RequestInit) => {
          void _init;
          if (String(input) === "/api/auth/sign-up/email") {
            return Response.json({ user: { id: "provider-id" } });
          }
          // Keep Google navigation inside the test while verifying it was requested.
          return Response.json({ error: "Unavailable" }, { status: 401 });
        },
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<ProviderAuthFlow copy={copy} locale="en" />);
      await screen.findByRole("heading", { name: copy.registerTitle });

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.getByText(copy.consentPrefix, { exact: false }),
      ).toBeTruthy();
      expect(
        screen.getByRole("link", { name: copy.termsLink }).getAttribute("href"),
      ).toBe("/policy/terms-agreements");
      expect(
        screen
          .getByRole("link", { name: copy.privacyLink })
          .getAttribute("href"),
      ).toBe("/policy/privacy");

      if (method === "email") {
        await user.type(screen.getByLabelText(copy.nameLabel), "Ada Provider");
        await user.type(
          screen.getByLabelText(copy.emailLabel),
          "ada@example.com",
        );
        await user.type(
          screen.getByLabelText(copy.passwordLabel),
          "correct-horse-battery",
        );
        await user.click(
          screen.getByRole("button", { name: copy.registerAction }),
        );
        expect(
          await screen.findByRole("heading", { name: copy.verifyTitle }),
        ).toBeTruthy();
        const request = fetchMock.mock.calls.find(
          ([url]) => String(url) === "/api/auth/sign-up/email",
        );
        expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
          email: "ada@example.com",
          termsAccepted: true,
        });
      } else {
        await user.click(
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
          additionalData: { termsAccepted: true },
        });
        expect(await screen.findByText(copy.errors.social)).toBeTruthy();
      }
    },
  );
});
