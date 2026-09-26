import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { bookingPages, providerProfiles } from "@/db/schema";
import { withBookingSlugRetries } from "@/lib/booking-page";
import { defaultBookingTitle } from "@/lib/booking-title";
import { type ProviderOnboardingInput } from "@/lib/provider-onboarding";

type ProviderProfile = typeof providerProfiles.$inferSelect;

async function findProviderProfile(
  userId: string,
): Promise<ProviderProfile | null> {
  const [providerProfile] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);

  return providerProfile ?? null;
}

export async function grantProviderCapability(
  userId: string,
): Promise<ProviderProfile> {
  await db
    .update(user)
    .set({ offersAppointments: true })
    .where(eq(user.id, userId));
  const [createdProfile] = await db
    .insert(providerProfiles)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (createdProfile) {
    return createdProfile;
  }

  const existingProfile = await findProviderProfile(userId);

  if (!existingProfile) {
    throw new Error("Unable to create or load the provider profile.");
  }

  return existingProfile;
}

export async function findProviderSetup(userId: string) {
  const [result] = await db
    .select({
      profile: providerProfiles,
      bookingPage: bookingPages,
    })
    .from(providerProfiles)
    .leftJoin(
      bookingPages,
      eq(bookingPages.providerId, providerProfiles.userId),
    )
    .where(eq(providerProfiles.userId, userId))
    .limit(1);

  return result ?? null;
}

export async function completeProviderOnboarding(
  userId: string,
  input: ProviderOnboardingInput,
) {
  const { locale, ...profileInput } = input;
  const existing = await findProviderSetup(userId);
  const pageInput = {
    title: defaultBookingTitle(input.displayName, locale),
    timeZone: input.timeZone,
    appointmentDurationMinutes: input.defaultAppointmentDurationMinutes,
    bookingIntervalMinutes:
      input.defaultAppointmentDurationMinutes +
      input.restBetweenSessionsMinutes,
    minimumNoticeHours: input.minimumBookingNoticeMinutes / 60,
    isPublished: true,
  };
  return withBookingSlugRetries(async (slug) => {
    await db.batch([
      db
        .insert(providerProfiles)
        .values({ userId, ...profileInput, setupCompleted: true })
        .onConflictDoUpdate({
          target: providerProfiles.userId,
          set: { ...profileInput, setupCompleted: true, updatedAt: new Date() },
        }),
      db
        .insert(bookingPages)
        .values({
          providerId: userId,
          slug,
          ...pageInput,
        })
        .onConflictDoUpdate({
          target: bookingPages.providerId,
          set:
            existing?.profile.setupCompleted === false
              ? pageInput
              : { updatedAt: new Date() },
        }),
      db
        .update(user)
        .set({ name: input.displayName })
        .where(eq(user.id, userId)),
    ]);

    const setup = await findProviderSetup(userId);

    if (setup?.bookingPage) {
      return setup;
    }

    throw new Error("Unable to load the completed provider setup.");
  });
}

// Personal planning uses the same storage, but does not publish a booking page.
export async function ensurePersonalWorkspace(userId: string, name: string) {
  const existing = await findProviderSetup(userId);
  if (existing?.bookingPage) return existing;
  return withBookingSlugRetries(async (slug) => {
    await db.batch([
      db
        .insert(providerProfiles)
        .values({
          userId,
          displayName: name,
          setupCompleted: false,
        })
        .onConflictDoNothing(),
      db
        .insert(bookingPages)
        .values({
          providerId: userId,
          slug,
          title: name,
          isPublished: false,
        })
        .onConflictDoNothing({ target: bookingPages.providerId }),
    ]);
    return findProviderSetup(userId);
  });
}
