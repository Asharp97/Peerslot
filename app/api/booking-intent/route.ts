import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { bookingPages } from "@/db/schema";
import {
  bookingIntentCookieName,
  bookingIntentLifetimeSeconds,
  createBookingIntent,
  getBookingIntentSecret,
  readBookingIntent,
  signBookingIntent,
} from "@/lib/booking-intent";
import { clearBookingIntentCookie } from "@/lib/booking-intent-cookie";
import { enforceRateLimit, requireSameOriginJson } from "@/lib/request-security";

const inputSchema = z
  .object({
    bookingPageId: z.string().uuid(),
    selectedStartTime: z.string().datetime({ offset: true }),
    locale: z.enum(["en", "tr"]),
  })
  .strict();

export async function GET(request: Request) {
  const intent = readBookingIntent(
    readCookie(request.headers.get("cookie"), bookingIntentCookieName),
    getBookingIntentSecret(),
  );

  if (!intent) {
    const response = NextResponse.json(
      { error: "Booking intent not found or expired" },
      { status: 404 },
    );
    clearBookingIntentCookie(response);
    return response;
  }

  return NextResponse.json({ intent }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const requestGuard = requireSameOriginJson(request);
  if (requestGuard) return requestGuard;
  const limited = enforceRateLimit(request, "booking-intent", {
    limit: 20,
    windowSeconds: 10 * 60,
  });
  if (limited) return limited;

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid booking intent" }, { status: 400 });
  }

  const [page] = await db
    .select({
      duration: bookingPages.appointmentDurationMinutes,
      slug: bookingPages.slug,
    })
    .from(bookingPages)
    .where(
      and(
        eq(bookingPages.id, input.data.bookingPageId),
        eq(bookingPages.isPublished, true),
      ),
    )
    .limit(1);

  if (!page) {
    return NextResponse.json({ error: "Booking page not found" }, { status: 404 });
  }

  const startsAt = new Date(input.data.selectedStartTime);
  const intent = createBookingIntent({
    bookingPageId: input.data.bookingPageId,
    selectedStartTime: startsAt.toISOString(),
    selectedEndTime: new Date(
      startsAt.getTime() + page.duration * 60_000,
    ).toISOString(),
    locale: input.data.locale,
  });
  const response = NextResponse.json(
    {
      intent,
      returnPath: `/${input.data.locale}/book/${page.slug}?booking=resume`,
    },
    { status: 201 },
  );
  response.cookies.set({
    name: bookingIntentCookieName,
    value: signBookingIntent(intent, getBookingIntentSecret()),
    httpOnly: true,
    maxAge: bookingIntentLifetimeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  clearBookingIntentCookie(response);
  return response;
}

function readCookie(header: string | null, name: string) {
  return header
    ?.split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([cookieName]) => cookieName === name)
    ?.slice(1)
    .join("=");
}
