import { createHash } from "node:crypto";
import {
  appointmentChangeTemplate,
  bookingDecisionTemplate,
  type EmailLocale,
  newBookingRequestTemplate,
  passwordResetTemplate,
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
          `/${input.locale}${input.decision === "accept" ? "/my-appointments" : ""}`,
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

export async function sendPasswordResetEmail(input: {
  email: string;
  locale: EmailLocale;
  name: string;
  resetUrl: string;
  token: string;
}) {
  const tokenFingerprint = createHash("sha256")
    .update(input.token)
    .digest("hex")
    .slice(0, 24);
  return deliverEmail(
    () => ({
      ...passwordResetTemplate(input),
      to: input.email,
      idempotencyKey: `password-reset/${tokenFingerprint}`,
    }),
    { event: "password_reset", entityId: tokenFingerprint },
  );
}

type AppointmentChangeEmailInput = AppointmentEmailDetails & {
  change: "rescheduled" | "cancelled";
  previousEndsAt: Date;
  previousStartsAt: Date;
  recipient: "provider" | "student";
  recipientEmail: string | null;
  viewUrl: string;
};

export async function notifyOfAppointmentChange(
  input: AppointmentChangeEmailInput,
) {
  if (!input.recipientEmail) return null;
  const occurrenceKey = `${input.previousStartsAt.toISOString()}/${input.startsAt.toISOString()}`;
  const occurrenceFingerprint = createHash("sha256")
    .update(occurrenceKey)
    .digest("hex")
    .slice(0, 16);
  return deliverEmail(
    () => ({
      ...appointmentChangeTemplate(input),
      to: input.recipientEmail!,
      idempotencyKey: `appointment-${input.change}/${input.appointmentId}/${occurrenceFingerprint}/${input.recipient}`,
    }),
    {
      event: `appointment_${input.change}`,
      entityId: input.appointmentId,
    },
  );
}

export async function notifyProviderOfAppointmentChange(
  input: Omit<AppointmentChangeEmailInput, "recipient" | "recipientEmail" | "viewUrl"> & {
    providerEmail: string | null;
    viewUrl?: string;
  },
) {
  return notifyOfAppointmentChange({
    ...input,
    recipient: "provider",
    recipientEmail: input.providerEmail,
    viewUrl: emailApplicationUrl(
      `/${input.locale}/provider/appointments`,
    ),
  });
}

export async function notifyStudentOfAppointmentChange(
  input: Omit<AppointmentChangeEmailInput, "recipient" | "recipientEmail" | "viewUrl"> & {
    studentEmail: string | null;
    viewUrl?: string;
  },
) {
  return notifyOfAppointmentChange({
    ...input,
    recipient: "student",
    recipientEmail: input.studentEmail,
    viewUrl: emailApplicationUrl(`/${input.locale}/my-appointments`),
  });
}

export function emailLocaleFromRequest(request?: Request | null): EmailLocale {
  const language = request?.headers.get("accept-language")?.toLowerCase();
  return language?.startsWith("tr") ? "tr" : "en";
}

async function deliverEmail(
  buildMessage: () => SendEmailInput,
  context: { entityId: string; event: string },
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sendEmail(buildMessage());
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * 2 ** (attempt - 1)),
        );
        continue;
      }
      console.error("transactional_email_failed", {
        attempt,
        entityId: context.entityId,
        event: context.event,
        message: error instanceof Error ? error.message : "Unknown email error",
      });
      return null;
    }
  }
  return null;
}
