import { NextResponse } from "next/server";
import { attachAppointmentMeeting } from "@/lib/google-meet";
import { z } from "zod";

import { providerAppointmentErrorResponse } from "../error-response";

import {
  providerAppointmentDeleteSchema,
  providerAppointmentUpdateSchema,
} from "@/lib/provider-appointment";
import {
  deleteProviderAppointment,
  updateProviderAppointment,
} from "@/lib/provider-appointments";
import { authorizeApiProvider } from "@/lib/api-authorization";

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerAppointmentUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !input.success) {
    return NextResponse.json(
      {
        error: "Invalid appointment update",
        issues: !id.success
          ? id.error.issues
          : !input.success
            ? input.error.issues
            : [],
      },
      { status: 400 },
    );
  }

  try {
    let appointment = await updateProviderAppointment(
      currentUser.user.id,
      id.data,
      input.data,
    );
    appointment = await attachAppointmentMeeting(currentUser.user.id, appointment);
    return NextResponse.json({ appointment });
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerAppointmentDeleteSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success || !input.success) {
    return NextResponse.json(
      {
        error: "Invalid appointment deletion",
        issues: !id.success
          ? id.error.issues
          : !input.success
            ? input.error.issues
            : [],
      },
      { status: 400 },
    );
  }

  try {
    const result = await deleteProviderAppointment(
      currentUser.user.id,
      id.data,
      input.data,
    );
    return NextResponse.json(result);
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}
