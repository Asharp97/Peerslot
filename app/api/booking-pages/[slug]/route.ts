import { NextResponse } from "next/server";

import { bookingSlugSchema } from "@/lib/booking-page";
import { findPublishedBookingPage } from "@/lib/booking-pages";
import { enforceRateLimit } from "@/lib/request-security";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const input = bookingSlugSchema.safeParse((await context.params).slug);

  if (!input.success) {
    return NextResponse.json(
      { error: "Booking page not found" },
      { status: 404 },
    );
  }

  const limited = await enforceRateLimit(request, "booking-page", {
    limit: 40,
    windowSeconds: 60,
    subject: input.data,
  });
  if (limited) return limited;

  const bookingPage = await findPublishedBookingPage(input.data);

  if (!bookingPage) {
    return NextResponse.json(
      { error: "Booking page not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ bookingPage });
}
