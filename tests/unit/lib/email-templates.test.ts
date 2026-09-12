// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { bookingDecisionTemplate } from "@/lib/email-templates/booking-decision";
import { newBookingRequestTemplate } from "@/lib/email-templates/new-booking-request";
import { verifyEmailTemplate } from "@/lib/email-templates/verify-email";

const appointment = {
  endsAt: new Date("2030-01-15T09:30:00.000Z"),
  locale: "en" as const,
  providerName: "Ceyda",
  startsAt: new Date("2030-01-15T09:00:00.000Z"),
  studentName: "Ada",
  timeZone: "Europe/Istanbul",
};

describe("PeerSlot email templates", () => {
  it("renders and escapes a new booking request", () => {
    const template = newBookingRequestTemplate({
      ...appointment,
      comment: "<script>alert('x')</script>",
      reviewUrl: "https://peerslot.com/en/provider/requests",
      studentEmail: "ada@example.com",
    });

    expect(template.subject).toBe("PeerSlot: New appointment request");
    expect(template.html).toContain("Tuesday, 15 January 2030");
    expect(template.html).toContain("12:00–12:30");
    expect(template.html).not.toContain("alert");
    expect(template.html).not.toContain("<script>");
    expect(template.text).not.toContain("<script>");
    expect(template.text).toContain("Read it in your dashboard");
  });

  it.each(["accept", "decline"] as const)(
    "renders the %s student decision",
    (decision) => {
      const template = bookingDecisionTemplate({
        ...appointment,
        decision,
        viewUrl: "https://peerslot.com/en",
      });

      expect(template.html).toContain(
        decision === "accept" ? "Confirmed" : "Declined",
      );
      expect(template.text).toContain("Provider: Ceyda");
    },
  );

  it("renders a verification call to action safely", () => {
    const template = verifyEmailTemplate({
      locale: "en",
      name: "Ali",
      email: "ali@example.com",
      verificationUrl:
        "https://peerslot.com/api/auth/verify-email?token=one&callbackURL=/en",
    });

    expect(template.subject).toBe("Verify your PeerSlot email address");
    expect(template.html).toContain("Verify email");
    expect(template.html).toContain("token=one&amp;callbackURL=/en");
  });
});

describe("localized email content and links", () => {
  for (const locale of ["en", "tr"] as const) {
    const verificationUrl =
      "https://www.peerslot.com/api/auth/verify-email?token=example&callbackURL=/" +
      locale;
    const templates = () => [
      verifyEmailTemplate({
        locale,
        name: "Ada <img src=x>",
        email: "ada@example.com",
        verificationUrl,
      }),
      newBookingRequestTemplate({
        ...appointment,
        locale,
        providerName: "Provider <script>bad</script>",
        studentName: "Name\r\nBcc: fake@example.com",
        studentEmail: "ada@example.com",
        comment: "https://untrusted.example/promotion",
        reviewUrl: "https://www.peerslot.com/" + locale + "/provider/requests",
      }),
      ...(["accept", "decline"] as const).map((decision) =>
        bookingDecisionTemplate({
          ...appointment,
          locale,
          decision,
          viewUrl: "https://www.peerslot.com/" + locale + "/account",
        }),
      ),
    ];
    it(
      "renders valid " + locale + " HTML and matching plain-text action links",
      () => {
        for (const template of templates()) {
          const document = new DOMParser().parseFromString(
            template.html,
            "text/html",
          );
          expect(document.documentElement.lang).toBe(locale);
          expect(
            document.querySelector('meta[charset="utf-8"]'),
          ).not.toBeNull();
          expect(
            document.querySelector("script, img, iframe, form"),
          ).toBeNull();
          expect(template.subject).not.toMatch(/[\r\n]/);
          expect(template.html).not.toContain("https://untrusted.example");
          expect(template.text).not.toContain("https://untrusted.example");
          const links = [...document.querySelectorAll("a")];
          expect(links).toHaveLength(2);
          expect(links[0].href).toBe(links[1].href);
          expect(links[1].textContent).toBe(links[1].href);
          expect(template.text).toContain(links[0].href);
        }
      },
    );
    it("keeps the verification account and expiry clear in " + locale, () => {
      const template = templates()[0];
      expect(template.text).toContain("ada@example.com");
      expect(template.text).toContain(
        locale === "en" ? "one hour" : "bir saat",
      );
      expect(template.text).toContain(
        locale === "en" ? "ignore this message" : "mesajı yok sayın",
      );
      expect(template.html).toContain("&lt;img src=x&gt;");
    });
  }
});
