import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { EmailDeliveryError, sendEmail } from "@/lib/email";

describe("sendEmail", () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.stubEnv("RESEND_API_KEY", "test-api-key");
    vi.stubEnv("EMAIL_FROM", "PeerSlot <notifications@peerslot.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("sends through Resend with the configured sender and idempotency key", async () => {
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });

    await expect(
      sendEmail({
        to: "student@example.com",
        subject: "Booking accepted",
        text: "Your booking was accepted.",
        idempotencyKey: "booking-accepted/appointment-id",
      }),
    ).resolves.toEqual({ id: "email-id" });

    expect(sendMock).toHaveBeenCalledWith(
      {
        from: "PeerSlot <notifications@peerslot.com>",
        headers: { "Auto-Submitted": "auto-generated" },
        to: "student@example.com",
        subject: "Booking accepted",
        text: "Your booking was accepted.",
      },
      { idempotencyKey: "booking-accepted/appointment-id" },
    );
  });

  it("includes the configured reply mailbox and both body formats", async () => {
    vi.stubEnv("EMAIL_FROM", "PeerSlot <accounts@peerslot.com>");
    vi.stubEnv("EMAIL_REPLY_TO", "help@peerslot.com");
    sendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
    await sendEmail({
      to: "student@example.com",
      subject: "PeerSlot verification",
      html: "<p>Verify your address</p>",
      text: "Verify your address",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "PeerSlot <accounts@peerslot.com>",
        replyTo: "help@peerslot.com",
        html: "<p>Verify your address</p>",
        text: "Verify your address",
      }),
      undefined,
    );
  });

  it("surfaces Resend failures as email delivery errors", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified" },
    });

    await expect(
      sendEmail({
        to: "student@example.com",
        subject: "Test",
        text: "Test",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<EmailDeliveryError>>({
        name: "EmailDeliveryError",
        message: "Domain is not verified",
      }),
    );
  });
});
