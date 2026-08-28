import { NextResponse } from "next/server";
import { z } from "zod";

import { providerAppointmentErrorResponse } from "../../appointments/error-response";

import { authorizeApiProvider } from "@/lib/api-authorization";
import {
  emailLocaleFromRequest,
  notifyStudentOfBookingDecision,
} from "@/lib/email-notifications";
import { providerAppointmentReviewSchema } from "@/lib/provider-appointment";
import { reviewProviderAppointment } from "@/lib/provider-appointments";

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerAppointmentReviewSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !input.success) {
    return NextResponse.json(
      {
        error: "Invalid appointment decision",
        issues: id.success ? input.error?.issues : id.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const appointment = await reviewProviderAppointment(
      currentUser.user.id,
      id.data,
      input.data.decision,
    );
    await notifyStudentOfBookingDecision({
      appointmentId: appointment.id,
      decision: input.data.decision,
      endsAt: appointment.endsAt,
      locale: emailLocaleFromRequest(request),
      providerName:
        currentUser.provider?.displayName ||
        currentUser.user.name ||
        "Provider",
      startsAt: appointment.startsAt,
      studentEmail: appointment.studentEmail,
      studentName: appointment.studentName,
      timeZone: currentUser.provider?.timeZone || "UTC",
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}
