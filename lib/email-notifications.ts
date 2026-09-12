import { createHash } from "node:crypto";
import {
  bookingDecisionTemplate,
  type EmailLocale,
  newBookingRequestTemplate,
  verifyEmailTemplate,
} from "@/lib/email-templates";
import { sendEmail, type SendEmailInput } from "@/lib/email";
import { emailApplicationUrl } from "@/lib/email-urls";

type AppointmentEmailDetails = {
  appointmentId: string;
  endsAt: Date;
  locale: EmailLocale;
  providerName: string;
  startsAt: Date;
  studentName: string;
  timeZone: string;
};

export async function notifyProviderOfBookingRequest(
  input: AppointmentEmailDetails & {
    comment?: string | null;
    providerEmail: string;
    studentEmail: string;
  },
) {
  return deliverEmail(
    () => ({
      ...newBookingRequestTemplate({
        comment: input.comment,
        endsAt: input.endsAt,
        locale: input.locale,
        providerName: input.providerName,
        reviewUrl: emailApplicationUrl(`/${input.locale}/provider/requests`),
        startsAt: input.startsAt,
        studentEmail: input.studentEmail,
        studentName: input.studentName,
        timeZone: input.timeZone,
      }),
      to: input.providerEmail,
      idempotencyKey: `booking-request/${input.appointmentId}`,
    }),
    { event: "booking_request", entityId: input.appointmentId },
  );
}

export async function notifyStudentOfBookingDecision(
  input: AppointmentEmailDetails & {
    decision: "accept" | "decline";
    studentEmail: string | null;
  },
) {
  const studentEmail = input.studentEmail;
  if (!studentEmail) return null;
  return deliverEmail(
    () => ({
      ...bookingDecisionTemplate({
        decision: input.decision,
        endsAt: input.endsAt,
        locale: input.locale,
        providerName: input.providerName,
        startsAt: input.startsAt,
        studentName: input.studentName,
        timeZone: input.timeZone,
        viewUrl: emailApplicationUrl(
          `/${input.locale}${input.decision === "accept" ? "/account" : ""}`,
        ),
      }),
      to: studentEmail,
      idempotencyKey: `booking-${input.decision}/${input.appointmentId}`,
    }),
    { event: `booking_${input.decision}`, entityId: input.appointmentId },
  );
}

export async function sendVerificationEmail(input: {
  email: string;
  locale: EmailLocale;
  name: string;
  token: string;
  verificationUrl: string;
}) {
  const tokenFingerprint = createHash("sha256")
    .update(input.token)
    .digest("hex")
    .slice(0, 24);
  return deliverEmail(
    () => ({
      ...verifyEmailTemplate(input),
      to: input.email,
      idempotencyKey: `email-verification/${tokenFingerprint}`,
    }),
    { event: "email_verification", entityId: tokenFingerprint },
  );
}

export function emailLocaleFromRequest(request?: Request | null): EmailLocale {
  const language = request?.headers.get("accept-language")?.toLowerCase();
  return language?.startsWith("tr") ? "tr" : "en";
}

async function deliverEmail(
  buildMessage: () => SendEmailInput,
  context: { entityId: string; event: string },
) {
  try {
    // Template/configuration failures must not turn a saved booking into an API error.
    return await sendEmail(buildMessage());
  } catch (error) {
    console.error("transactional_email_failed", {
      entityId: context.entityId,
      event: context.event,
      message: error instanceof Error ? error.message : "Unknown email error",
    });
    return null;
  }
}
