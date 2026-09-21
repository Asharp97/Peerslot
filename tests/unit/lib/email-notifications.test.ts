import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

import {
  emailLocaleFromRequest,
  sendVerificationEmail,
  notifyProviderOfBookingRequest,
  notifyStudentOfBookingDecision,
} from "@/lib/email-notifications";

const appointment = {
  appointmentId: "appointment-id",
  endsAt: new Date("2030-01-15T09:30:00.000Z"),
  locale: "en" as const,
  providerName: "Ceyda",
  startsAt: new Date("2030-01-15T09:00:00.000Z"),
  studentName: "Ada",
  timeZone: "Europe/Istanbul",
};

describe("email notifications", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    sendEmailMock.mockReset();
    vi.stubEnv("BETTER_AUTH_URL", "https://peerslot.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  });

  it("notifies the provider once per booking request", async () => {
    sendEmailMock.mockResolvedValue({ id: "email-id" });

    await notifyProviderOfBookingRequest({
      ...appointment,
      providerEmail: "provider@example.com",
      studentEmail: "student@example.com",
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "provider@example.com",
        idempotencyKey: "booking-request/appointment-id",
      }),
    );
  });

  it("lets signup verification use the configured sender and includes the account email", async () => {
    sendEmailMock.mockResolvedValue({ id: "email-id" });
    await sendVerificationEmail({
      email: "ada@example.com",
      name: "Ada",
      locale: "tr",
      token: "private-token",
      verificationUrl:
        "https://peerslot.com/api/auth/verify-email?token=private-token",
    });
    const [message] = sendEmailMock.mock.calls[0];
    expect(message).not.toHaveProperty("from");
    expect(message.text).toContain("ada@example.com");
    expect(message.html).toContain('lang="tr"');
    expect(message.idempotencyKey).not.toContain("private-token");
  });

  it("links confirmed appointments to the student's account", async () => {
    sendEmailMock.mockResolvedValue({ id: "email-id" });
    await notifyStudentOfBookingDecision({
      ...appointment,
      decision: "accept",
      studentEmail: "student@example.com",
    });
    expect(sendEmailMock.mock.calls[0][0].text).toContain(
      "https://peerslot.com/en/my-appointments",
    );
    expect(sendEmailMock.mock.calls[0][0]).not.toHaveProperty("from");
  });

  it("does not fail an accepted booking when delivery fails", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend unavailable"));

    await expect(
      notifyStudentOfBookingDecision({
        ...appointment,
        decision: "accept",
        studentEmail: "student@example.com",
      }),
    ).resolves.toBeNull();
  });

  it("uses Turkish only when it is the preferred request language", () => {
    expect(
      emailLocaleFromRequest(
        new Request("https://peerslot.com", {
          headers: { "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" },
        }),
      ),
    ).toBe("tr");
    expect(emailLocaleFromRequest(new Request("https://peerslot.com"))).toBe(
      "en",
    );
  });

  it("does not send unusable production links or fail a saved booking", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    await expect(
      notifyProviderOfBookingRequest({
        ...appointment,
        providerEmail: "provider@example.com",
        studentEmail: "student@example.com",
      }),
    ).resolves.toBeNull();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
