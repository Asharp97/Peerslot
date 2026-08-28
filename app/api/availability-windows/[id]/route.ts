import { NextResponse } from "next/server";
import { z } from "zod";

import { availabilityWindowUpdateSchema } from "@/lib/availability-window";
import {
  AvailabilityWindowHasAppointmentsError,
  removeAvailabilityWindow,
  updateAvailabilityWindow,
} from "@/lib/availability-windows";
import { authorizeApiProvider } from "@/lib/api-authorization";
import { availabilityWindowErrorResponse } from "@/app/api/availability-windows/error-response";

const idSchema = z.string().uuid();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers can update availability windows",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);
  const input = availabilityWindowUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!id.success) {
    return NextResponse.json(
      {
        error: "Invalid availability window id",
        issues: id.error.issues,
      },
      { status: 400 },
    );
  }

  if (!input.success) {
    return NextResponse.json(
      {
        error: "Invalid availability window update",
        issues: input.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const result = await updateAvailabilityWindow(
      id.data,
      currentUser.user.id,
      input.data,
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AvailabilityWindowHasAppointmentsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return availabilityWindowErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers can remove availability windows",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const id = idSchema.safeParse((await context.params).id);

  if (!id.success) {
    return NextResponse.json(
      { error: "Invalid availability window id", issues: id.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await removeAvailabilityWindow(id.data, currentUser.user.id);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return availabilityWindowErrorResponse(error);
  }
}
