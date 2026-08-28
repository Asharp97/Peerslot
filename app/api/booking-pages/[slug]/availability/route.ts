import { NextResponse } from "next/server";

import {
  AvailableTimeConfigurationError,
  AvailableTimeValidationError,
} from "@/lib/available-time";
import { bookingSlugSchema } from "@/lib/booking-page";
import { getAvailableTimesForPublishedBookingPage } from "@/lib/available-times";
import { createDateRangeSchema } from "@/lib/date-schema";
import { enforceRateLimit } from "@/lib/request-security";

const rangeSchema = createDateRangeSchema(
  45,
  "Availability range cannot exceed 45 days",
);

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const slug = bookingSlugSchema.safeParse((await context.params).slug);
  const searchParams = new URL(request.url).searchParams;
  const range = rangeSchema.safeParse({
    startsAt: searchParams.get("startsAt"),
    endsAt: searchParams.get("endsAt"),
  });

  if (!slug.success) {
    return NextResponse.json(
      { error: "Booking page not found" },
      { status: 404 },
    );
  }

  const limited = enforceRateLimit(request, "booking-availability", {
    limit: 60,
    windowSeconds: 60,
    subject: slug.data,
  });
  if (limited) return limited;

  if (!range.success) {
    return NextResponse.json(
      { error: "Invalid availability range", issues: range.error.issues },
      { status: 400 },
    );
  }

  try {
    const availability = await getAvailableTimesForPublishedBookingPage(
      slug.data,
      range.data,
    );

    if (!availability) {
      return NextResponse.json(
        { error: "Booking page not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(availability, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (
      error instanceof AvailableTimeValidationError ||
      error instanceof AvailableTimeConfigurationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}
