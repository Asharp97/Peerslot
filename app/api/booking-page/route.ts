import { NextResponse } from "next/server";

import { bookingPageSettingsSchema } from "@/lib/booking-page";
import {
  BookingPageNotFoundError,
  findBookingPage,
  updateBookingPage,
} from "@/lib/booking-pages";
import { authorizeApiProvider } from "@/lib/api-authorization";

export async function GET(request: Request) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers have booking pages",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const bookingPage = await findBookingPage(currentUser.user.id);

  if (!bookingPage) {
    return NextResponse.json(
      { error: "Booking page not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { bookingPage },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers can update booking pages",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  const input = bookingPageSettingsSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid booking page settings", issues: input.error.issues },
      { status: 400 },
    );
  }

  try {
    const bookingPage = await updateBookingPage(
      currentUser.user.id,
      input.data,
    );

    return NextResponse.json(
      { bookingPage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BookingPageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    throw error;
  }
}
