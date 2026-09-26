import { NextResponse } from "next/server";

import { availabilityWindowCreateSchema } from "@/lib/availability-window";
import {
  createAvailabilityWindow,
  listAvailabilityWindows,
} from "@/lib/availability-windows";
import { authorizeApiProvider, authorizeApiOffering } from "@/lib/api-authorization";
import { availabilityWindowErrorResponse } from "@/app/api/availability-windows/error-response";

export async function GET(request: Request) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers have availability windows",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  try {
    const windows = await listAvailabilityWindows(currentUser.user.id);

    return NextResponse.json(
      { windows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return availabilityWindowErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeApiOffering(
    request,
    "Only providers can create availability windows",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const input = availabilityWindowCreateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid availability window", issues: input.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await createAvailabilityWindow(
      currentUser.user.id,
      input.data,
    );

    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return availabilityWindowErrorResponse(error);
  }
}
