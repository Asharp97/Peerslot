import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  appointments,
  availabilitySlots,
  availabilityWindows,
  bookingPages,
  clientRescheduleUsage,
  profiles,
  personalActivities,
  personalActivitySchedules,
  providerProfiles,
  providerStudents,
} from "@/db/schema";
import {
  avatarBelongsToUser,
  avatarKeyFromUrl,
  deleteAvatar,
} from "@/lib/avatar-storage";

export async function buildAccountExport(userId: string) {
  const hostedAppointmentQuery = db
    .select({
      id: appointments.id,
      studentId: appointments.studentId,
      providerStudentId: appointments.providerStudentId,
      startsAt: availabilitySlots.startsAt,
      endsAt: availabilitySlots.endsAt,
      status: appointments.status,
      comment: appointments.comment,
      recurrence: appointments.recurrence,
      recurrenceEndsAt: appointments.recurrenceEndsAt,
      color: appointments.color,
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
    })
    .from(appointments)
    .innerJoin(availabilitySlots, eq(appointments.slotId, availabilitySlots.id))
    .where(eq(availabilitySlots.teacherId, userId));

  const [
    identities,
    profileRows,
    providerRows,
    pageRows,
    windowRows,
    slotRows,
    studentRows,
    hostedAppointments,
    requestedAppointments,
    activityRows,
    activityScheduleRows,
    rescheduleUsage,
  ] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        offersAppointments: user.offersAppointments,
        termsAccepted: user.termsAccepted,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    db
      .select()
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, userId))
      .limit(1),
    db.select().from(bookingPages).where(eq(bookingPages.providerId, userId)),
    db
      .select({ window: availabilityWindows })
      .from(availabilityWindows)
      .innerJoin(
        bookingPages,
        eq(availabilityWindows.bookingPageId, bookingPages.id),
      )
      .where(eq(bookingPages.providerId, userId)),
    db
      .select({
        id: availabilitySlots.id,
        availabilityWindowId: availabilitySlots.availabilityWindowId,
        startsAt: availabilitySlots.startsAt,
        endsAt: availabilitySlots.endsAt,
        createdAt: availabilitySlots.createdAt,
      })
      .from(availabilitySlots)
      .where(eq(availabilitySlots.teacherId, userId)),
    db
      .select()
      .from(providerStudents)
      .where(eq(providerStudents.providerId, userId)),
    hostedAppointmentQuery,
    db
      .select({
        id: appointments.id,
        startsAt: availabilitySlots.startsAt,
        endsAt: availabilitySlots.endsAt,
        status: appointments.status,
        comment: appointments.comment,
        rescheduleCount: appointments.rescheduleCount,
        createdAt: appointments.createdAt,
        updatedAt: appointments.updatedAt,
      })
      .from(appointments)
      .innerJoin(
        availabilitySlots,
        eq(appointments.slotId, availabilitySlots.id),
      )
      .leftJoin(
        providerStudents,
        eq(providerStudents.id, appointments.providerStudentId),
      )
      .innerJoin(user, eq(user.id, userId))
      .where(
        or(
          eq(appointments.studentId, userId),
          and(
            isNull(appointments.studentId),
            eq(user.emailVerified, true),
            sql`lower(btrim(${providerStudents.email})) = lower(btrim(${user.email}))`,
          ),
        ),
      ),
    db
      .select()
      .from(personalActivities)
      .where(eq(personalActivities.providerId, userId)),
    db
      .select({ schedule: personalActivitySchedules })
      .from(personalActivitySchedules)
      .innerJoin(
        personalActivities,
        eq(personalActivities.id, personalActivitySchedules.activityId),
      )
      .where(eq(personalActivities.providerId, userId)),
    db
      .select()
      .from(clientRescheduleUsage)
      .where(
        or(
          eq(clientRescheduleUsage.providerId, userId),
          eq(clientRescheduleUsage.clientId, userId),
        ),
      ),
  ]);

  if (!identities[0]) return null;

  return {
    exportedAt: new Date().toISOString(),
    account: identities[0],
    profile: profileRows[0] ?? null,
    provider: providerRows[0] ?? null,
    bookingPages: pageRows,
    rescheduleUsage,
    availabilityWindows: windowRows.map(({ window }) => window),
    availabilitySlots: slotRows,
    providerStudents: studentRows,
    personalActivities: activityRows,
    personalActivitySchedules: activityScheduleRows.map(
      ({ schedule }) => schedule,
    ),
    appointments: {
      hosted: hostedAppointments,
      requested: requestedAppointments,
    },
  };
}

export async function permanentlyDeleteAccount(userId: string) {
  const [identity] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const providerSlotIds = db
    .select({ id: availabilitySlots.id })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.teacherId, userId));

  const [, deletedUsers] = await db.batch([
    db
      .delete(appointments)
      .where(inArray(appointments.slotId, providerSlotIds))
      .returning({ id: appointments.id }),
    db.delete(user).where(eq(user.id, userId)).returning({ id: user.id }),
  ]);

  if (deletedUsers.length > 0) {
    const key = avatarKeyFromUrl(identity?.image);
    if (key && avatarBelongsToUser(key, userId)) {
      await deleteAvatar(key).catch(() => undefined);
    }
  }

  return deletedUsers.length > 0;
}
