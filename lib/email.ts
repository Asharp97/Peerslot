import { Resend, type CreateEmailOptions } from "resend";

type EmailBody =
  { html: string; text?: string } | { html?: string; text: string };

export type SendEmailInput = EmailBody & {
  from?: string;
  idempotencyKey?: string;
  replyTo?: string | string[];
  subject: string;
  to: string | string[];
};

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

let resendClient: Resend | undefined;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new EmailDeliveryError("RESEND_API_KEY is not configured");
  }

  resendClient ??= new Resend(apiKey);
  return resendClient;
}

export async function sendEmail(input: SendEmailInput) {
  const from =
    input.from?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "PeerSlot <notifications@peerslot.com>";

  const replyTo =
    input.replyTo ?? process.env.EMAIL_REPLY_TO?.trim() ?? undefined;
  const baseMessage = {
    from,
    to: input.to,
    subject: input.subject,
    headers: { "Auto-Submitted": "auto-generated" },
    ...(replyTo ? { replyTo } : {}),
  };
  let message: CreateEmailOptions;
  if (typeof input.html === "string") {
    message = {
      ...baseMessage,
      html: input.html,
      ...(input.text !== undefined ? { text: input.text } : {}),
    };
  } else if (typeof input.text === "string") {
    message = { ...baseMessage, text: input.text };
  } else {
    throw new EmailDeliveryError("Email HTML or text content is required");
  }
  const { data, error } = await getResendClient().emails.send(
    message,
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );

  if (error) {
    throw new EmailDeliveryError(error.message);
  }

  if (!data) {
    throw new EmailDeliveryError("Resend returned no email identifier");
  }

  return data;
}
