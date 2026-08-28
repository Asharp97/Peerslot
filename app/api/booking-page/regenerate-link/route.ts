import { NextResponse } from "next/server";

import {
  BookingPageNotFoundError,
  BookingSlugGenerationError,
  regenerateBookingPageSlug,
} from "@/lib/booking-pages";
import { authorizeApiProvider } from "@/lib/api-authorization";

export async function POST(request: Request) {
  const authorization = await authorizeApiProvider(
    request,
    "Only providers can regenerate booking links",
  );
  if (!authorization.authorized) return authorization.response;
  const { currentUser } = authorization;

  try {
    const bookingPage = await regenerateBookingPageSlug(currentUser.user.id);

    return NextResponse.json(
      { bookingPage },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BookingPageNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof BookingSlugGenerationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    throw error;
  }
}
