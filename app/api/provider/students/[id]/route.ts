import { NextResponse } from "next/server";
import { z } from "zod";

import { providerAppointmentErrorResponse } from "../../appointments/error-response";

import { providerStudentUpdateSchema } from "@/lib/provider-appointment";
import {
  deleteProviderStudent,
  updateProviderStudent,
} from "@/lib/provider-appointments";
import { authorizeApiProvider } from "@/lib/api-authorization";

const idSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = providerStudentUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!id.success || !input.success) {
    return NextResponse.json(
      { error: "Invalid student update" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      student: await updateProviderStudent(
        currentUser.user.id,
        id.data,
        input.data,
      ),
    });
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizeApiProvider(request);
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) {
    return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await deleteProviderStudent(currentUser.user.id, id.data),
    );
  } catch (error) {
    return providerAppointmentErrorResponse(error);
  }
}
