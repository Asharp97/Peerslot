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

    expect(template.subject).toContain("Ada");
    expect(template.html).toContain("Tuesday, 15 January 2030");
    expect(template.html).toContain("12:00–12:30");
    expect(template.html).toContain("&lt;script&gt;");
    expect(template.html).not.toContain("<script>");
    expect(template.text).toContain("Comment: <script>alert('x')</script>");
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
      verificationUrl:
        "https://peerslot.com/api/auth/verify-email?token=one&callbackURL=/en",
    });

    expect(template.subject).toBe("Verify your PeerSlot email address");
    expect(template.html).toContain("Verify email");
    expect(template.html).toContain("token=one&amp;callbackURL=/en");
  });
});
