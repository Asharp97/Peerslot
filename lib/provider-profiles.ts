import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { bookingPages, providerProfiles } from "@/db/schema";
import { withBookingSlugRetries } from "@/lib/booking-page";
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
  return withBookingSlugRetries(async (slug) => {
    await db.batch([
      db
        .insert(providerProfiles)
        .values({ userId, ...input })
        .onConflictDoUpdate({
          target: providerProfiles.userId,
          set: { ...input, updatedAt: new Date() },
        }),
      db
        .insert(bookingPages)
        .values({
          providerId: userId,
          slug,
          title: `Book with ${input.displayName}`,
          timeZone: input.timeZone,
          appointmentDurationMinutes: input.defaultAppointmentDurationMinutes,
          bookingIntervalMinutes:
            input.defaultAppointmentDurationMinutes +
            input.restBetweenSessionsMinutes,
          minimumNoticeHours: input.minimumBookingNoticeMinutes / 60,
          isPublished: true,
        })
        .onConflictDoNothing({ target: bookingPages.providerId }),
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
