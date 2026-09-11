import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { PublicAppointmentPolicyError } from "@/lib/public-appointment-policy";
import { clearBookingIntentCookie } from "@/lib/booking-intent-cookie";
import {
  createPublicAppointmentRequest,
  PublicAppointmentRequestPageNotFoundError,
  PublicAppointmentRequestUnavailableError,
} from "@/lib/public-appointment-request";
import {
  emailLocaleFromRequest,
  notifyProviderOfBookingRequest,
} from "@/lib/email-notifications";
import {
  publicAppointmentIdentitySchema,
  publicAppointmentRequestSchema,
} from "@/lib/public-appointment-request-schema";
import {
  enforceRateLimit,
  logFailedBookingAttempt,
  requireSameOriginJson,
} from "@/lib/request-security";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const requestGuard = requireSameOriginJson(request);
  if (requestGuard) return requestGuard;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    logFailedBookingAttempt("unauthenticated", { slug, status: 401 });
    return NextResponse.json(
      {
        error: "Sign in again to confirm your appointment.",
        code: "unauthenticated",
      },
      { status: 401 },
    );
  }

  if (!session.user.emailVerified) {
    return NextResponse.json(
      {
        error: "Verify your email address before booking an appointment.",
        code: "email_unverified",
      },
      { status: 403 },
    );
  }

  const limited = enforceRateLimit(request, "booking-confirmation", {
    limit: 8,
    windowSeconds: 10 * 60,
    subject: `${session.user.id}:${slug}`,
  });
  if (limited) {
    logFailedBookingAttempt("rate_limited", { slug, status: 429 });
    return limited;
  }

  const identity = publicAppointmentIdentitySchema.safeParse({
    studentId: session.user.id,
    studentName: session.user.name,
    studentEmail: session.user.email,
  });
  if (!identity.success) {
    logFailedBookingAttempt("invalid_identity", { slug, status: 400 });
    return NextResponse.json(
      { error: "Invalid booking profile" },
      { status: 400 },
    );
  }

  const input = publicAppointmentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid appointment request", issues: input.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createPublicAppointmentRequest(
      slug,
      input.data,
      identity.data,
    );
    await notifyProviderOfBookingRequest({
      appointmentId: result.appointment.id,
      comment: result.appointment.comment,
      endsAt: result.appointment.endsAt,
      locale: emailLocaleFromRequest(request),
      providerEmail: result.provider.email,
      providerName: result.provider.name,
      startsAt: result.appointment.startsAt,
      studentEmail: identity.data.studentEmail,
      studentName: identity.data.studentName,
      timeZone: result.provider.timeZone,
    });
    const response = NextResponse.json(
      {
        appointment: {
          id: result.appointment.id,
          status: result.appointment.status,
        },
      },
      { status: 201 },
    );
    clearBookingIntentCookie(response);
    return response;
  } catch (error) {
    if (error instanceof PublicAppointmentPolicyError) {
      const status = error.code === "upcoming_appointment" ? 409 : 400;
      logFailedBookingAttempt(error.code, { slug, status });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          minimumNoticeHours: error.minimumNoticeHours,
        },
        { status },
      );
    }
    if (error instanceof PublicAppointmentRequestPageNotFoundError) {
      logFailedBookingAttempt("page_not_found", { slug, status: 404 });
      return NextResponse.json(
        { error: error.message, code: "page_not_found" },
        { status: 404 },
      );
    }
    if (error instanceof PublicAppointmentRequestUnavailableError) {
      logFailedBookingAttempt("unavailable", { slug, status: 409 });
      return NextResponse.json(
        { error: error.message, code: "unavailable" },
        { status: 409 },
      );
    }
    throw error;
  }
}
