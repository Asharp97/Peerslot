import { bookingProviderOffersAppointments } from "@/lib/appointment-offering";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { bookingPages, providerProfiles } from "@/db/schema";
import {
  type BookingPageSettingsInput,
  withBookingSlugRetries,
} from "@/lib/booking-page";

export { BookingSlugGenerationError } from "@/lib/booking-page";

export class BookingPageNotFoundError extends Error {
  constructor() {
    super("Booking page not found");
    this.name = "BookingPageNotFoundError";
  }
}

export async function findBookingPage(providerId: string) {
  const [bookingPage] = await db
    .select()
    .from(bookingPages)
    .where(eq(bookingPages.providerId, providerId))
    .limit(1);

  return bookingPage ?? null;
}

export async function updateBookingPage(
  providerId: string,
  settings: BookingPageSettingsInput,
) {
  const [current] = await db
    .select({
      bookingPage: bookingPages,
      restBetweenSessionsMinutes: providerProfiles.restBetweenSessionsMinutes,
    })
    .from(bookingPages)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, bookingPages.providerId),
    )
    .where(eq(bookingPages.providerId, providerId))
    .limit(1);

  if (!current) {
    throw new BookingPageNotFoundError();
  }

  const { restBetweenSessionsMinutes, ...bookingPageSettings } = settings;
  const duration =
    settings.appointmentDurationMinutes ??
    current.bookingPage.appointmentDurationMinutes;
  const rest = restBetweenSessionsMinutes ?? current.restBetweenSessionsMinutes;
  const bookingIntervalMinutes = duration + rest;

  const now = new Date();
  const [, updatedPages] = await db.batch([
    db
      .update(providerProfiles)
      .set({
        ...(bookingPageSettings.timeZone !== undefined
          ? { timeZone: bookingPageSettings.timeZone }
          : {}),
        ...(bookingPageSettings.appointmentDurationMinutes !== undefined
          ? {
              defaultAppointmentDurationMinutes:
                bookingPageSettings.appointmentDurationMinutes,
            }
          : {}),
        ...(bookingPageSettings.minimumNoticeHours !== undefined
          ? {
              minimumBookingNoticeMinutes:
                bookingPageSettings.minimumNoticeHours * 60,
            }
          : {}),
        ...(restBetweenSessionsMinutes !== undefined
          ? { restBetweenSessionsMinutes }
          : {}),
        updatedAt: now,
      })
      .where(eq(providerProfiles.userId, providerId)),
    db
      .update(bookingPages)
      .set({
        ...bookingPageSettings,
        bookingIntervalMinutes,
        updatedAt: now,
      })
      .where(eq(bookingPages.providerId, providerId))
      .returning(),
  ]);
  const [bookingPage] = updatedPages;

  if (!bookingPage) {
    throw new BookingPageNotFoundError();
  }

  return bookingPage;
}

export async function regenerateBookingPageSlug(providerId: string) {
  return withBookingSlugRetries(async (slug) => {
    const [bookingPage] = await db
      .update(bookingPages)
      .set({ slug, updatedAt: new Date() })
      .where(eq(bookingPages.providerId, providerId))
      .returning();

    if (!bookingPage) {
      throw new BookingPageNotFoundError();
    }

    return bookingPage;
  });
}

export async function findPublishedBookingPage(slug: string) {
  const [bookingPage] = await db
    .select({
      slug: bookingPages.slug,
      title: bookingPages.title,
      timeZone: bookingPages.timeZone,
      appointmentDurationMinutes: bookingPages.appointmentDurationMinutes,
      bookingIntervalMinutes: bookingPages.bookingIntervalMinutes,
      minimumNoticeHours: bookingPages.minimumNoticeHours,
      provider: {
        displayName: providerProfiles.displayName,
        professionalTitle: providerProfiles.professionalTitle,
      },
    })
    .from(bookingPages)
    .innerJoin(
      providerProfiles,
      eq(providerProfiles.userId, bookingPages.providerId),
    )
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.isPublished, true), bookingProviderOffersAppointments))
    .limit(1);

  return bookingPage ?? null;
}
