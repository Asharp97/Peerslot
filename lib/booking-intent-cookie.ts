import type { NextResponse } from "next/server";

import { bookingIntentCookieName } from "@/lib/booking-intent";

export function clearBookingIntentCookie(response: NextResponse) {
  response.cookies.set({
    name: bookingIntentCookieName,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
